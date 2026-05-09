import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  nonEmptyString, optionalString, hexColor, unitValue,
  nonNegativeNumber, rushFactor, onsetMinutes, decayMinutes, LIMITS
} from '../validation.js';
import { sendLowStockAlert, sendRushWarning } from '../email.js';

const ITEM_COLUMNS = 'id, name, emoji, color, unit, count, threshold, portion_size, rush_factor, onset_minutes, decay_minutes, position, created_at, updated_at';

const validId = (raw) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default async function itemRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/items', async (request) => {
    return db.prepare(`
      SELECT ${ITEM_COLUMNS} FROM items
      WHERE family_id = ?
      ORDER BY position ASC, created_at ASC
    `).all(request.session.family_id);
  });

  app.post('/api/items', async (request, reply) => {
    const name = nonEmptyString(request.body?.name, LIMITS.itemName);
    if (!name) {
      return reply.code(400).send({ error: 'name required' });
    }
    const emoji = optionalString(request.body?.emoji, LIMITS.emoji, '📦') || '📦';
    const color = hexColor(request.body?.color, '#ff006e');
    const unit = unitValue(request.body?.unit, 'pcs');
    const count = nonNegativeNumber(request.body?.count, 0);
    const threshold = nonNegativeNumber(request.body?.threshold, 0);
    const defaultPortion = unit === 'mg' ? 100 : unit === 'ml' ? 250 : unit === 'g' ? 100 : 1;
    const ps = nonNegativeNumber(request.body?.portion_size, defaultPortion) || defaultPortion;
    const rf = rushFactor(request.body?.rush_factor, 1.0);
    const om = onsetMinutes(request.body?.onset_minutes, 0);
    const dm = decayMinutes(request.body?.decay_minutes, 240);

    const familyId = request.session.family_id;
    const now = Date.now();
    const maxPos = db.prepare(
      'SELECT MAX(position) as p FROM items WHERE family_id = ?'
    ).get(familyId);
    const position = (maxPos.p ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO items (family_id, name, emoji, color, unit, count, threshold, portion_size, rush_factor, onset_minutes, decay_minutes, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(familyId, name, emoji, color, unit, count, threshold, ps, rf, om, dm, position, now, now);

    return db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?`).get(result.lastInsertRowid);
  });

  app.patch('/api/items/:id', async (request, reply) => {
    const id = validId(request.params.id);
    if (!id) return reply.code(400).send({ error: 'invalid id' });

    const item = db.prepare(
      'SELECT * FROM items WHERE id = ? AND family_id = ?'
    ).get(id, request.session.family_id);
    if (!item) return reply.code(404).send({ error: 'not found' });

    const next = { ...item };
    if (request.body?.name !== undefined) {
      const n = nonEmptyString(request.body.name, LIMITS.itemName);
      if (!n) return reply.code(400).send({ error: 'name required' });
      next.name = n;
    }
    if (request.body?.emoji !== undefined) {
      next.emoji = optionalString(request.body.emoji, LIMITS.emoji, '📦') || '📦';
    }
    if (request.body?.color !== undefined) {
      next.color = hexColor(request.body.color, item.color);
    }
    if (request.body?.unit !== undefined) {
      next.unit = unitValue(request.body.unit, item.unit);
    }
    if (request.body?.count !== undefined) {
      next.count = nonNegativeNumber(request.body.count, item.count);
    }
    if (request.body?.threshold !== undefined) {
      next.threshold = nonNegativeNumber(request.body.threshold, item.threshold);
    }
    if (request.body?.portion_size !== undefined) {
      next.portion_size = nonNegativeNumber(request.body.portion_size, item.portion_size) || item.portion_size;
    }
    if (request.body?.rush_factor !== undefined) {
      next.rush_factor = rushFactor(request.body.rush_factor, item.rush_factor);
    }
    if (request.body?.onset_minutes !== undefined) {
      next.onset_minutes = onsetMinutes(request.body.onset_minutes, item.onset_minutes);
    }
    if (request.body?.decay_minutes !== undefined) {
      next.decay_minutes = decayMinutes(request.body.decay_minutes, item.decay_minutes);
    }
    if (request.body?.position !== undefined) {
      const p = Number(request.body.position);
      if (Number.isFinite(p)) next.position = Math.max(0, Math.floor(p));
    }

    db.prepare(`
      UPDATE items
      SET name = ?, emoji = ?, color = ?, unit = ?, count = ?, threshold = ?,
          portion_size = ?, rush_factor = ?, onset_minutes = ?, decay_minutes = ?, position = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(
      next.name, next.emoji, next.color, next.unit,
      next.count, next.threshold, next.portion_size, next.rush_factor, next.onset_minutes, next.decay_minutes,
      next.position, Date.now(),
      id, request.session.family_id
    );
    return db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?`).get(id);
  });

  app.delete('/api/items/:id', async (request, reply) => {
    const id = validId(request.params.id);
    if (!id) return reply.code(400).send({ error: 'invalid id' });
    const result = db.prepare(
      'DELETE FROM items WHERE id = ? AND family_id = ?'
    ).run(id, request.session.family_id);
    if (result.changes === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  app.post('/api/items/:id/adjust', async (request, reply) => {
    const id = validId(request.params.id);
    if (!id) return reply.code(400).send({ error: 'invalid id' });
    const delta = Number(request.body?.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      return reply.code(400).send({ error: 'invalid delta' });
    }
    const userId = request.session.user_id;
    const familyId = request.session.family_id;
    const round4 = (n) => Math.round(n * 10000) / 10000;

    const txn = db.transaction(() => {
      const item = db.prepare(
        'SELECT id, count FROM items WHERE id = ? AND family_id = ?'
      ).get(id, familyId);
      if (!item) return null;
      const newCount = round4(Math.max(0, item.count + delta));
      const realDelta = round4(newCount - item.count);
      if (realDelta === 0) return { count: item.count, delta: 0, ts: Date.now() };
      const ts = Date.now();
      db.prepare('UPDATE items SET count = ?, updated_at = ? WHERE id = ?').run(newCount, ts, id);
      db.prepare(
        'INSERT INTO consumption_log (user_id, family_id, item_id, delta, ts) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, familyId, id, realDelta, ts);
      return { count: newCount, delta: realDelta, ts };
    });

    const result = txn();
    if (!result) return reply.code(404).send({ error: 'not found' });

    if (result.delta < 0) {
      const item = db.prepare(
        'SELECT id, name, emoji, count, threshold, unit FROM items WHERE id = ?'
      ).get(id);

      // Low stock alert
      if (item && item.threshold > 0 && item.count <= item.threshold && item.count > 0) {
        const opted = db.prepare(`
          SELECT u.id, u.username, u.email
          FROM users u
          JOIN notification_preferences np ON np.user_id = u.id
          WHERE u.family_id = ? AND np.low_stock = 1 AND u.email IS NOT NULL
        `).all(familyId);
        for (const u of opted) {
          sendLowStockAlert(u, item);
        }
      }

      // Rush warning -- mirrors client-side calculation in Inventory.jsx
      const user = db.prepare('SELECT id, username, email, rush_reset_at FROM users WHERE id = ?').get(userId);
      if (user) {
        const rushResetAt = user.rush_reset_at || 0;
        const logs = db.prepare(
          'SELECT delta, ts, item_id FROM consumption_log WHERE user_id = ? AND ts > ?'
        ).all(userId, rushResetAt);
        const familyItems = db.prepare(
          'SELECT id, portion_size, rush_factor, onset_minutes, decay_minutes FROM items WHERE family_id = ?'
        ).all(familyId);
        const byId = new Map();
        for (const it of familyItems) byId.set(it.id, it);

        const ts = Date.now();
        let rushScore = 0;
        for (const entry of logs) {
          if (entry.delta >= 0) continue;
          const it = byId.get(entry.item_id);
          if (!it) continue;
          const onsetMs = (it.onset_minutes || 0) * 60 * 1000;
          const decayMs = (it.decay_minutes || 240) * 60 * 1000;
          const age = ts - entry.ts;
          if (age < onsetMs || age < 0) continue;
          const effectiveAge = age - onsetMs;
          if (effectiveAge >= decayMs) continue;
          const portions = Math.abs(entry.delta) / (it.portion_size || 1);
          rushScore += (it.rush_factor || 1) * portions * (1 - effectiveAge / decayMs);
        }
        const rushLevel = rushScore * 100;
        if (rushLevel >= 80) {
          sendRushWarning(user, rushLevel);
        }
      }
    }

    return result;
  });
}
