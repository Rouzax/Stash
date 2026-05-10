import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { sendTestEmail } from '../email.js';

export default async function notificationRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/notifications/preferences', async (request) => {
    const row = db.prepare(
      'SELECT low_stock, weekly_digest, rush_warning FROM notification_preferences WHERE user_id = ?'
    ).get(request.session.user_id);
    return row || { low_stock: 0, weekly_digest: 0, rush_warning: 0 };
  });

  app.put('/api/notifications/preferences', async (request) => {
    const parse01 = (v) => (v === 1 || v === true) ? 1 : 0;
    const low_stock = parse01(request.body?.low_stock);
    const weekly_digest = parse01(request.body?.weekly_digest);
    const rush_warning = parse01(request.body?.rush_warning);

    db.prepare(`
      INSERT INTO notification_preferences (user_id, low_stock, weekly_digest, rush_warning)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        low_stock = excluded.low_stock,
        weekly_digest = excluded.weekly_digest,
        rush_warning = excluded.rush_warning
    `).run(request.session.user_id, low_stock, weekly_digest, rush_warning);

    return { low_stock, weekly_digest, rush_warning };
  });

  app.post('/api/notifications/test', async (request, reply) => {
    const email = request.session.email;
    if (!email) {
      return reply.code(400).send({ error: 'no email address on your account' });
    }
    try {
      await sendTestEmail(email);
      return { ok: true };
    } catch (e) {
      return reply.code(500).send({ error: e.message });
    }
  });
}
