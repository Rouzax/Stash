import { db } from '../db.js';
import { requireAdmin, requireSuperadmin } from '../auth.js';
import { nonEmptyString, LIMITS } from '../validation.js';

export default async function familyRoutes(app) {
  app.get('/api/families', { preHandler: requireSuperadmin }, async () => {
    return db.prepare(`
      SELECT f.id, f.name, f.created_at,
             (SELECT COUNT(*) FROM users WHERE family_id = f.id) AS member_count,
             (SELECT COUNT(*) FROM items WHERE family_id = f.id) AS item_count
      FROM families f
      ORDER BY f.created_at ASC
    `).all();
  });

  app.patch('/api/families/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'invalid id' });
    }
    if (id !== request.session.family_id && !request.session.is_superadmin) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const name = nonEmptyString(request.body?.name, LIMITS.familyName);
    if (!name) {
      return reply.code(400).send({ error: 'name required' });
    }
    const result = db.prepare('UPDATE families SET name = ? WHERE id = ?').run(name, id);
    if (result.changes === 0) {
      return reply.code(404).send({ error: 'not found' });
    }
    return { ok: true, name };
  });

  app.delete('/api/families/:id', { preHandler: requireSuperadmin }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'invalid id' });
    }

    const lastSuperadmin = db.prepare(`
      SELECT COUNT(*) as n FROM users
      WHERE is_superadmin = 1 AND family_id != ?
    `).get(id).n;
    const familyHasSuperadmin = db.prepare(
      'SELECT COUNT(*) as n FROM users WHERE is_superadmin = 1 AND family_id = ?'
    ).get(id).n;

    if (familyHasSuperadmin > 0 && lastSuperadmin === 0) {
      return reply.code(400).send({ error: 'cannot delete family containing the only superadmin' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE family_id = ?)').run(id);
      db.prepare('DELETE FROM families WHERE id = ?').run(id);
    })();

    return { ok: true };
  });
}
