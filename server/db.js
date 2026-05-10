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
    is_superadmin INTEGER NOT NULL DEFAULT 0,
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
    onset_minutes INTEGER NOT NULL DEFAULT 0,
    decay_minutes INTEGER NOT NULL DEFAULT 240,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_items_family ON items(family_id);

  CREATE TABLE IF NOT EXISTS consumption_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    delta REAL NOT NULL,
    ts INTEGER NOT NULL,
    snap_rush_factor REAL DEFAULT NULL,
    snap_portion_size REAL DEFAULT NULL,
    snap_onset_minutes INTEGER DEFAULT NULL,
    snap_decay_minutes INTEGER DEFAULT NULL
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

// ============ Migrations for existing installs ============
const userCols = db.prepare('PRAGMA table_info(users)').all();
if (!userCols.some(c => c.name === 'is_superadmin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE users SET is_superadmin = 1 WHERE id = (SELECT MIN(id) FROM users)');
}

const itemCols = db.prepare('PRAGMA table_info(items)').all();
if (!itemCols.some(c => c.name === 'onset_minutes')) {
  db.exec('ALTER TABLE items ADD COLUMN onset_minutes INTEGER NOT NULL DEFAULT 0');
}

const inviteCols = db.prepare('PRAGMA table_info(invite_codes)').all();
if (!inviteCols.some(c => c.name === 'is_family_starter')) {
  db.exec('ALTER TABLE invite_codes ADD COLUMN is_family_starter INTEGER NOT NULL DEFAULT 0');
}

if (!userCols.some(c => c.name === 'last_login_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_login_at INTEGER');
}

if (!itemCols.some(c => c.name === 'deleted_at')) {
  db.exec('ALTER TABLE items ADD COLUMN deleted_at INTEGER DEFAULT NULL');
}

const logCols = db.prepare('PRAGMA table_info(consumption_log)').all();
if (!logCols.some(c => c.name === 'snap_rush_factor')) {
  db.exec('ALTER TABLE consumption_log ADD COLUMN snap_rush_factor REAL DEFAULT NULL');
  db.exec('ALTER TABLE consumption_log ADD COLUMN snap_portion_size REAL DEFAULT NULL');
  db.exec('ALTER TABLE consumption_log ADD COLUMN snap_onset_minutes INTEGER DEFAULT NULL');
  db.exec('ALTER TABLE consumption_log ADD COLUMN snap_decay_minutes INTEGER DEFAULT NULL');
}

// ============ Boot housekeeping ============
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
db.prepare('DELETE FROM invite_codes WHERE expires_at < ?').run(Date.now());
db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ? OR used = 1').run(Date.now());

// Periodic cleanup: expired sessions (hourly)
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM invite_codes WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ? OR used = 1').run(Date.now());
}, 60 * 60 * 1000);

export default db;
