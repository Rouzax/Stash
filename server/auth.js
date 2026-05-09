import argon2 from 'argon2';
import crypto from 'node:crypto';
import { db } from './db.js';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const COOKIE_NAME = 'stash_sid';

export async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_MS;
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, expiresAt, now);
  return { id, expiresAt };
}

export function getSession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare(`
    SELECT s.id, s.user_id, s.expires_at,
           u.username, u.is_admin, u.family_id, u.email, u.emoji, u.color, u.rush_reset_at,
           f.name AS family_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN families f ON f.id = u.family_id
    WHERE s.id = ? AND s.expires_at > ?
  `).get(sessionId, Date.now());
  return row || null;
}

export function deleteSession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function setSessionCookie(reply, sessionId, expiresAt) {
  const behindProxy = process.env.BEHIND_PROXY === 'true';
  reply.setCookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: behindProxy,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
    signed: true
  });
}

export function clearSessionCookie(reply) {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function getSessionFromRequest(request) {
  const cookie = request.cookies[COOKIE_NAME];
  if (!cookie) return null;
  const unsigned = request.unsignCookie(cookie);
  if (!unsigned.valid) return null;
  return getSession(unsigned.value);
}

export async function requireAuth(request, reply) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  request.session = session;
}

export async function requireAdmin(request, reply) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  if (!session.is_admin) {
    return reply.code(403).send({ error: 'forbidden' });
  }
  request.session = session;
}
