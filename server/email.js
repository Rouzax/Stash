import nodemailer from 'nodemailer';
import { db } from './db.js';
import { renderLowStockAlert } from './templates/lowStock.js';
import { renderWeeklyDigest } from './templates/weeklyDigest.js';
import { renderRushWarning } from './templates/rushWarning.js';
import { renderPasswordReset } from './templates/passwordReset.js';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'Stash <stash@example.com>';

let transporter = null;

if (SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  transporter.verify()
    .then(() => console.log('SMTP transporter ready'))
    .catch(err => console.error('SMTP verification failed:', err.message));
} else {
  console.warn('SMTP_HOST not set -- email notifications disabled');
}

export function isEmailConfigured() {
  return !!transporter;
}

// ---- Rate limiting ----

const rateLimits = new Map();

function checkRateLimit(type, key, maxPerWindow, windowMs) {
  const rateKey = `${type}:${key}`;
  const now = Date.now();
  let entry = rateLimits.get(rateKey);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimits.set(rateKey, entry);
  }
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);
  if (entry.timestamps.length >= maxPerWindow) return false;
  entry.timestamps.push(now);
  return true;
}

// Prune stale rate limit entries every hour
setInterval(() => {
  const now = Date.now();
  const maxWindow = 6 * 60 * 60 * 1000;
  for (const [key, entry] of rateLimits) {
    entry.timestamps = entry.timestamps.filter(t => now - t < maxWindow);
    if (entry.timestamps.length === 0) rateLimits.delete(key);
  }
}, 60 * 60 * 1000);

// ---- Helpers ----

function getUserPrefs(userId) {
  return db.prepare(
    'SELECT low_stock, weekly_digest, rush_warning FROM notification_preferences WHERE user_id = ?'
  ).get(userId);
}

function send(to, subject, html, text) {
  transporter.sendMail({ from: SMTP_FROM, to, subject, html, text })
    .catch(err => console.error(`Email send failed (${subject}):`, err.message));
}

// ---- Public API ----

export function sendLowStockAlert(user, item) {
  if (!transporter || !user.email) return;
  const prefs = getUserPrefs(user.id);
  if (!prefs || !prefs.low_stock) return;
  if (!checkRateLimit('low_stock', item.id, 1, 6 * 60 * 60 * 1000)) return;

  const { subject, html, text } = renderLowStockAlert(item);
  send(user.email, subject, html, text);
}

export function sendRushWarning(user, meterLevel) {
  if (!transporter || !user.email) return;
  const prefs = getUserPrefs(user.id);
  if (!prefs || !prefs.rush_warning) return;
  if (!checkRateLimit('rush_warning', user.id, 1, 4 * 60 * 60 * 1000)) return;

  const { subject, html, text } = renderRushWarning(meterLevel);
  send(user.email, subject, html, text);
}

export function sendWeeklyDigest(user, familyStats) {
  if (!transporter || !user.email) return;

  const { subject, html, text } = renderWeeklyDigest(familyStats);
  send(user.email, subject, html, text);
}

export function sendPasswordReset(user, resetUrl) {
  if (!transporter || !user.email) return;
  if (!checkRateLimit('password_reset', user.id, 3, 60 * 60 * 1000)) return;

  const { subject, html, text } = renderPasswordReset(resetUrl);
  send(user.email, subject, html, text);
}

export async function sendTestEmail(toAddress) {
  if (!transporter) throw new Error('SMTP not configured');
  await transporter.sendMail({
    from: SMTP_FROM,
    to: toAddress,
    subject: '🧪 Stash test email',
    text: 'If you can read this, email notifications are working.',
    html: '<p>If you can read this, email notifications are working.</p>',
  });
}
