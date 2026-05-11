import { db } from '../db.js';
import {
  hashPassword, verifyPassword, createSession, deleteSession,
  setSessionCookie, clearSessionCookie, getSessionFromRequest,
  requireAuth, requireAdmin, requireSuperadmin, COOKIE_NAME
} from '../auth.js';
import { nonEmptyString, optionalString, hexColor, emailAddress, inviteCode, LIMITS } from '../validation.js';
import { sendPasswordReset } from '../email.js';
import crypto from 'node:crypto';

const validatePassword = (password) => {
  if (typeof password !== 'string') return { ok: false, error: 'password required' };
  if (password.length < 8) return { ok: false, error: 'password must be at least 8 characters' };
  if (password.length > LIMITS.password) return { ok: false, error: 'password too long' };
  return { ok: true, value: password };
};

const LOGIN_RATE_LIMIT = Number(process.env.LOGIN_RATE_LIMIT) || 5;

export default async function authRoutes(app) {
  // Login (rate-limited to mitigate brute force)
  app.post('/api/auth/login', {
    config: {
      rateLimit: { max: LOGIN_RATE_LIMIT, timeWindow: '1 minute' }
    }
  }, async (request, reply) => {
    const { username, password } = request.body || {};
    const u = nonEmptyString(username, LIMITS.username);
    if (!u || typeof password !== 'string' || !password) {
      return reply.code(400).send({ error: 'username and password required' });
    }
    const user = db.prepare(
      'SELECT id, username, password_hash, is_admin, is_superadmin, family_id, email, emoji, color, exact_dates, show_background FROM users WHERE username = ? COLLATE NOCASE'
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
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
    return {
      id: user.id, username: user.username, is_admin: !!user.is_admin,
      is_superadmin: !!user.is_superadmin,
      family_id: user.family_id, family_name: family?.name,
      email: user.email, emoji: user.emoji, color: user.color,
      exact_dates: !!user.exact_dates,
      show_background: user.show_background !== 0
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
      rush_reset_at: session.rush_reset_at || 0,
      exact_dates: !!session.exact_dates,
      show_background: session.show_background !== 0
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
      SELECT id, username, is_admin, email, emoji, color, last_login_at, created_at
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

  // Admin: delete user (same family, or any family for superadmin)
  app.delete('/api/auth/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'invalid id' });
    }
    if (id === request.session.user_id) {
      return reply.code(400).send({ error: 'cannot delete yourself' });
    }
    let result;
    if (request.session.is_superadmin) {
      const target = db.prepare('SELECT is_superadmin FROM users WHERE id = ?').get(id);
      if (target?.is_superadmin) {
        const count = db.prepare('SELECT COUNT(*) as n FROM users WHERE is_superadmin = 1').get().n;
        if (count <= 1) {
          return reply.code(400).send({ error: 'cannot delete the last superadmin' });
        }
      }
      result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    } else {
      result = db.prepare(
        'DELETE FROM users WHERE id = ? AND family_id = ?'
      ).run(id, request.session.family_id);
    }
    if (result.changes === 0) {
      return reply.code(404).send({ error: 'not found' });
    }
    return { ok: true };
  });

  // Admin: update user (toggle admin, reset password)
  app.patch('/api/auth/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'invalid id' });
    }

    const target = db.prepare('SELECT id, family_id, is_admin FROM users WHERE id = ?').get(id);
    if (!target) {
      return reply.code(404).send({ error: 'not found' });
    }
    if (target.family_id !== request.session.family_id && !request.session.is_superadmin) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const { is_admin, password } = request.body || {};
    if (is_admin === undefined && !password) {
      return reply.code(400).send({ error: 'nothing to update' });
    }

    const updates = [];
    const params = [];

    if (is_admin !== undefined) {
      if (id === request.session.user_id) {
        return reply.code(400).send({ error: 'cannot change your own admin status' });
      }
      if (!is_admin) {
        const adminCount = db.prepare(
          'SELECT COUNT(*) as n FROM users WHERE family_id = ? AND is_admin = 1'
        ).get(target.family_id).n;
        if (adminCount <= 1) {
          return reply.code(400).send({ error: 'cannot remove the last admin' });
        }
      }
      updates.push('is_admin = ?');
      params.push(is_admin ? 1 : 0);
    }

    if (password) {
      const pw = validatePassword(password);
      if (!pw.ok) return reply.code(400).send({ error: pw.error });
      const hash = await hashPassword(pw.value);
      updates.push('password_hash = ?');
      params.push(hash);
    }

    params.push(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    if (is_admin !== undefined || password) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }

    return { ok: true };
  });

  // Superadmin: toggle superadmin on another user
  app.patch('/api/auth/users/:id/superadmin', { preHandler: requireSuperadmin }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'invalid id' });
    }
    const { is_superadmin } = request.body || {};
    if (is_superadmin === undefined) {
      return reply.code(400).send({ error: 'is_superadmin required' });
    }

    if (!is_superadmin && id === request.session.user_id) {
      const count = db.prepare('SELECT COUNT(*) as n FROM users WHERE is_superadmin = 1').get().n;
      if (count <= 1) {
        return reply.code(400).send({ error: 'cannot remove the last superadmin' });
      }
    }

    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!target) {
      return reply.code(404).send({ error: 'not found' });
    }

    db.prepare('UPDATE users SET is_superadmin = ? WHERE id = ?').run(is_superadmin ? 1 : 0, id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return { ok: true };
  });

  // Superadmin: list all users across all families
  app.get('/api/auth/users/all', { preHandler: requireSuperadmin }, async () => {
    return db.prepare(`
      SELECT u.id, u.username, u.is_admin, u.is_superadmin, u.family_id,
             u.email, u.emoji, u.color, u.last_login_at, u.created_at,
             f.name AS family_name
      FROM users u
      JOIN families f ON f.id = u.family_id
      ORDER BY u.created_at ASC
      LIMIT 10000
    `).all().map(u => ({
      ...u,
      is_admin: !!u.is_admin,
      is_superadmin: !!u.is_superadmin
    }));
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

  // Update own profile
  app.patch('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const { emoji: rawEmoji, color: rawColor, email: rawEmail, exact_dates: rawExactDates, show_background: rawShowBg } = request.body || {};
    const emoji = rawEmoji !== undefined ? optionalString(rawEmoji, LIMITS.emoji, null) : null;
    const color = rawColor !== undefined ? hexColor(rawColor, null) : null;
    const email = rawEmail !== undefined ? emailAddress(rawEmail) : undefined;
    const exactDates = rawExactDates !== undefined ? (rawExactDates ? 1 : 0) : undefined;
    const showBackground = rawShowBg !== undefined ? (rawShowBg ? 1 : 0) : undefined;

    const updates = [];
    const params = [];
    if (emoji !== null) { updates.push('emoji = ?'); params.push(emoji); }
    if (color !== null) { updates.push('color = ?'); params.push(color); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (exactDates !== undefined) { updates.push('exact_dates = ?'); params.push(exactDates); }
    if (showBackground !== undefined) { updates.push('show_background = ?'); params.push(showBackground); }
    if (updates.length === 0) return reply.code(400).send({ error: 'nothing to update' });

    params.push(request.session.user_id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare(
      'SELECT id, username, is_admin, is_superadmin, family_id, email, emoji, color, rush_reset_at, exact_dates, show_background FROM users WHERE id = ?'
    ).get(request.session.user_id);
    const family = db.prepare('SELECT name FROM families WHERE id = ?').get(user.family_id);
    return {
      id: user.id, username: user.username, is_admin: !!user.is_admin,
      is_superadmin: !!user.is_superadmin,
      family_id: user.family_id, family_name: family?.name,
      rush_reset_at: user.rush_reset_at || 0,
      email: user.email, emoji: user.emoji, color: user.color,
      exact_dates: !!user.exact_dates,
      show_background: user.show_background !== 0
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

  // Check invite code validity (unauthenticated, for two-step registration)
  app.post('/api/auth/invite-check', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' }
    }
  }, async (request, reply) => {
    const code = inviteCode(request.body?.code);
    if (!code) {
      return reply.code(400).send({ valid: false });
    }
    const now = Date.now();
    const invite = db.prepare(
      'SELECT family_id, max_uses, use_count, is_family_starter, expires_at FROM invite_codes WHERE code = ?'
    ).get(code);

    if (!invite || invite.expires_at < now || (invite.max_uses > 0 && invite.use_count >= invite.max_uses)) {
      return { valid: false };
    }

    if (invite.is_family_starter) {
      return { valid: true, is_family_starter: true };
    }

    const family = db.prepare('SELECT name FROM families WHERE id = ?').get(invite.family_id);
    return { valid: true, is_family_starter: false, family_name: family?.name || 'Unknown' };
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
      let code = '';
      for (let i = 0; i < 8; i++) {
        let byte;
        do { byte = crypto.randomBytes(1)[0]; } while (byte >= 248);
        code += chars[byte % chars.length];
      }
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

  // Admin: revoke invite code (same family, or any family for superadmin)
  app.delete('/api/auth/invites/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'invalid id' });
    let result;
    if (request.session.is_superadmin) {
      result = db.prepare('DELETE FROM invite_codes WHERE id = ?').run(id);
    } else {
      result = db.prepare(
        'DELETE FROM invite_codes WHERE id = ? AND family_id = ?'
      ).run(id, request.session.family_id);
    }
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  // Forgot password: generate token and send reset email
  app.post('/api/auth/forgot-password', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } }
  }, async (request) => {
    const username = nonEmptyString(request.body?.username, LIMITS.username);
    if (!username) return { ok: true };

    const user = db.prepare('SELECT id, username, email FROM users WHERE username = ? COLLATE NOCASE').get(username);
    if (user?.email) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 60 * 60 * 1000;
      db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

      const baseUrl = process.env.APP_URL || `${request.protocol}://${request.hostname}`;
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      sendPasswordReset(user, resetUrl);
    }

    return { ok: true };
  });

  // Reset password: validate token and set new password
  app.post('/api/auth/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const token = nonEmptyString(request.body?.token, 128);
    if (!token) return reply.code(400).send({ error: 'token required' });

    const pw = validatePassword(request.body?.new_password);
    if (!pw.ok) return reply.code(400).send({ error: pw.error });

    const row = db.prepare('SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token = ?').get(token);
    if (!row || row.used || row.expires_at < Date.now()) {
      return reply.code(400).send({ error: 'invalid or expired token' });
    }

    const hash = await hashPassword(pw.value);
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(row.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    })();

    return { ok: true };
  });
}
