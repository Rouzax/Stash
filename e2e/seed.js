import { hash } from 'argon2';
import path from 'node:path';
import fs from 'node:fs';

// Run as part of the e2e webServer command, before the server starts. The
// server holds its database open, so replacing the file under a running
// server would leave it reading the old, unseeded copy.
const DB_PATH = path.join(import.meta.dirname, '..', 'server', 'e2e-test.db');

async function seedDatabase() {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = DB_PATH + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  // The server's own module creates the schema and runs its migrations, so
  // the seed always matches what the server expects. It reads DB_PATH at
  // import time, hence the dynamic import after setting it.
  process.env.DB_PATH = DB_PATH;
  const { db } = await import('../server/db.js');

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

  // Invite codes for registration e2e tests
  db.prepare(`INSERT INTO invite_codes (code, family_id, created_by, max_uses, use_count, is_family_starter, expires_at, created_at)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?)`).run('TESTJOIN', f1.lastInsertRowid, u1.lastInsertRowid, 10, now + 86400000, now);

  db.prepare(`INSERT INTO invite_codes (code, family_id, created_by, max_uses, use_count, is_family_starter, expires_at, created_at)
    VALUES (?, ?, ?, ?, 0, 1, ?, ?)`).run('NEWHOME0', f1.lastInsertRowid, u1.lastInsertRowid, 10, now + 86400000, now);

  db.close();
}

await seedDatabase();
// server/db.js starts a session cleanup timer that would keep this process
// alive.
process.exit(0);
