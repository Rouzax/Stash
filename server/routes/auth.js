import { db } from '../db.js';
import {
  hashPassword, verifyPassword, createSession, deleteSession,
  setSessionCookie, clearSessionCookie, getSessionFromRequest,
  requireAuth, requireAdmin, requireSuperadmin, COOKIE_NAME
} from '../auth.js';
import { nonEmptyString, optionalString, hexColor, emailAddress, inviteCode, LIMITS } from '../validation.js';
import crypto from 'node:crypto';

const validatePassword = (password) => {
  if (typeof password !== 'string') return { ok: false, error: 'password required' };
  if (password.length < 8) return { ok: false, error: 'password must be at least 8 characters' };
  if (password.length > LIMITS.password) return { ok: false, error: 'password too long' };
  return { ok: true, value: password };
};

export default async function authRoutes(app) {
  // Login (rate-limited to mitigate brute force)
  app.post('/api/auth/login', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' }
    }
  }, async (request, reply) => {
    const { username, password } = request.body || {};
    const u = nonEmptyString(username, LIMITS.username);
    if (!u || typeof password !== 'string' || !password) {
      return reply.code(400).send({ error: 'username and password required' });
    }
    const user = db.prepare(
      'SELECT id, username, password_hash, is_admin, is_superadmin, family_id, email, emoji, color FROM users WHERE username = ?'
    ).get(u);
    if (!user) {
      await hashPassword('dummy-password-for-timing');
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    const family = db.prepare('SELECT name FROM families WHERE id = ?').get(user.family_id);
    const session = createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt);
    return {
      id: user.id, username: user.username, is_admin: !!user.is_admin,
      is_superadmin: !!user.is_superadmin,
      family_id: user.family_id, family_name: family?.name,
      email: user.email, emoji: user.emoji, color: user.color
    };
  });

  // Logout
  app.post('/api/auth/logout', async (request, reply) => {
    const cookie = request.cookies[COOKIE_NAME];
    if (cookie) {
      const unsigned = request.unsignCookie(cookie);
      if (unsigned.valid) {
        deleteSession(unsigned.value);
      }
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  // Current user
  app.get('/api/auth/me', async (request, reply) => {
    const session = getSessionFromRequest(request);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    return {
      id: session.user_id,
      username: session.username,
      is_admin: !!session.is_admin,
      is_superadmin: !!session.is_superadmin,
      family_id: session.family_id,
      family_name: session.family_name,
      email: session.email,
      emoji: session.emoji,
      color: session.color,
      rush_reset_at: session.rush_reset_at || 0
    };
  });

  // Bootstrap status
  app.get('/api/auth/bootstrap', async () => {
    const row = db.prepare('SELECT COUNT(*) as n FROM users').get();
    return { needs_bootstrap: row.n === 0 };
  });

  // Bootstrap: create first family + admin user
  app.post('/api/auth/bootstrap', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' }
    }
  }, async (request, reply) => {
    const familyName = nonEmptyString(request.body?.family_name, LIMITS.familyName);
    if (!familyName) {
      return reply.code(400).send({ error: 'family name required' });
    }
    const u = nonEmptyString(request.body?.username, LIMITS.username);
    if (!u) {
      return reply.code(400).send({ error: 'username required' });
    }
    const pw = validatePassword(request.body?.password);
    if (!pw.ok) return reply.code(400).send({ error: pw.error });

    const email = emailAddress(request.body?.email);
    const userEmoji = optionalString(request.body?.emoji, LIMITS.emoji, '😎') || '😎';
    const hash = await hashPassword(pw.value);
    const txn = db.transaction(() => {
      const row = db.prepare('SELECT COUNT(*) as n FROM users').get();
      if (row.n > 0) return { blocked: true };
      const now = Date.now();
      const family = db.prepare(
        'INSERT INTO families (name, created_at) VALUES (?, ?)'
      ).run(familyName, now);
      const user = db.prepare(`
        INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, created_at)
        VALUES (?, ?, ?, 1, 1, ?, ?, '#ff10f0', ?)
      `).run(u, hash, family.lastInsertRowid, email, userEmoji, now);
      return { familyId: family.lastInsertRowid, userId: user.lastInsertRowid };
    });

    let result;
    try {
      result = txn();
    } catch (e) {
      return reply.code(409).send({ error: 'username already taken' });
    }
    if (result.blocked) {
      return reply.code(403).send({ error: 'bootstrap already complete' });
    }
    const session = createSession(result.userId);
    setSessionCookie(reply, session.id, session.expiresAt);
    return {
      id: result.userId, username: u, is_admin: true, is_superadmin: true,
      family_id: result.familyId, family_name: familyName,
      email, emoji: userEmoji, color: '#ff10f0'
    };
  });

  // Admin: list users in the same family
  app.get('/api/auth/users', { preHandler: requireAdmin }, async (request) => {
    return db.prepare(`
      SELECT id, username, is_admin, email, emoji, color, created_at
      FROM users WHERE family_id = ? ORDER BY created_at ASC LIMIT 1000
    `).all(request.session.family_id).map(u => ({ ...u, is_admin: !!u.is_admin }));
  });

  // Admin: create user in the same family
  app.post('/api/auth/users', { preHandler: requireAdmin }, async (request, reply) => {
    const u = nonEmptyString(request.body?.username, LIMITS.username);
    if (!u) {
      return reply.code(400).send({ error: 'username required' });
    }
    const pw = validatePassword(request.body?.password);
    if (!pw.ok) return reply.code(400).send({ error: pw.error });
    const isAdmin = !!request.body?.is_admin;
    const email = emailAddress(request.body?.email);
    const emoji = optionalString(request.body?.emoji, LIMITS.emoji, '😎') || '😎';
    const color = hexColor(request.body?.color, '#ff10f0');

    const hash = await hashPassword(pw.value);
    let result;
    try {
      result = db.prepare(`
        INSERT INTO users (username, password_hash, family_id, is_admin, email, emoji, color, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(u, hash, request.session.family_id, isAdmin ? 1 : 0, email, emoji, color, Date.now());
    } catch (e) {
      return reply.code(409).send({ error: 'username already taken' });
    }
    return {
      id: result.lastInsertRowid,
      username: u,
      is_admin: isAdmin,
      email, emoji, color,
      created_at: Date.now()
    };
  });

  // Admin: delete user (must be same family, cannot delete self)
  app.delete('/api/auth/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'invalid id' });
    }
    if (id === request.session.user_id) {
      return reply.code(400).send({ error: 'cannot delete yourself' });
    }
    const result = db.prepare(
      'DELETE FROM users WHERE id = ? AND family_id = ?'
    ).run(id, request.session.family_id);
    if (result.changes === 0) {
      return reply.code(404).send({ error: 'not found' });
    }
    return { ok: true };
  });

  // Change own password
  app.post('/api/auth/password', {
    preHandler: requireAuth,
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' }
    }
  }, async (request, reply) => {
    const { current_password, new_password } = request.body || {};
    if (typeof current_password !== 'string' || !current_password) {
      return reply.code(400).send({ error: 'current password required' });
    }
    const pw = validatePassword(new_password);
    if (!pw.ok) return reply.code(400).send({ error: pw.error });

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(request.session.user_id);
    const ok = await verifyPassword(user.password_hash, current_password);
    if (!ok) {
      return reply.code(401).send({ error: 'current password incorrect' });
    }
    const hash = await hashPassword(pw.value);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hash, request.session.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(
      request.session.user_id,
      request.session.id
    );
    return { ok: true };
  });

  // Update own profile — only emoji, color, email are mutable
  app.patch('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const { emoji: rawEmoji, color: rawColor, email: rawEmail } = request.body || {};
    const emoji = rawEmoji !== undefined ? optionalString(rawEmoji, LIMITS.emoji, null) : null;
    const color = rawColor !== undefined ? hexColor(rawColor, null) : null;
    const email = rawEmail !== undefined ? emailAddress(rawEmail) : undefined;

    const updates = [];
    const params = [];
    if (emoji !== null) { updates.push('emoji = ?'); params.push(emoji); }
    if (color !== null) { updates.push('color = ?'); params.push(color); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (updates.length === 0) return reply.code(400).send({ error: 'nothing to update' });

    params.push(request.session.user_id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare(
      'SELECT id, username, is_admin, family_id, email, emoji, color FROM users WHERE id = ?'
    ).get(request.session.user_id);
    const family = db.prepare('SELECT name FROM families WHERE id = ?').get(user.family_id);
    return {
      id: user.id, username: user.username, is_admin: !!user.is_admin,
      family_id: user.family_id, family_name: family?.name,
      email: user.email, emoji: user.emoji, color: user.color
    };
  });

  // Register: create account + join family (via invite) or create new family
  app.post('/api/auth/register', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' }
    }
  }, async (request, reply) => {
    const u = nonEmptyString(request.body?.username, LIMITS.username);
    if (!u) return reply.code(400).send({ error: 'username required' });
    const pw = validatePassword(request.body?.password);
    if (!pw.ok) return reply.code(400).send({ error: pw.error });

    const code = inviteCode(request.body?.invite_code);
    if (!code) {
      return reply.code(400).send({ error: 'invite code required' });
    }

    const email = emailAddress(request.body?.email);
    const userEmoji = optionalString(request.body?.emoji, LIMITS.emoji, '😎') || '😎';
    const hash = await hashPassword(pw.value);
    const now = Date.now();

    const familyName = nonEmptyString(request.body?.family_name, LIMITS.familyName);

    const txn = db.transaction(() => {
      const invite = db.prepare(
        'SELECT id, family_id, max_uses, use_count, is_family_starter, expires_at FROM invite_codes WHERE code = ?'
      ).get(code);
      if (!invite || invite.expires_at < now || (invite.max_uses > 0 && invite.use_count >= invite.max_uses)) {
        return { error: 'invalid or expired invite code' };
      }

      let familyId, isAdmin;
      if (invite.is_family_starter) {
        if (!familyName) return { error: 'family name required for this invite code' };
        const family = db.prepare('INSERT INTO families (name, created_at) VALUES (?, ?)').run(familyName, now);
        familyId = family.lastInsertRowid;
        isAdmin = 1;
      } else {
        familyId = invite.family_id;
        isAdmin = 0;
      }

      const userResult = db.prepare(`
        INSERT INTO users (username, password_hash, family_id, is_admin, email, emoji, color, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '#ff10f0', ?)
      `).run(u, hash, familyId, isAdmin, email, userEmoji, now);
      db.prepare('UPDATE invite_codes SET use_count = use_count + 1 WHERE id = ?').run(invite.id);

      const family = db.prepare('SELECT name FROM families WHERE id = ?').get(familyId);
      return {
        userId: userResult.lastInsertRowid, familyId, familyName: family?.name,
        isAdmin: !!isAdmin, isSuperadmin: false
      };
    });

    let result;
    try {
      result = txn();
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return reply.code(409).send({ error: 'username already taken' });
      throw e;
    }
    if (result.error) return reply.code(400).send({ error: result.error });

    const session = createSession(result.userId);
    setSessionCookie(reply, session.id, session.expiresAt);
    return {
      id: result.userId, username: u, is_admin: result.isAdmin, is_superadmin: false,
      family_id: result.familyId, family_name: result.familyName,
      email, emoji: userEmoji, color: '#ff10f0'
    };
  });

  // Admin: generate invite code (family admins create member invites, superadmin can also create family starters)
  app.post('/api/auth/invites', { preHandler: requireAdmin }, async (request) => {
    const rawUses = Number(request.body?.max_uses);
    const maxUses = Number.isFinite(rawUses) ? Math.max(0, Math.floor(rawUses)) : 1;
    const expiresHours = Math.max(1, Math.min(168, Math.floor(Number(request.body?.expires_hours) || 24)));
    const isFamilyStarter = !!request.body?.is_family_starter && !!request.session.is_superadmin;
    const now = Date.now();
    const expiresAt = now + expiresHours * 60 * 60 * 1000;

    const generateCode = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = crypto.randomBytes(8);
      let code = '';
      for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length];
      return code;
    };

    let code, attempts = 0;
    while (attempts < 10) {
      code = generateCode();
      const exists = db.prepare('SELECT id FROM invite_codes WHERE code = ?').get(code);
      if (!exists) break;
      attempts++;
    }

    const result = db.prepare(`
      INSERT INTO invite_codes (code, family_id, created_by, max_uses, use_count, is_family_starter, expires_at, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `).run(code, request.session.family_id, request.session.user_id, maxUses, isFamilyStarter ? 1 : 0, expiresAt, now);

    return { id: result.lastInsertRowid, code, max_uses: maxUses, use_count: 0, is_family_starter: isFamilyStarter, expires_at: expiresAt };
  });

  // Admin: list active invite codes for this family
  app.get('/api/auth/invites', { preHandler: requireAdmin }, async (request) => {
    const normalize = (rows) => rows.map(r => ({ ...r, is_family_starter: !!r.is_family_starter }));

    const familyCodes = db.prepare(`
      SELECT id, code, max_uses, use_count, is_family_starter, expires_at, created_at
      FROM invite_codes
      WHERE family_id = ? AND is_family_starter = 0 AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(request.session.family_id, Date.now());

    if (request.session.is_superadmin) {
      const starterCodes = db.prepare(`
        SELECT id, code, max_uses, use_count, is_family_starter, expires_at, created_at
        FROM invite_codes
        WHERE is_family_starter = 1 AND expires_at > ?
        ORDER BY created_at DESC
        LIMIT 100
      `).all(Date.now());
      return normalize([...familyCodes, ...starterCodes]);
    }

    return normalize(familyCodes);
  });

  // Admin: revoke invite code
  app.delete('/api/auth/invites/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'invalid id' });
    const result = db.prepare(
      'DELETE FROM invite_codes WHERE id = ? AND family_id = ?'
    ).run(id, request.session.family_id);
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
