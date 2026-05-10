import Database from 'better-sqlite3';
import { hash } from 'argon2';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = path.join(import.meta.dirname, '..', 'server', 'e2e-test.db');

export async function seedDatabase() {
  // Clean up any existing test database files
  for (const suffix of ['', '-wal', '-shm']) {
    const file = DB_PATH + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Schema matching server/db.js (with migration columns included)
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_superadmin INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      emoji TEXT DEFAULT '😎',
      color TEXT DEFAULT '#ff10f0',
      rush_reset_at INTEGER NOT NULL DEFAULT 0,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      emoji TEXT,
      color TEXT,
      unit TEXT NOT NULL DEFAULT 'pcs',
      count REAL NOT NULL DEFAULT 0,
      threshold REAL NOT NULL DEFAULT 0,
      portion_size REAL NOT NULL DEFAULT 1,
      rush_factor REAL NOT NULL DEFAULT 1.0,
      onset_minutes INTEGER NOT NULL DEFAULT 0,
      decay_minutes INTEGER NOT NULL DEFAULT 240,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_family ON items(family_id);

    CREATE TABLE IF NOT EXISTS consumption_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      delta REAL NOT NULL,
      ts INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_log_user_ts ON consumption_log(user_id, ts);
    CREATE INDEX IF NOT EXISTS idx_log_family_ts ON consumption_log(family_id, ts);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      max_uses INTEGER NOT NULL DEFAULT 1,
      use_count INTEGER NOT NULL DEFAULT 0,
      is_family_starter INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invite_code ON invite_codes(code);

    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      low_stock INTEGER NOT NULL DEFAULT 0,
      weekly_digest INTEGER NOT NULL DEFAULT 0,
      rush_warning INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token);
  `);

  const now = Date.now();
  const pw = await hash('testpassword', { type: 2 });

  // Two families
  const f1 = db.prepare('INSERT INTO families (name, created_at) VALUES (?, ?)').run('The Testers', now);
  const f2 = db.prepare('INSERT INTO families (name, created_at) VALUES (?, ?)').run('Other Family', now);

  // Four users across two families
  const u1 = db.prepare(`INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, last_login_at, created_at)
    VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?)`).run('superadmin', pw, f1.lastInsertRowid, 'admin@test.com', '🦸', '#ff10f0', now, now);

  const u2 = db.prepare(`INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, last_login_at, created_at)
    VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?)`).run('familyadmin', pw, f1.lastInsertRowid, 'admin2@test.com', '🤓', '#00f0ff', now - 3600000, now);

  const u3 = db.prepare(`INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, last_login_at, created_at)
    VALUES (?, ?, ?, 0, 0, null, ?, ?, ?, ?)`).run('member1', pw, f1.lastInsertRowid, '😎', '#ffd60a', now - 86400000, now);

  db.prepare(`INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, last_login_at, created_at)
    VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?)`).run('otheradmin', pw, f2.lastInsertRowid, 'other@test.com', '🐱', '#8338ec', now - 172800000, now);

  // Two items in family 1
  const i1 = db.prepare(`INSERT INTO items (family_id, name, emoji, color, unit, count, threshold, portion_size, rush_factor, onset_minutes, decay_minutes, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(f1.lastInsertRowid, 'Skittles', '🍬', '#ff006e', 'pcs', 42, 10, 1, 1.0, 0, 240, 0, now, now);

  const i2 = db.prepare(`INSERT INTO items (family_id, name, emoji, color, unit, count, threshold, portion_size, rush_factor, onset_minutes, decay_minutes, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(f1.lastInsertRowid, 'M&Ms', '🍫', '#ffd60a', 'pcs', 5, 15, 1, 1.2, 0, 120, 1, now, now);

  // 20 consumption log entries spread across users and items
  const userIds = [u1.lastInsertRowid, u2.lastInsertRowid, u3.lastInsertRowid];
  const itemIds = [i1.lastInsertRowid, i2.lastInsertRowid];

  for (let i = 0; i < 20; i++) {
    const userId = userIds[i % 3];
    const itemId = itemIds[i % 2];
    const delta = i % 5 === 0 ? 10 : -1;
    db.prepare('INSERT INTO consumption_log (user_id, family_id, item_id, delta, ts) VALUES (?, ?, ?, ?, ?)')
      .run(userId, f1.lastInsertRowid, itemId, delta, now - (i * 3600000));
  }

  db.close();
}
