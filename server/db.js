import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DB_PATH || '/data/stash.db';

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ============ Schema ============
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
    email TEXT,
    emoji TEXT DEFAULT '😎',
    color TEXT DEFAULT '#ff10f0',
    rush_reset_at INTEGER NOT NULL DEFAULT 0,
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
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_invite_code ON invite_codes(code);
`);

// ============ Boot housekeeping ============
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
db.prepare('DELETE FROM invite_codes WHERE expires_at < ?').run(Date.now());

const cutoff = Date.now() - 400 * 24 * 60 * 60 * 1000;
db.prepare('DELETE FROM consumption_log WHERE ts < ?').run(cutoff);

// Periodic cleanup: expired sessions (hourly) and old log entries (daily)
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM invite_codes WHERE expires_at < ?').run(Date.now());
}, 60 * 60 * 1000);

setInterval(() => {
  const c = Date.now() - 400 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM consumption_log WHERE ts < ?').run(c);
}, 24 * 60 * 60 * 1000);

export default db;
