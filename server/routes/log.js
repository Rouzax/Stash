import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

export default async function logRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/log', async (request) => {
    const reqDays = Number(request.query.days);
    const days = Number.isFinite(reqDays)
      ? Math.min(400, Math.max(1, Math.floor(reqDays)))
      : 7;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return db.prepare(`
      SELECT id, user_id, item_id, delta, ts,
             snap_rush_factor, snap_portion_size, snap_onset_minutes, snap_decay_minutes
      FROM consumption_log
      WHERE user_id = ? AND ts >= ?
      ORDER BY ts ASC
      LIMIT 50000
    `).all(request.session.user_id, since);
  });

  app.get('/api/log/family', { preHandler: requireAdmin }, async (request) => {
    const limit = Math.min(100, Math.max(1, Math.floor(Number(request.query.limit)) || 50));
    const before = Number(request.query.before) || Date.now() + 1;
    const userId = Number(request.query.user_id) || null;
    const itemId = Number(request.query.item_id) || null;

    let where = 'cl.family_id = ? AND cl.ts < ?';
    const params = [request.session.family_id, before];

    if (userId) {
      where += ' AND cl.user_id = ?';
      params.push(userId);
    }
    if (itemId) {
      where += ' AND cl.item_id = ?';
      params.push(itemId);
    }

    params.push(limit + 1);

    const rows = db.prepare(`
      SELECT cl.id, cl.user_id, cl.item_id, cl.delta, cl.ts,
             u.username, u.emoji AS user_emoji,
             i.name AS item_name, i.emoji AS item_emoji, i.unit AS item_unit,
             i.deleted_at AS item_deleted_at
      FROM consumption_log cl
      JOIN users u ON u.id = cl.user_id
      JOIN items i ON i.id = cl.item_id
      WHERE ${where}
      ORDER BY cl.ts DESC
      LIMIT ?
    `).all(...params);

    const has_more = rows.length > limit;
    if (has_more) rows.pop();

    return { entries: rows, has_more };
  });

  app.post('/api/log/clear', async (request) => {
    db.prepare('DELETE FROM consumption_log WHERE user_id = ?')
      .run(request.session.user_id);
    return { ok: true };
  });

  app.post('/api/log/reset-rush', async (request) => {
    const now = Date.now();
    db.prepare('UPDATE users SET rush_reset_at = ? WHERE id = ?')
      .run(now, request.session.user_id);
    return { ok: true, rush_reset_at: now };
  });
}
