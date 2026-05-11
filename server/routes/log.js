import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { validId, giveRecipient } from '../validation.js';

export default async function logRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/log', async (request) => {
    const reqDays = Number(request.query.days);
    const days = Number.isFinite(reqDays)
      ? Math.max(1, Math.floor(reqDays))
      : 7;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return db.prepare(`
      SELECT id, user_id, item_id, delta, ts,
             snap_rush_factor, snap_portion_size, snap_onset_minutes, snap_decay_minutes,
             is_give, give_recipient
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
             cl.is_give, cl.give_recipient,
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

  app.post('/api/log', async (request, reply) => {
    const itemId = validId(request.body?.item_id);
    if (!itemId) return reply.code(400).send({ error: 'invalid item_id' });
    const delta = Number(request.body?.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      return reply.code(400).send({ error: 'invalid delta' });
    }
    const ts = Number(request.body?.ts);
    if (!Number.isFinite(ts) || ts <= 0 || ts > Date.now() + 60000) {
      return reply.code(400).send({ error: 'invalid timestamp' });
    }

    const item = db.prepare(
      'SELECT * FROM items WHERE id = ? AND family_id = ? AND deleted_at IS NULL'
    ).get(itemId, request.session.family_id);
    if (!item) return reply.code(404).send({ error: 'item not found' });

    const isGive = request.body?.is_give ? 1 : 0;
    const recipient = isGive ? giveRecipient(request.body?.give_recipient) : null;
    const snapRf = (delta < 0 && !isGive) ? item.rush_factor : null;
    const snapPs = (delta < 0 && !isGive) ? item.portion_size : null;
    const snapOm = (delta < 0 && !isGive) ? item.onset_minutes : null;
    const snapDm = (delta < 0 && !isGive) ? item.decay_minutes : null;

    const result = db.prepare(
      'INSERT INTO consumption_log (user_id, family_id, item_id, delta, ts, snap_rush_factor, snap_portion_size, snap_onset_minutes, snap_decay_minutes, is_give, give_recipient) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(request.session.user_id, request.session.family_id, itemId, delta, Math.floor(ts), snapRf, snapPs, snapOm, snapDm, isGive, recipient);

    return db.prepare(
      'SELECT id, user_id, item_id, delta, ts, snap_rush_factor, snap_portion_size, snap_onset_minutes, snap_decay_minutes, is_give, give_recipient FROM consumption_log WHERE id = ?'
    ).get(result.lastInsertRowid);
  });

  app.patch('/api/log/:id', async (request, reply) => {
    const id = validId(request.params.id);
    if (!id) return reply.code(400).send({ error: 'invalid id' });

    const entry = db.prepare(
      'SELECT * FROM consumption_log WHERE id = ? AND user_id = ?'
    ).get(id, request.session.user_id);
    if (!entry) return reply.code(404).send({ error: 'not found' });

    let newDelta = entry.delta;
    let newTs = entry.ts;

    if (request.body?.delta !== undefined) {
      const d = Number(request.body.delta);
      if (!Number.isFinite(d) || d === 0) {
        return reply.code(400).send({ error: 'invalid delta' });
      }
      newDelta = d;
    }
    if (request.body?.ts !== undefined) {
      const t = Number(request.body.ts);
      if (!Number.isFinite(t) || t <= 0 || t > Date.now() + 60000) {
        return reply.code(400).send({ error: 'invalid timestamp' });
      }
      newTs = Math.floor(t);
    }

    db.prepare(
      'UPDATE consumption_log SET delta = ?, ts = ? WHERE id = ? AND user_id = ?'
    ).run(newDelta, newTs, id, request.session.user_id);

    return db.prepare(
      'SELECT id, user_id, item_id, delta, ts, snap_rush_factor, snap_portion_size, snap_onset_minutes, snap_decay_minutes, is_give, give_recipient FROM consumption_log WHERE id = ?'
    ).get(id);
  });

  app.delete('/api/log/:id', async (request, reply) => {
    const id = validId(request.params.id);
    if (!id) return reply.code(400).send({ error: 'invalid id' });
    const result = db.prepare(
      'DELETE FROM consumption_log WHERE id = ? AND user_id = ?'
    ).run(id, request.session.user_id);
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
