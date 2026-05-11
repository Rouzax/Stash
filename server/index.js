import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from './db.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import logRoutes from './routes/log.js';
import notificationRoutes from './routes/notifications.js';
import familyRoutes from './routes/families.js';
import { isEmailConfigured, sendWeeklyDigest } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const BEHIND_PROXY = process.env.BEHIND_PROXY === 'true';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error('FATAL: SESSION_SECRET env var must be set and at least 32 characters.');
  console.error('Generate one with: openssl rand -hex 32');
  process.exit(1);
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: BEHIND_PROXY,
  bodyLimit: 1024 * 1024 // 1 MB - inventory data is small
});

await app.register(fastifyCookie, { secret: SESSION_SECRET });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

// Basic security headers on every response
app.addHook('onSend', async (_request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '0');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'");
  if (BEHIND_PROXY) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

await app.register(authRoutes);
await app.register(itemRoutes);
await app.register(logRoutes);
await app.register(notificationRoutes);
await app.register(familyRoutes);

app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

// Weekly digest: check hourly, send on Monday at 08:00 server-local time
setInterval(() => {
  if (!isEmailConfigured()) return;
  const now = new Date();
  if (now.getDay() !== 1 || now.getHours() !== 8) return;

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const families = db.prepare(`
    SELECT DISTINCT u.family_id FROM notification_preferences np
    JOIN users u ON u.id = np.user_id WHERE np.weekly_digest = 1
  `).all();

  for (const { family_id } of families) {
    const logs = db.prepare(`
      SELECT cl.item_id, cl.user_id, cl.delta, cl.ts, cl.is_give, cl.give_recipient,
             u.username, u.emoji AS user_emoji,
             i.name AS item_name, i.emoji AS item_emoji, i.unit AS item_unit
      FROM consumption_log cl
      JOIN users u ON u.id = cl.user_id
      JOIN items i ON i.id = cl.item_id
      WHERE cl.family_id = ? AND cl.ts >= ? AND cl.delta < 0
    `).all(family_id, weekAgo);

    const items = db.prepare(
      'SELECT id, name, emoji, count, threshold, unit FROM items WHERE family_id = ? AND deleted_at IS NULL'
    ).all(family_id);
    const lowStockItems = items.filter(it => it.threshold > 0 && it.count <= it.threshold);

    if (logs.length === 0 && lowStockItems.length === 0) continue;

    const familyStats = { logs, items, lowStockItems };

    const users = db.prepare(`
      SELECT u.id, u.username, u.email
      FROM users u JOIN notification_preferences np ON np.user_id = u.id
      WHERE u.family_id = ? AND np.weekly_digest = 1 AND u.email IS NOT NULL
    `).all(family_id);

    for (const u of users) {
      sendWeeklyDigest(u, familyStats);
    }
  }
}, 60 * 60 * 1000);

const STATIC_DIR = path.join(__dirname, 'public');
await app.register(fastifyStatic, {
  root: STATIC_DIR,
  prefix: '/',
  cacheControl: true,
  maxAge: '1d'
});

// SPA fallback: serve index.html for non-API routes
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'not found' });
  }
  return reply.sendFile('index.html');
});

const shutdown = async (signal) => {
  app.log.info(`${signal} received, shutting down...`);
  try {
    await app.close();
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`STASH listening on ${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
