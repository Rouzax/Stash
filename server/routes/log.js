import { db } from '../db.js';
import { requireAuth } from '../auth.js';

export default async function logRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/log', async (request) => {
    const reqDays = Number(request.query.days);
    const days = Number.isFinite(reqDays)
      ? Math.min(400, Math.max(1, Math.floor(reqDays)))
      : 7;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return db.prepare(`
      SELECT id, user_id, item_id, delta, ts FROM consumption_log
      WHERE user_id = ? AND ts >= ?
      ORDER BY ts ASC
      LIMIT 50000
    `).all(request.session.user_id, since);
  });

  app.post('/api/log/reset-rush', async (request) => {
    const now = Date.now();
    db.prepare('UPDATE users SET rush_reset_at = ? WHERE id = ?')
      .run(now, request.session.user_id);
    return { ok: true, rush_reset_at: now };
  });
}
