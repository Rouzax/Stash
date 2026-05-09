import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './db.js'; // ensure schema bootstrap runs
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import logRoutes from './routes/log.js';

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
});

await app.register(authRoutes);
await app.register(itemRoutes);
await app.register(logRoutes);

app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

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
