# Admin & Super Admin Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin modal with a dedicated `/admin` view featuring tabbed navigation (Users, Settings, Activity, System), expanding user management, adding family settings, activity feeds, and cross-family superadmin controls.

**Architecture:** New top-level view state in App.jsx's state machine renders `AdminArea.jsx`, which manages a tab bar and renders tab components. Backend adds 7 new endpoints to `server/routes/auth.js`, `server/routes/families.js`, and `server/routes/log.js`. One schema migration adds `last_login_at` to users. AdminPanel.jsx is retired; its code moves into `UsersTab.jsx` and `SystemTab.jsx`.

**Tech Stack:** React 19, Fastify 5, better-sqlite3, Playwright (new), lucide-react icons

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `server/routes/families.js` | Family CRUD endpoints (list, rename, delete) |
| `web/src/AdminArea.jsx` | Top-level admin view with header and tab router |
| `web/src/admin/UsersTab.jsx` | Family user list, create, toggle admin, reset password, delete, invites |
| `web/src/admin/SettingsTab.jsx` | Family name rename, danger zone (delete family) |
| `web/src/admin/ActivityTab.jsx` | Family-wide consumption feed with filters and pagination |
| `web/src/admin/SystemTab.jsx` | Superadmin: global user list, family overview, family-starter invites |
| `e2e/admin.spec.js` | Playwright screenshot + regression tests |
| `e2e/seed.js` | Test data seeder for Playwright |
| `playwright.config.js` | Playwright configuration |

### Modified files

| File | Changes |
|------|---------|
| `server/db.js` | Add `last_login_at` migration |
| `server/routes/auth.js` | Add PATCH user, PATCH superadmin, GET all users endpoints; modify login, GET users, DELETE user, DELETE invite |
| `server/routes/log.js` | Add `GET /api/log/family` endpoint |
| `server/index.js` | Register `familyRoutes` |
| `web/src/api.js` | Add `admin` export with new API methods |
| `web/src/App.jsx` | Add `'admin'` view state, render AdminArea |
| `web/src/Inventory.jsx` | Change FAMILY menu to navigate to admin view instead of opening modal; remove AdminPanel import |
| `web/src/styles.css` | Add admin area styles (tabs, activity feed, system table) |
| `docs/faq.md` | Fix outdated password reset section |
| `docs/usage.md` | Update admin panel section with new features |

### Retired files

| File | Reason |
|------|--------|
| `web/src/AdminPanel.jsx` | Replaced by `AdminArea.jsx` + tab components |

---

## Task 1: Schema Migration -- `last_login_at`

**Files:**
- Modify: `server/db.js:115-129` (migrations section)
- Modify: `server/routes/auth.js:20-50` (login endpoint)

- [ ] **Step 1: Add migration in db.js**

Add after the `is_family_starter` migration block (line 129):

```javascript
if (!userCols.some(c => c.name === 'last_login_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_login_at INTEGER');
}
```

Note: `userCols` is already fetched at line 115. The new column is nullable (no DEFAULT needed).

- [ ] **Step 2: Update login to set last_login_at**

In `server/routes/auth.js`, after the session is created (line 42) but before the return (line 44), add:

```javascript
db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
```

- [ ] **Step 3: Update GET /api/auth/users to return last_login_at**

In `server/routes/auth.js` line 145-148, change the SELECT to include `last_login_at`:

```javascript
return db.prepare(`
  SELECT id, username, is_admin, email, emoji, color, last_login_at, created_at
  FROM users WHERE family_id = ? ORDER BY created_at ASC LIMIT 1000
`).all(request.session.family_id).map(u => ({ ...u, is_admin: !!u.is_admin }));
```

- [ ] **Step 4: Test manually**

```bash
cd server && SESSION_SECRET=$(openssl rand -hex 32) DB_PATH=./test-migration.db node -e "
  import('./db.js').then(({ db }) => {
    const cols = db.prepare('PRAGMA table_info(users)').all();
    const has = cols.some(c => c.name === 'last_login_at');
    console.log('last_login_at column exists:', has);
    if (!has) { console.error('FAIL'); process.exit(1); }
    console.log('PASS');
  });
"
```

Expected: `last_login_at column exists: true` and `PASS`

- [ ] **Step 5: Clean up and commit**

```bash
rm -f server/test-migration.db server/test-migration.db-wal server/test-migration.db-shm
git add server/db.js server/routes/auth.js
git commit -m "feat: track last_login_at on users table"
```

---

## Task 2: Backend -- User Update Endpoint (PATCH /api/auth/users/:id)

**Files:**
- Modify: `server/routes/auth.js` (add new route after line 199, the DELETE handler)

- [ ] **Step 1: Add the PATCH endpoint**

Add after the DELETE `/api/auth/users/:id` handler (after line 199):

```javascript
app.patch('/api/auth/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.code(400).send({ error: 'invalid id' });
  }

  const target = db.prepare('SELECT id, family_id, is_admin FROM users WHERE id = ?').get(id);
  if (!target) {
    return reply.code(404).send({ error: 'not found' });
  }
  if (target.family_id !== request.session.family_id && !request.session.is_superadmin) {
    return reply.code(403).send({ error: 'forbidden' });
  }

  const { is_admin, password } = request.body || {};
  if (is_admin === undefined && !password) {
    return reply.code(400).send({ error: 'nothing to update' });
  }

  const updates = [];
  const params = [];

  if (is_admin !== undefined) {
    if (id === request.session.user_id) {
      return reply.code(400).send({ error: 'cannot change your own admin status' });
    }
    if (!is_admin) {
      const adminCount = db.prepare(
        'SELECT COUNT(*) as n FROM users WHERE family_id = ? AND is_admin = 1'
      ).get(target.family_id).n;
      if (adminCount <= 1) {
        return reply.code(400).send({ error: 'cannot remove the last admin' });
      }
    }
    updates.push('is_admin = ?');
    params.push(is_admin ? 1 : 0);
  }

  if (password) {
    const pw = validatePassword(password);
    if (!pw.ok) return reply.code(400).send({ error: pw.error });
    const hash = await hashPassword(pw.value);
    updates.push('password_hash = ?');
    params.push(hash);
  }

  params.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  if (password) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }

  return { ok: true };
});
```

- [ ] **Step 2: Test with curl**

Start the server, then:

```bash
# Toggle admin (replace SESSION_ID and USER_ID with real values)
curl -X PATCH http://localhost:3000/api/auth/users/USER_ID \
  -H 'Content-Type: application/json' \
  -b 'stash_sid=SESSION_ID' \
  -d '{"is_admin": true}'
```

Expected: `{"ok":true}`

- [ ] **Step 3: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: add PATCH /api/auth/users/:id for admin toggle and password reset"
```

---

## Task 3: Backend -- Superadmin Endpoints

**Files:**
- Modify: `server/routes/auth.js` (add after the PATCH endpoint from Task 2)

- [ ] **Step 1: Add PATCH superadmin toggle endpoint**

```javascript
app.patch('/api/auth/users/:id/superadmin', { preHandler: requireSuperadmin }, async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.code(400).send({ error: 'invalid id' });
  }
  const { is_superadmin } = request.body || {};
  if (is_superadmin === undefined) {
    return reply.code(400).send({ error: 'is_superadmin required' });
  }

  if (!is_superadmin && id === request.session.user_id) {
    const count = db.prepare('SELECT COUNT(*) as n FROM users WHERE is_superadmin = 1').get().n;
    if (count <= 1) {
      return reply.code(400).send({ error: 'cannot remove the last superadmin' });
    }
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!target) {
    return reply.code(404).send({ error: 'not found' });
  }

  db.prepare('UPDATE users SET is_superadmin = ? WHERE id = ?').run(is_superadmin ? 1 : 0, id);
  return { ok: true };
});
```

- [ ] **Step 2: Add GET all users endpoint**

```javascript
app.get('/api/auth/users/all', { preHandler: requireSuperadmin }, async () => {
  return db.prepare(`
    SELECT u.id, u.username, u.is_admin, u.is_superadmin, u.family_id,
           u.email, u.emoji, u.color, u.last_login_at, u.created_at,
           f.name AS family_name
    FROM users u
    JOIN families f ON f.id = u.family_id
    ORDER BY u.created_at ASC
    LIMIT 10000
  `).all().map(u => ({
    ...u,
    is_admin: !!u.is_admin,
    is_superadmin: !!u.is_superadmin
  }));
});
```

- [ ] **Step 3: Update DELETE /api/auth/users/:id for superadmin cross-family access**

Replace the existing DELETE handler (lines 184-199) with:

```javascript
app.delete('/api/auth/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return reply.code(400).send({ error: 'invalid id' });
  }
  if (id === request.session.user_id) {
    return reply.code(400).send({ error: 'cannot delete yourself' });
  }
  let result;
  if (request.session.is_superadmin) {
    result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  } else {
    result = db.prepare(
      'DELETE FROM users WHERE id = ? AND family_id = ?'
    ).run(id, request.session.family_id);
  }
  if (result.changes === 0) {
    return reply.code(404).send({ error: 'not found' });
  }
  return { ok: true };
});
```

- [ ] **Step 4: Update DELETE /api/auth/invites/:id for superadmin cross-family access**

Replace the existing DELETE handler (lines 392-400) with:

```javascript
app.delete('/api/auth/invites/:id', { preHandler: requireAdmin }, async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'invalid id' });
  let result;
  if (request.session.is_superadmin) {
    result = db.prepare('DELETE FROM invite_codes WHERE id = ?').run(id);
  } else {
    result = db.prepare(
      'DELETE FROM invite_codes WHERE id = ? AND family_id = ?'
    ).run(id, request.session.family_id);
  }
  if (result.changes === 0) return reply.code(404).send({ error: 'not found' });
  return { ok: true };
});
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: add superadmin user management endpoints"
```

---

## Task 4: Backend -- Family Routes

**Files:**
- Create: `server/routes/families.js`
- Modify: `server/index.js:9-12,47-50` (add import and registration)

- [ ] **Step 1: Create server/routes/families.js**

```javascript
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
```

- [ ] **Step 2: Register in server/index.js**

Add import at line 12 (after notificationRoutes import):

```javascript
import familyRoutes from './routes/families.js';
```

Add registration at line 50 (after notificationRoutes registration):

```javascript
await app.register(familyRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/families.js server/index.js
git commit -m "feat: add family CRUD endpoints (list, rename, delete)"
```

---

## Task 5: Backend -- Family Activity Feed

**Files:**
- Modify: `server/routes/log.js:1-3,7-19` (add import and new endpoint)

- [ ] **Step 1: Add GET /api/log/family endpoint**

Add `requireAdmin` to the import at line 2:

```javascript
import { requireAuth, requireAdmin } from '../auth.js';
```

Add the new endpoint after the existing `GET /api/log` handler (after line 19):

```javascript
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
           u.username, u.emoji AS user_emoji,
           i.name AS item_name, i.emoji AS item_emoji, i.unit AS item_unit
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
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/log.js
git commit -m "feat: add GET /api/log/family for admin activity feed"
```

---

## Task 6: Frontend -- API Client Additions

**Files:**
- Modify: `web/src/api.js:62-81` (add admin export)

- [ ] **Step 1: Add admin API methods**

Add after the `auth` export (after line 62), before the `items` export:

```javascript
export const admin = {
  updateUser: (id, data) => api.patch(`/api/auth/users/${id}`, data),
  toggleSuperadmin: (id, is_superadmin) => api.patch(`/api/auth/users/${id}/superadmin`, { is_superadmin }),
  listAllUsers: () => api.get('/api/auth/users/all'),
  listFamilies: () => api.get('/api/families'),
  renameFamily: (id, name) => api.patch(`/api/families/${id}`, { name }),
  deleteFamily: (id) => api.del(`/api/families/${id}`),
  familyActivity: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.before) qs.set('before', params.before);
    if (params.user_id) qs.set('user_id', params.user_id);
    if (params.item_id) qs.set('item_id', params.item_id);
    const q = qs.toString();
    return api.get(`/api/log/family${q ? '?' + q : ''}`);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add web/src/api.js
git commit -m "feat: add admin API client methods"
```

---

## Task 7: Frontend -- AdminArea Shell and Tab Navigation

**Files:**
- Create: `web/src/AdminArea.jsx`
- Modify: `web/src/App.jsx`
- Modify: `web/src/Inventory.jsx:6,40,279-282,429-431`
- Modify: `web/src/styles.css` (append admin styles)

- [ ] **Step 1: Create AdminArea.jsx**

```jsx
import { useState } from 'react';
import { ArrowLeft, Users, Settings, Activity, Shield } from 'lucide-react';

export default function AdminArea({ user, onBack }) {
  const tabs = [
    { id: 'users', label: 'USERS', icon: Users },
    { id: 'settings', label: 'SETTINGS', icon: Settings },
    { id: 'activity', label: 'ACTIVITY', icon: Activity },
  ];
  if (user.is_superadmin) {
    tabs.push({ id: 'system', label: 'SYSTEM', icon: Shield });
  }

  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="admin-area">
      <div className="admin-header">
        <button className="admin-back" onClick={onBack} aria-label="Back to inventory">
          <ArrowLeft size={20} />
        </button>
        <h1 className="admin-title">ADMIN</h1>
      </div>

      <div className="admin-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="admin-content">
        {activeTab === 'users' && <div className="admin-placeholder">Users tab (Task 8)</div>}
        {activeTab === 'settings' && <div className="admin-placeholder">Settings tab (Task 9)</div>}
        {activeTab === 'activity' && <div className="admin-placeholder">Activity tab (Task 10)</div>}
        {activeTab === 'system' && <div className="admin-placeholder">System tab (Task 11)</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update App.jsx to add admin view state**

Replace the current `App` component to add admin view routing. The state machine gets a new `view` state:

```jsx
import { useState, useEffect } from 'react';
import { auth, setUnauthorizedHandler } from './api.js';
import Login from './Login.jsx';
import Inventory from './Inventory.jsx';
import AdminArea from './AdminArea.jsx';
import ResetPassword from './ResetPassword.jsx';
import { SynthBackground } from './background.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState('');
  const [view, setView] = useState('inventory');

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setView('inventory');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { needs_bootstrap } = await auth.bootstrap();
        if (needs_bootstrap) {
          setNeedsBootstrap(true);
          setLoading(false);
          return;
        }
      } catch (e) {
        setBootError('Could not reach server: ' + e.message);
        setLoading(false);
        return;
      }

      try {
        const me = await auth.me();
        setUser(me);
      } catch (e) {
        if (e.status !== 401) {
          setBootError('Could not load session: ' + e.message);
          setLoading(false);
          return;
        }
      }
      setLoading(false);
    })();
  }, []);

  const handleAuth = (u) => {
    setUser(u);
    setNeedsBootstrap(false);
  };

  const handleLogout = () => {
    setUser(null);
    setView('inventory');
  };

  if (window.location.pathname === '/reset-password') {
    return <ResetPassword onBackToLogin={() => { window.location.href = '/'; }} />;
  }

  if (loading) {
    return (
      <>
        <SynthBackground />
        <div className="loading-screen">
          <div className="loading-text">LOADING STASH</div>
        </div>
      </>
    );
  }

  if (bootError) {
    return (
      <>
        <SynthBackground />
        <div className="loading-screen">
          <div style={{ textAlign: 'center', padding: 24, maxWidth: 360 }}>
            <div className="loading-text" style={{ color: '#ff006e' }}>SERVER ERROR</div>
            <div style={{
              marginTop: 12, color: 'rgba(255,255,255,0.7)',
              fontSize: 13, fontFamily: 'Outfit'
            }}>
              {bootError}
            </div>
            <button
              className="btn-secondary"
              style={{ marginTop: 20 }}
              onClick={() => window.location.reload()}
            >RETRY</button>
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <Login
        mode={needsBootstrap ? 'bootstrap' : 'login'}
        onAuth={handleAuth}
      />
    );
  }

  if (view === 'admin' && user.is_admin) {
    return (
      <>
        <SynthBackground />
        <AdminArea user={user} onBack={() => setView('inventory')} />
      </>
    );
  }

  return (
    <Inventory
      user={user}
      onLogout={handleLogout}
      onNavigate={(v) => setView(v)}
    />
  );
}
```

- [ ] **Step 3: Update Inventory.jsx**

Change the component signature to accept `onNavigate`:

```jsx
export default function Inventory({ user: initialUser, onLogout, onNavigate }) {
```

Remove the AdminPanel import (line 6) and the `adminOpen` state (line 40). Remove the AdminPanel render block (lines 429-431).

Replace the FAMILY menu button (lines 279-282) to navigate instead of opening a modal:

```jsx
{user.is_admin && (
  <button className="menu-item" onClick={() => { setMenuOpen(false); onNavigate('admin'); }}>
    <Users size={14} /> FAMILY
  </button>
)}
```

- [ ] **Step 4: Add admin CSS to styles.css**

Append to `web/src/styles.css`:

```css
/* ============ Admin Area ============ */

.admin-area {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  min-height: 100vh;
}

.admin-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.admin-back {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(0, 240, 255, 0.3);
  border-radius: 8px;
  color: var(--neon-cyan);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}
.admin-back:hover {
  background: rgba(0, 240, 255, 0.12);
}

.admin-title {
  font-family: 'Monoton', cursive;
  font-size: 28px;
  color: var(--neon-cyan);
  margin: 0;
  text-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
}

.admin-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid rgba(0, 240, 255, 0.2);
  padding-bottom: 0;
}

.admin-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.5);
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  margin-bottom: -1px;
}
.admin-tab:hover {
  color: rgba(255, 255, 255, 0.8);
}
.admin-tab.active {
  color: var(--neon-cyan);
  border-bottom-color: var(--neon-cyan);
}

.admin-content {
  animation: fade-in 0.2s ease;
}

.admin-placeholder {
  padding: 40px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 5: Verify in browser**

```bash
cd web && npm run dev
```

Open `http://localhost:5173`, log in as admin, click FAMILY in menu. Should see admin area with tabs and placeholder text. Back button should return to inventory.

- [ ] **Step 6: Commit**

```bash
git add web/src/AdminArea.jsx web/src/App.jsx web/src/Inventory.jsx web/src/styles.css
git commit -m "feat: add admin area shell with tab navigation"
```

---

## Task 8: Frontend -- Users Tab

**Files:**
- Create: `web/src/admin/UsersTab.jsx`
- Modify: `web/src/AdminArea.jsx` (import and render UsersTab)
- Modify: `web/src/styles.css` (append user tab styles)

- [ ] **Step 1: Create web/src/admin/ directory**

```bash
mkdir -p web/src/admin
```

- [ ] **Step 2: Create UsersTab.jsx**

This is a refactor of `AdminPanel.jsx` with added toggle-admin and reset-password features:

```jsx
import { useState, useEffect } from 'react';
import { Trash2, Plus, Shield, User, Copy, Check, Link, X, KeyRound, ChevronDown, ChevronUp } from 'lucide-react';
import { auth, admin } from '../api.js';

const EXPIRY_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

const USES_OPTIONS = [
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '∞', value: 0 },
];

const EMOJI_PRESETS = ['😎', '🤓', '👩', '👨', '🧒', '👶', '🚀', '🧑‍🚀', '👽', '🤖', '🦸', '🧙', '🐱', '🐶', '🦊', '🐼', '🦄', '🐉'];

const formatTimeAgo = (ts) => {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
};

export default function UsersTab({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showInviteCreate, setShowInviteCreate] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [inviteExpiry, setInviteExpiry] = useState(24);
  const [invitesExpanded, setInvitesExpanded] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmoji, setNewEmoji] = useState('😎');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [resetPwId, setResetPwId] = useState(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(null);

  const refresh = async () => {
    try {
      const [u, inv] = await Promise.all([auth.listUsers(), auth.listInvites()]);
      setUsers(u);
      setInvites(inv.filter(i => !i.is_family_starter));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const create = async () => {
    setError('');
    if (!newUsername.trim() || !newPassword) {
      setError('Username and password required');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await auth.createUser(newUsername.trim(), newPassword, newIsAdmin, newEmail.trim(), newEmoji);
      setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewEmoji('😎'); setNewIsAdmin(false);
      setShowCreate(false);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await auth.deleteUser(id);
      setConfirmDeleteId(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleAdmin = async (userId, currentIsAdmin) => {
    setError('');
    try {
      await admin.updateUser(userId, { is_admin: !currentIsAdmin });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const resetPassword = async (userId) => {
    setError('');
    if (!resetPwValue || resetPwValue.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await admin.updateUser(userId, { password: resetPwValue });
      setResetPwId(null);
      setResetPwValue('');
    } catch (e) {
      setError(e.message);
    }
  };

  const createInvite = async () => {
    setError('');
    try {
      await auth.createInvite({ max_uses: inviteMaxUses, expires_hours: inviteExpiry });
      setShowInviteCreate(false);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const revokeInvite = async (id) => {
    try {
      await auth.deleteInvite(id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const formatExpiry = (ts) => {
    const diff = ts - Date.now();
    if (diff <= 0) return 'expired';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    if (hours < 1) return `${Math.ceil(diff / 60000)}m`;
    if (hours < 48) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  if (loading) {
    return <div className="admin-placeholder">LOADING...</div>;
  }

  return (
    <div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="user-list">
        {users.map(u => (
          <div key={u.id} className="user-row">
            <div className="user-icon" style={u.color ? { borderColor: u.color, color: u.color } : undefined}>
              {u.emoji || (u.is_admin ? <Shield size={16} /> : <User size={16} />)}
            </div>
            <div className="user-info">
              <div className="user-name">
                {u.username}
                {u.id === currentUserId && <span className="user-self-tag">YOU</span>}
              </div>
              <div className="user-meta">
                {u.is_admin ? 'Admin' : 'Member'}
                {' · '}
                {formatTimeAgo(u.last_login_at)}
                {' · '}
                {new Date(u.created_at).toLocaleDateString()}
              </div>
            </div>
            {u.id !== currentUserId && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className={`btn-secondary-small ${u.is_admin ? 'active' : ''}`}
                  onClick={() => toggleAdmin(u.id, u.is_admin)}
                  title={u.is_admin ? 'Demote to member' : 'Promote to admin'}
                >
                  <Shield size={14} />
                </button>
                <button
                  className="btn-secondary-small"
                  onClick={() => { setResetPwId(resetPwId === u.id ? null : u.id); setResetPwValue(''); }}
                  title="Reset password"
                >
                  <KeyRound size={14} />
                </button>
                {confirmDeleteId === u.id ? (
                  <>
                    <button className="btn-danger-small" onClick={() => remove(u.id)}>YES</button>
                    <button className="btn-secondary-small" onClick={() => setConfirmDeleteId(null)}>NO</button>
                  </>
                ) : (
                  <button className="btn-danger-small" onClick={() => setConfirmDeleteId(u.id)} aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
            {resetPwId === u.id && (
              <div className="reset-pw-inline">
                <input
                  type="password"
                  placeholder="New password (8+)"
                  value={resetPwValue}
                  onChange={e => setResetPwValue(e.target.value)}
                  autoFocus
                />
                <button className="btn-primary" onClick={() => resetPassword(u.id)} style={{ padding: '6px 12px', fontSize: 11 }}>
                  SET
                </button>
                <button className="btn-secondary" onClick={() => { setResetPwId(null); setResetPwValue(''); }} style={{ padding: '6px 12px', fontSize: 11 }}>
                  CANCEL
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreate ? (
        <div className="create-user-card">
          <div className="field">
            <label>USERNAME</label>
            <input value={newUsername} onChange={e => setNewUsername(e.target.value)} autoComplete="off" autoFocus />
          </div>
          <div className="field">
            <label>EMAIL (OPTIONAL)</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" autoComplete="off" />
          </div>
          <div className="field">
            <label>PASSWORD (8+)</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field">
            <label>EMOJI</label>
            <div className="emoji-presets">
              {EMOJI_PRESETS.map(e => (
                <button key={e} type="button"
                  className={`emoji-preset ${newEmoji === e ? 'active' : ''}`}
                  onClick={() => setNewEmoji(e)}
                >{e}</button>
              ))}
            </div>
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={newIsAdmin} onChange={e => setNewIsAdmin(e.target.checked)} />
            <span>GRANT ADMIN PRIVILEGES</span>
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setError(''); }}>CANCEL</button>
            <button className="btn-primary" onClick={create} style={{ flex: 1 }}>CREATE</button>
          </div>
        </div>
      ) : (
        <button
          className="btn-primary"
          onClick={() => { setShowCreate(true); setError(''); }}
          style={{ width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Plus size={16} /> ADD MEMBER
        </button>
      )}

      <div style={{ marginTop: 24, borderTop: '1px solid rgba(0,240,255,0.2)', paddingTop: 16 }}>
        <button
          className="admin-section-toggle"
          onClick={() => setInvitesExpanded(!invitesExpanded)}
        >
          <span>MEMBER INVITES</span>
          {invitesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {invitesExpanded && (
          <>
            {invites.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {invites.map(inv => (
                  <div key={inv.id} className="invite-row">
                    <button className="invite-code" onClick={() => copyCode(inv.code)} title="Copy">
                      {inv.code}
                      {copiedCode === inv.code ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <div className="invite-meta">
                      {inv.max_uses === 0 ? '∞' : `${inv.use_count}/${inv.max_uses}`} uses {'·'} {formatExpiry(inv.expires_at)}
                    </div>
                    <button className="btn-danger-small" onClick={() => revokeInvite(inv.id)} aria-label="Revoke" style={{ width: 28, height: 28 }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showInviteCreate ? (
              <div className="create-user-card">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field">
                    <label>MAX USES</label>
                    <div className="units">
                      {USES_OPTIONS.map(o => (
                        <button key={o.value} type="button"
                          className={`unit-btn ${inviteMaxUses === o.value ? 'active' : ''}`}
                          onClick={() => setInviteMaxUses(o.value)}
                        >{o.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>EXPIRES</label>
                    <div className="units">
                      {EXPIRY_OPTIONS.map(o => (
                        <button key={o.hours} type="button"
                          className={`unit-btn ${inviteExpiry === o.hours ? 'active' : ''}`}
                          onClick={() => setInviteExpiry(o.hours)}
                        >{o.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn-secondary" onClick={() => setShowInviteCreate(false)}>CANCEL</button>
                  <button className="btn-primary" onClick={createInvite} style={{ flex: 1 }}>GENERATE</button>
                </div>
              </div>
            ) : (
              <button
                className="btn-secondary"
                onClick={() => setShowInviteCreate(true)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Link size={14} /> INVITE MEMBER
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update AdminArea.jsx to render UsersTab**

Add import at top:

```jsx
import UsersTab from './admin/UsersTab.jsx';
```

Replace the users placeholder line:

```jsx
{activeTab === 'users' && <UsersTab currentUserId={user.id} />}
```

- [ ] **Step 4: Add user tab styles to styles.css**

Append to `web/src/styles.css`:

```css
.admin-section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  color: var(--neon-cyan);
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
  cursor: pointer;
  padding: 8px 0;
  margin-bottom: 12px;
}

.reset-pw-inline {
  display: flex;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.reset-pw-inline input {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 16, 240, 0.3);
  border-radius: 6px;
  color: white;
  padding: 6px 10px;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
}
.reset-pw-inline input:focus {
  outline: none;
  border-color: var(--neon-magenta);
}
```

- [ ] **Step 5: Verify in browser**

Open admin area, confirm Users tab shows user list with admin toggle buttons, password reset inline form, delete confirmation, and invite code section.

- [ ] **Step 6: Commit**

```bash
git add web/src/admin/UsersTab.jsx web/src/AdminArea.jsx web/src/styles.css
git commit -m "feat: implement Users tab with admin toggle and password reset"
```

---

## Task 9: Frontend -- Settings Tab

**Files:**
- Create: `web/src/admin/SettingsTab.jsx`
- Modify: `web/src/AdminArea.jsx` (import and render)
- Modify: `web/src/styles.css` (append settings styles)

- [ ] **Step 1: Create SettingsTab.jsx**

```jsx
import { useState } from 'react';
import { admin } from '../api.js';

export default function SettingsTab({ user }) {
  const [familyName, setFamilyName] = useState(user.family_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const saveFamily = async () => {
    if (!familyName.trim()) {
      setError('Family name cannot be empty');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await admin.renameFamily(user.family_id, familyName.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const deleteFamily = async () => {
    if (deleteConfirmName !== user.family_name) return;
    setDeleting(true);
    try {
      await admin.deleteFamily(user.family_id);
      window.location.reload();
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="admin-section">
        <div className="admin-section-label">{'◢'} FAMILY IDENTITY {'◣'}</div>

        <div className="field">
          <label>FAMILY NAME</label>
          <input
            value={familyName}
            onChange={e => setFamilyName(e.target.value)}
            maxLength={64}
          />
        </div>
        <button
          className="btn-primary"
          onClick={saveFamily}
          disabled={saving}
          style={{ marginTop: 8 }}
        >
          {saved ? 'SAVED' : saving ? 'SAVING...' : 'SAVE'}
        </button>
      </div>

      {user.is_superadmin && (
        <div className="admin-danger-zone">
          <div className="admin-section-label" style={{ color: 'var(--neon-pink)' }}>{'◢'} DANGER ZONE {'◣'}</div>

          {confirmDelete ? (
            <div className="create-user-card" style={{ borderColor: 'rgba(255, 0, 110, 0.3)' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: '0 0 12px' }}>
                This will permanently delete the family, all its members, items, and history. Type the family name to confirm:
              </p>
              <div className="field">
                <label>TYPE &quot;{user.family_name}&quot; TO CONFIRM</label>
                <input
                  value={deleteConfirmName}
                  onChange={e => setDeleteConfirmName(e.target.value)}
                  autoFocus
                  style={{ borderColor: 'rgba(255, 0, 110, 0.5)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-secondary" onClick={() => { setConfirmDelete(false); setDeleteConfirmName(''); }}>CANCEL</button>
                <button
                  className="btn-danger"
                  onClick={deleteFamily}
                  disabled={deleteConfirmName !== user.family_name || deleting}
                  style={{ flex: 1 }}
                >
                  {deleting ? 'DELETING...' : 'DELETE FAMILY'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn-danger"
              onClick={() => setConfirmDelete(true)}
              style={{ width: '100%' }}
            >
              DELETE THIS FAMILY
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update AdminArea.jsx**

Add import:

```jsx
import SettingsTab from './admin/SettingsTab.jsx';
```

Replace settings placeholder:

```jsx
{activeTab === 'settings' && <SettingsTab user={user} />}
```

- [ ] **Step 3: Add settings styles to styles.css**

Append:

```css
.admin-section {
  margin-bottom: 24px;
}

.admin-section-label {
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--neon-cyan);
  margin-bottom: 12px;
}

.admin-danger-zone {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 0, 110, 0.3);
}
```

- [ ] **Step 4: Verify in browser**

Open Settings tab, rename family, verify save feedback. As superadmin, test danger zone (cancel out, don't actually delete).

- [ ] **Step 5: Commit**

```bash
git add web/src/admin/SettingsTab.jsx web/src/AdminArea.jsx web/src/styles.css
git commit -m "feat: implement Settings tab with family rename and danger zone"
```

---

## Task 10: Frontend -- Activity Tab

**Files:**
- Create: `web/src/admin/ActivityTab.jsx`
- Modify: `web/src/AdminArea.jsx` (import and render)
- Modify: `web/src/styles.css` (append activity styles)

- [ ] **Step 1: Create ActivityTab.jsx**

```jsx
import { useState, useEffect } from 'react';
import { auth, admin } from '../api.js';
import { items as itemsApi } from '../api.js';

const formatTimeAgo = (ts) => {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
};

const formatDelta = (delta, unit) => {
  const abs = Math.abs(delta);
  const formatted = Number.isInteger(abs) ? String(abs) : parseFloat(abs.toFixed(4)).toString();
  if (delta < 0) {
    return `consumed ${formatted} ${unit}`;
  }
  return `restocked +${formatted} ${unit}`;
};

export default function ActivityTab() {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [filterUser, setFilterUser] = useState('');
  const [filterItem, setFilterItem] = useState('');

  const fetchActivity = async (before, append = false) => {
    try {
      const params = { limit: 50 };
      if (before) params.before = before;
      if (filterUser) params.user_id = filterUser;
      if (filterItem) params.item_id = filterItem;
      const data = await admin.familyActivity(params);
      if (append) {
        setEntries(prev => [...prev, ...data.entries]);
      } else {
        setEntries(data.entries);
      }
      setHasMore(data.has_more);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [u, it] = await Promise.all([auth.listUsers(), itemsApi.list()]);
        setUsers(u);
        setAllItems(it);
      } catch (e) {
        setError(e.message);
      }
      await fetchActivity();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchActivity();
    }
  }, [filterUser, filterItem]);

  const loadMore = async () => {
    if (!entries.length) return;
    setLoadingMore(true);
    await fetchActivity(entries[entries.length - 1].ts, true);
    setLoadingMore(false);
  };

  if (loading) {
    return <div className="admin-placeholder">LOADING...</div>;
  }

  return (
    <div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="activity-filters">
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="activity-filter"
        >
          <option value="">All members</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.emoji || '👤'} {u.username}</option>
          ))}
        </select>
        <select
          value={filterItem}
          onChange={e => setFilterItem(e.target.value)}
          className="activity-filter"
        >
          <option value="">All items</option>
          {allItems.map(item => (
            <option key={item.id} value={item.id}>{item.emoji || '📦'} {item.name}</option>
          ))}
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="admin-placeholder">NO ACTIVITY YET</div>
      ) : (
        <div className="activity-feed">
          {entries.map(entry => (
            <div key={entry.id} className={`activity-entry ${entry.delta < 0 ? 'consumption' : 'restock'}`}>
              <div className="activity-time">{formatTimeAgo(entry.ts)}</div>
              <div className="activity-user">
                <span className="activity-emoji">{entry.user_emoji || '👤'}</span>
                <span>{entry.username}</span>
              </div>
              <div className="activity-action">
                {entry.item_emoji || '📦'} {formatDelta(entry.delta, entry.item_unit)} of {entry.item_name}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          className="btn-secondary"
          onClick={loadMore}
          disabled={loadingMore}
          style={{ width: '100%', marginTop: 16 }}
        >
          {loadingMore ? 'LOADING...' : 'LOAD MORE'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update AdminArea.jsx**

Add import:

```jsx
import ActivityTab from './admin/ActivityTab.jsx';
```

Replace activity placeholder:

```jsx
{activeTab === 'activity' && <ActivityTab />}
```

- [ ] **Step 3: Add activity styles to styles.css**

Append:

```css
.activity-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.activity-filter {
  flex: 1;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 240, 255, 0.3);
  border-radius: 6px;
  color: white;
  padding: 8px 10px;
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  cursor: pointer;
}
.activity-filter:focus {
  outline: none;
  border-color: var(--neon-cyan);
}
.activity-filter option {
  background: #1d0c3f;
  color: white;
}

.activity-feed {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activity-entry {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  border-left: 3px solid var(--neon-cyan);
}
.activity-entry.consumption {
  border-left-color: var(--neon-pink);
}
.activity-entry.restock {
  border-left-color: #06ffa5;
}

.activity-time {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  grid-column: 1 / -1;
}

.activity-user {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.activity-emoji {
  font-size: 16px;
}

.activity-action {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  gap: 4px;
}
```

- [ ] **Step 4: Verify in browser**

Open Activity tab, confirm feed shows entries with user/item info. Test filters. Test "load more" pagination.

- [ ] **Step 5: Commit**

```bash
git add web/src/admin/ActivityTab.jsx web/src/AdminArea.jsx web/src/styles.css
git commit -m "feat: implement Activity tab with feed, filters, and pagination"
```

---

## Task 11: Frontend -- System Tab (Superadmin)

**Files:**
- Create: `web/src/admin/SystemTab.jsx`
- Modify: `web/src/AdminArea.jsx` (import and render)
- Modify: `web/src/styles.css` (append system styles)

- [ ] **Step 1: Create SystemTab.jsx**

```jsx
import { useState, useEffect } from 'react';
import { Trash2, Plus, Shield, Copy, Check, X, KeyRound, Star } from 'lucide-react';
import { auth, admin } from '../api.js';

const formatTimeAgo = (ts) => {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
};

const formatExpiry = (ts) => {
  const diff = ts - Date.now();
  if (diff <= 0) return 'expired';
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 1) return `${Math.ceil(diff / 60000)}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export default function SystemTab({ currentUserId }) {
  const [allUsers, setAllUsers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [resetPwId, setResetPwId] = useState(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [copiedCode, setCopiedCode] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const refresh = async () => {
    try {
      const [u, f, inv] = await Promise.all([
        admin.listAllUsers(),
        admin.listFamilies(),
        auth.listInvites(),
      ]);
      setAllUsers(u);
      setFamilies(f);
      setInvites(inv.filter(i => i.is_family_starter));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const toggleAdmin = async (userId, currentIsAdmin) => {
    setError('');
    try {
      await admin.updateUser(userId, { is_admin: !currentIsAdmin });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleSuperadmin = async (userId, currentIsSuperadmin) => {
    setError('');
    try {
      await admin.toggleSuperadmin(userId, !currentIsSuperadmin);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const resetPassword = async (userId) => {
    setError('');
    if (!resetPwValue || resetPwValue.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await admin.updateUser(userId, { password: resetPwValue });
      setResetPwId(null);
      setResetPwValue('');
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await auth.deleteUser(id);
      setConfirmDeleteId(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const createStarterCode = async () => {
    setError('');
    try {
      await auth.createInvite({ max_uses: 1, expires_hours: 168, is_family_starter: true });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const revokeInvite = async (id) => {
    try {
      await auth.deleteInvite(id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sortedUsers = [...allUsers].sort((a, b) => {
    let va = a[sortBy], vb = b[sortBy];
    if (sortBy === 'family_name') { va = va || ''; vb = vb || ''; }
    if (va == null) va = 0;
    if (vb == null) vb = 0;
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (loading) {
    return <div className="admin-placeholder">LOADING...</div>;
  }

  return (
    <div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="admin-section-label">{'◢'} ALL USERS {'◣'}</div>

      <div className="system-sort">
        {[
          { col: 'last_login_at', label: 'LAST SEEN' },
          { col: 'created_at', label: 'CREATED' },
          { col: 'family_name', label: 'FAMILY' },
        ].map(s => (
          <button
            key={s.col}
            className={`unit-btn ${sortBy === s.col ? 'active' : ''}`}
            onClick={() => toggleSort(s.col)}
          >
            {s.label} {sortBy === s.col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </button>
        ))}
      </div>

      <div className="user-list">
        {sortedUsers.map(u => (
          <div key={u.id} className="user-row">
            <div className="user-icon" style={u.color ? { borderColor: u.color, color: u.color } : undefined}>
              {u.emoji || '👤'}
            </div>
            <div className="user-info">
              <div className="user-name">
                {u.username}
                {u.id === currentUserId && <span className="user-self-tag">YOU</span>}
                {u.is_superadmin && <span className="user-sa-tag">SA</span>}
              </div>
              <div className="user-meta">
                {u.family_name}
                {' · '}
                {u.is_admin ? 'Admin' : 'Member'}
                {' · '}
                {formatTimeAgo(u.last_login_at)}
              </div>
            </div>
            {u.id !== currentUserId && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className={`btn-secondary-small ${u.is_admin ? 'active' : ''}`}
                  onClick={() => toggleAdmin(u.id, u.is_admin)}
                  title={u.is_admin ? 'Demote to member' : 'Promote to admin'}
                >
                  <Shield size={14} />
                </button>
                <button
                  className={`btn-secondary-small ${u.is_superadmin ? 'active' : ''}`}
                  onClick={() => toggleSuperadmin(u.id, u.is_superadmin)}
                  title={u.is_superadmin ? 'Revoke superadmin' : 'Grant superadmin'}
                  style={u.is_superadmin ? { borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' } : undefined}
                >
                  <Star size={14} />
                </button>
                <button
                  className="btn-secondary-small"
                  onClick={() => { setResetPwId(resetPwId === u.id ? null : u.id); setResetPwValue(''); }}
                  title="Reset password"
                >
                  <KeyRound size={14} />
                </button>
                {confirmDeleteId === u.id ? (
                  <>
                    <button className="btn-danger-small" onClick={() => remove(u.id)}>YES</button>
                    <button className="btn-secondary-small" onClick={() => setConfirmDeleteId(null)}>NO</button>
                  </>
                ) : (
                  <button className="btn-danger-small" onClick={() => setConfirmDeleteId(u.id)} aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
            {resetPwId === u.id && (
              <div className="reset-pw-inline">
                <input
                  type="password"
                  placeholder="New password (8+)"
                  value={resetPwValue}
                  onChange={e => setResetPwValue(e.target.value)}
                  autoFocus
                />
                <button className="btn-primary" onClick={() => resetPassword(u.id)} style={{ padding: '6px 12px', fontSize: 11 }}>SET</button>
                <button className="btn-secondary" onClick={() => { setResetPwId(null); setResetPwValue(''); }} style={{ padding: '6px 12px', fontSize: 11 }}>CANCEL</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, borderTop: '1px solid rgba(0,240,255,0.2)', paddingTop: 16 }}>
        <div className="admin-section-label">{'◢'} FAMILIES {'◣'}</div>
        <div className="family-list">
          {families.map(f => (
            <div key={f.id} className="family-row">
              <div className="family-name">{f.name}</div>
              <div className="family-stats">
                {f.member_count} members {'·'} {f.item_count} items {'·'} {new Date(f.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 28, borderTop: '1px solid rgba(255,16,240,0.3)', paddingTop: 16 }}>
        <div className="admin-section-label" style={{ color: 'var(--neon-magenta)' }}>{'◢'} NEW FAMILY CODES {'◣'}</div>

        {invites.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {invites.map(inv => (
              <div key={inv.id} className="invite-row" style={{ borderColor: 'rgba(255,16,240,0.3)' }}>
                <button className="invite-code" onClick={() => copyCode(inv.code)} title="Copy"
                  style={{ color: 'var(--neon-magenta)', borderColor: 'rgba(255,16,240,0.4)', background: 'rgba(255,16,240,0.08)' }}>
                  {inv.code}
                  {copiedCode === inv.code ? <Check size={12} /> : <Copy size={12} />}
                </button>
                <div className="invite-meta">
                  {inv.max_uses === 0 ? '∞' : `${inv.use_count}/${inv.max_uses}`} uses {'·'} {formatExpiry(inv.expires_at)}
                </div>
                <button className="btn-danger-small" onClick={() => revokeInvite(inv.id)} aria-label="Revoke" style={{ width: 28, height: 28 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={createStarterCode}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Plus size={14} /> CREATE FAMILY CODE
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update AdminArea.jsx**

Add import:

```jsx
import SystemTab from './admin/SystemTab.jsx';
```

Replace system placeholder:

```jsx
{activeTab === 'system' && <SystemTab currentUserId={user.id} />}
```

- [ ] **Step 3: Add system styles to styles.css**

Append:

```css
.system-sort {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.user-sa-tag {
  display: inline-block;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  letter-spacing: 1px;
  background: rgba(255, 16, 240, 0.2);
  color: var(--neon-magenta);
  border: 1px solid rgba(255, 16, 240, 0.4);
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
  vertical-align: middle;
}

.family-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.family-row {
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  border: 1px solid rgba(0, 240, 255, 0.15);
}

.family-name {
  font-family: 'Orbitron', sans-serif;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--neon-cyan);
  margin-bottom: 4px;
}

.family-stats {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}
```

- [ ] **Step 4: Verify in browser**

Open System tab as superadmin. Confirm global user list, sorting, family overview, family-starter codes.

- [ ] **Step 5: Commit**

```bash
git add web/src/admin/SystemTab.jsx web/src/AdminArea.jsx web/src/styles.css
git commit -m "feat: implement System tab for superadmin with global user management"
```

---

## Task 12: Retire AdminPanel.jsx

**Files:**
- Delete: `web/src/AdminPanel.jsx`
- Modify: `web/src/Inventory.jsx` (remove remaining references)

- [ ] **Step 1: Remove AdminPanel.jsx**

```bash
git rm web/src/AdminPanel.jsx
```

- [ ] **Step 2: Clean up Inventory.jsx**

Remove the AdminPanel import (line 6 if not already removed in Task 7):

```javascript
// Remove: import AdminPanel from './AdminPanel.jsx';
```

Remove the `adminOpen` state declaration (if not already removed in Task 7):

```javascript
// Remove: const [adminOpen, setAdminOpen] = useState(false);
```

Remove the AdminPanel render block (if not already removed in Task 7):

```jsx
// Remove:
// {adminOpen && (
//   <AdminPanel currentUserId={user.id} isSuperadmin={user.is_superadmin} onClose={() => setAdminOpen(false)} />
// )}
```

- [ ] **Step 3: Verify nothing references AdminPanel**

```bash
grep -r "AdminPanel" web/src/
```

Expected: no results.

- [ ] **Step 4: Commit**

```bash
git add web/src/Inventory.jsx
git commit -m "chore: retire AdminPanel.jsx in favor of admin area tabs"
```

---

## Task 13: Fix Outdated FAQ (Doc Audit)

**Files:**
- Modify: `docs/faq.md:21-28`

- [ ] **Step 1: Fix the password reset FAQ entry**

Replace lines 21-28 in `docs/faq.md` with:

```markdown
## How do I reset a password?

**If you have an email address on your account:** Use the password reset feature on the login screen. Tap "Forgot password?", enter your username, and check your email for a reset link. The link expires after 1 hour. See [Password reset](usage.md#password-reset) for details.

**If you do not have an email set:** Ask a family admin to reset your password from the admin panel (FAMILY > Users tab > key icon next to your name). The admin sets a new password and tells you what it is. Your existing sessions are logged out.

**If you are the only admin and have no email:** Reset everything (see above) or copy the database out, edit it with an SQLite tool to update the password hash, and copy it back.
```

- [ ] **Step 2: Verify no other outdated entries**

Read through the rest of `docs/faq.md` to ensure all answers are still accurate against the current codebase. The doc audit found no other critical issues.

- [ ] **Step 3: Commit**

```bash
git add docs/faq.md
git commit -m "fix: update FAQ with accurate password reset information"
```

---

## Task 14: Update Usage Docs for Admin Panel

**Files:**
- Modify: `docs/usage.md:192-256`

This task delegates prose writing to Sonnet per the CLAUDE.md convention. The content below describes what needs to change; use `model: sonnet` when executing this task.

- [ ] **Step 1: Update the Admin Panel section**

Replace the "Admin panel" section (lines 192-256) with updated content covering:

1. **Navigation**: How to access the admin panel (menu > FAMILY, now opens a dedicated admin area instead of a modal)
2. **Users tab**: List of family members with admin toggle, password reset, delete. Create user form. Invite codes (collapsible section).
3. **Settings tab**: Rename family. Danger zone (delete family, superadmin only).
4. **Activity tab**: Family-wide consumption feed with user/item filters and pagination.
5. **System tab (superadmin)**: Global user list with sort, admin/superadmin toggle, password reset, delete. Family overview. Family-starter invite codes.

Also update the Superadmin section to mention the System tab.

Follow the documentation principles in CLAUDE.md: user's goal first, explicit about side effects, task-oriented structure.

- [ ] **Step 2: Commit**

```bash
git add docs/usage.md
git commit -m "docs: update admin panel documentation for new tab-based interface"
```

---

## Task 15: Playwright Setup and Screenshot Tests

**Files:**
- Create: `playwright.config.js` (project root)
- Create: `e2e/seed.js`
- Create: `e2e/admin.spec.js`
- Create: `package.json` (project root, for Playwright dev dependency)

- [ ] **Step 1: Initialize root package.json and install Playwright**

```bash
cd /home/martijn/github/stash
npm init -y
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.js**

```javascript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'off',
  },
  webServer: [
    {
      command: 'cd server && SESSION_SECRET=test-secret-that-is-at-least-32-chars DB_PATH=./e2e-test.db node index.js',
      port: 3000,
      reuseExistingServer: false,
    },
    {
      command: 'cd web && npm run dev -- --port 5173',
      port: 5173,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
  ],
});
```

- [ ] **Step 3: Create e2e/seed.js**

```javascript
import Database from 'better-sqlite3';
import { hash } from 'argon2';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = path.join(import.meta.dirname, '..', 'server', 'e2e-test.db');

export async function seedDatabase() {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  // Import db.js to create the schema, then close and reopen for seeding
  const dbMod = await import(path.join(import.meta.dirname, '..', 'server', 'db.js'));
  dbMod.db.close();

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const now = Date.now();
  const pw = await hash('testpassword', { type: 2 });

  const family1 = db.prepare('INSERT INTO families (name, created_at) VALUES (?, ?)').run('The Testers', now);
  const family2 = db.prepare('INSERT INTO families (name, created_at) VALUES (?, ?)').run('Other Family', now);

  db.prepare(`INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, last_login_at, created_at)
    VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?)`).run('superadmin', pw, family1.lastInsertRowid, 'admin@test.com', '🦸', '#ff10f0', now, now);

  db.prepare(`INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, last_login_at, created_at)
    VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?)`).run('familyadmin', pw, family1.lastInsertRowid, 'admin2@test.com', '🤓', '#00f0ff', now - 3600000, now);

  db.prepare(`INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, last_login_at, created_at)
    VALUES (?, ?, ?, 0, 0, null, ?, ?, ?, ?)`).run('member1', pw, family1.lastInsertRowid, '😎', '#ffd60a', now - 86400000, now);

  db.prepare(`INSERT INTO users (username, password_hash, family_id, is_admin, is_superadmin, email, emoji, color, last_login_at, created_at)
    VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?)`).run('otheradmin', pw, family2.lastInsertRowid, 'other@test.com', '🐱', '#8338ec', now - 172800000, now);

  const item1 = db.prepare(`INSERT INTO items (family_id, name, emoji, color, unit, count, threshold, portion_size, rush_factor, onset_minutes, decay_minutes, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(family1.lastInsertRowid, 'Skittles', '🍬', '#ff006e', 'pcs', 42, 10, 1, 1.0, 0, 240, 0, now, now);

  const item2 = db.prepare(`INSERT INTO items (family_id, name, emoji, color, unit, count, threshold, portion_size, rush_factor, onset_minutes, decay_minutes, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(family1.lastInsertRowid, 'M&Ms', '🍫', '#ffd60a', 'pcs', 5, 15, 1, 1.2, 0, 120, 1, now, now);

  for (let i = 0; i < 20; i++) {
    const userId = i % 3 === 0 ? 1 : i % 3 === 1 ? 2 : 3;
    const itemId = i % 2 === 0 ? item1.lastInsertRowid : item2.lastInsertRowid;
    const delta = i % 5 === 0 ? 10 : -1;
    db.prepare('INSERT INTO consumption_log (user_id, family_id, item_id, delta, ts) VALUES (?, ?, ?, ?, ?)')
      .run(userId, family1.lastInsertRowid, itemId, delta, now - (i * 3600000));
  }

  db.close();
}
```

- [ ] **Step 4: Create e2e/admin.spec.js**

```javascript
import { test, expect } from '@playwright/test';
import { seedDatabase } from './seed.js';

test.beforeAll(async () => {
  await seedDatabase();
});

async function login(page, username = 'superadmin') {
  await page.goto('/');
  await page.fill('input[name="username"], input[autocomplete="username"]', username);
  await page.fill('input[type="password"]', 'testpassword');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.header');
}

async function goToAdmin(page) {
  await page.click('.menu-btn');
  await page.click('text=FAMILY');
  await page.waitForSelector('.admin-area');
}

test('Users tab - user list', async ({ page }) => {
  await login(page);
  await goToAdmin(page);
  await expect(page.locator('.admin-tab.active')).toContainText('USERS');
  await expect(page.locator('.user-row')).toHaveCount(3);
  await page.screenshot({ path: 'docs/images/admin-users.png', fullPage: true });
});

test('Settings tab', async ({ page }) => {
  await login(page);
  await goToAdmin(page);
  await page.click('text=SETTINGS');
  await expect(page.locator('input').first()).toHaveValue('The Testers');
  await page.screenshot({ path: 'docs/images/admin-settings.png', fullPage: true });
});

test('Activity tab', async ({ page }) => {
  await login(page);
  await goToAdmin(page);
  await page.click('text=ACTIVITY');
  await page.waitForSelector('.activity-feed');
  await expect(page.locator('.activity-entry')).not.toHaveCount(0);
  await page.screenshot({ path: 'docs/images/admin-activity.png', fullPage: true });
});

test('System tab - superadmin only', async ({ page }) => {
  await login(page);
  await goToAdmin(page);
  await page.click('text=SYSTEM');
  await expect(page.locator('.user-row')).toHaveCount(4);
  await expect(page.locator('.family-row')).toHaveCount(2);
  await page.screenshot({ path: 'docs/images/admin-system.png', fullPage: true });
});

test('System tab hidden for regular admin', async ({ page }) => {
  await login(page, 'familyadmin');
  await goToAdmin(page);
  await expect(page.locator('.admin-tab')).toHaveCount(3);
  await expect(page.locator('text=SYSTEM')).toHaveCount(0);
});

test('Admin menu hidden for regular member', async ({ page }) => {
  await login(page, 'member1');
  await page.click('.menu-btn');
  await expect(page.locator('text=FAMILY')).toHaveCount(0);
});
```

- [ ] **Step 5: Create docs/images directory**

```bash
mkdir -p docs/images
```

- [ ] **Step 6: Run Playwright tests**

```bash
npx playwright test
```

Expected: All tests pass, screenshots saved to `docs/images/`.

- [ ] **Step 7: Update baselines**

```bash
npx playwright test --update-snapshots
```

- [ ] **Step 8: Commit**

```bash
git add playwright.config.js e2e/ docs/images/ package.json package-lock.json
git commit -m "test: add Playwright screenshot tests for admin panels"
```

---

## Task 16: Final Cleanup and Verification

- [ ] **Step 1: Run full verification**

Start dev servers and walk through the complete verification checklist from the spec:

1. Log in as superadmin
2. Navigate to admin area via menu
3. **Users tab**: create a user, toggle admin, reset password, delete user, generate/revoke invite
4. **Settings tab**: rename family, verify name updates
5. **Activity tab**: verify feed shows entries, filters work
6. **System tab**: verify global user list, family overview, family-starter invites
7. Log in as regular admin -- verify System tab hidden
8. Log in as regular user -- verify admin menu item hidden

- [ ] **Step 2: Clean up any dead code**

Per the touched-files rule in CLAUDE.md: audit all modified files for dead functions, imports, or obsolete references. Specifically check:
- `web/src/Inventory.jsx` -- no remaining AdminPanel references
- `web/src/api.js` -- no unused exports
- `server/routes/auth.js` -- no dead branches

- [ ] **Step 3: Run Playwright tests one final time**

```bash
npx playwright test
```

Expected: All pass.

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: final cleanup for admin panels feature"
```
