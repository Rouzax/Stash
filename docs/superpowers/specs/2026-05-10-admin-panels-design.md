# Admin & Super Admin Panels

## Context

Stash's admin surface is a single modal overlay ("FAMILY" in the hamburger menu) that handles user creation/deletion and invite codes. Superadmins get one extra section for family-starter codes. This is adequate for basic user management but insufficient as the app grows: admins cannot promote/demote users, reset passwords, rename families, or see family activity. Superadmins lack any global user or family overview.

This design replaces the admin modal with a dedicated admin area, organized by tabs, that gives family admins full user lifecycle management, family settings, and an activity feed. Superadmins get a System tab with cross-family user management and family oversight.

The work is phased: phase 1 delivers the core admin area described here. Phase 2 (out of scope) adds analytics dashboards, audit logging, and account suspension.

## Navigation & Access

### Entry point

The "FAMILY" menu item in the hamburger menu transitions the app to a new top-level view (`view: 'admin'`) in App.jsx's state machine. Instead of opening a modal, it renders the admin area as a full-page view with its own header, tab bar, and a back button to return to inventory.

### Who sees what

| Role | Tabs visible |
|------|-------------|
| Regular user | No menu item, no access |
| Family admin | Users, Settings, Activity |
| Superadmin | Users, Settings, Activity, System |

### Tab bar

Horizontal tabs below the admin header. Active tab uses a neon accent underline. Synthwave-styled consistent with the rest of the app.

## Tab: Users (Family Admin)

Replaces and expands the current user list section of the admin modal.

### User list

Each row displays:
- User emoji
- Username
- Role badge: "Admin" or "Member"
- Email (if set)
- Last logon time (relative, e.g. "2h ago")
- Created date
- "YOU" tag for the current user

### Actions per user

| Action | Conditions |
|--------|-----------|
| Toggle admin | Cannot demote yourself; cannot remove the last admin from a family |
| Reset password | Admin sets a new password; invalidates all existing sessions for that user |
| Delete user | Confirmation required; cannot delete yourself |

### Create user form

Same fields as today (username, password, email, emoji, admin toggle) integrated into the tab view instead of a modal card.

### Invite codes

The member invite section moves here as a collapsible section below the user list. Same create/revoke functionality as today.

### Schema change: last_login_at

Add a `last_login_at` column (INTEGER, nullable) to the users table. Updated on each successful login in `POST /api/auth/login`. Migration follows the existing `ALTER TABLE` pattern in `db.js`.

## Tab: Settings (Family Admin)

### Family identity

- **Family name**: editable text field, saved via `PATCH /api/families/:id`

### Danger zone

- **Delete family** (superadmin only): cascading delete of all users, items, consumption logs, invite codes, and sessions. Requires typing the family name to confirm. Only visible to superadmins viewing their own or another family's settings.

## Tab: Activity (Family Admin)

A chronological feed of recent family activity. Data sourced from the `consumption_log` table (already indexed on `family_id, ts`).

### Feed entries

Each entry shows:
- Timestamp (relative)
- User emoji + username
- Action: "consumed 2 pcs of Skittles" / "restocked +10 pcs of M&Ms"
- Negative delta = consumption, positive = restock

### Filters

Two dropdown filters at the top of the feed:
- **Filter by user**: populated from family members
- **Filter by item**: populated from family items
- Both optional, combinable

### Pagination

Load the most recent 50 entries. "Load more" button fetches the next 50. No infinite scroll.

## Tab: System (Superadmin Only)

### Global user list

All users across all families in one table:
- Emoji, username, family name, role (Admin/Member/Superadmin), email, last logon, created date
- Sortable by: last logon, created date, family name

### User actions (cross-family)

Same capabilities as the family-level Users tab, but operating on any user:
- Toggle admin status
- Toggle superadmin status (promote/demote)
- Reset password (invalidates sessions)
- Delete user (with confirmation)

Safety constraints:
- Cannot demote yourself from superadmin if you are the last superadmin
- Cannot delete yourself

### Family overview

A summary list of all families:
- Family name, member count, item count, created date
- No drill-down into family items or consumption data

### Family-starter invite codes

Moves from the current admin modal's superadmin section into this tab. Same create (1-use, 7d expiry) and revoke functionality.

## API Changes

### New endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `PATCH /api/auth/users/:id` | PATCH | Update user. Body: `{ is_admin?: boolean, password?: string }`. Each field is optional; at least one required. | Admin (own family) or Superadmin |
| `PATCH /api/auth/users/:id/superadmin` | PATCH | Toggle `is_superadmin` | Superadmin only |
| `GET /api/auth/users/all` | GET | List all users across families (with family name, last logon) | Superadmin only |
| `GET /api/families` | GET | List all families with member/item counts | Superadmin only |
| `PATCH /api/families/:id` | PATCH | Rename family | Admin (own family) or Superadmin |
| `DELETE /api/families/:id` | DELETE | Delete family (cascade) | Superadmin only |
| `GET /api/log/family` | GET | Family-wide activity feed. Query params: `limit` (default 50), `before` (timestamp cursor for pagination), `user_id` (optional filter), `item_id` (optional filter). Returns entries and `has_more` flag. | Admin |

### Modified endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/auth/login` | Also sets `last_login_at = Date.now()` on the user row |
| `GET /api/auth/users` | Also returns `last_login_at` per user |
| `DELETE /api/auth/users/:id` | Superadmin can delete users from any family (currently restricted to own family) |
| `DELETE /api/auth/invites/:id` | Superadmin can revoke family-starter invites (currently limited to own family) |

### Existing endpoints

All other endpoints remain unchanged.

## Security

### Authorization enforcement

- Every endpoint checks auth server-side (not just UI hiding)
- `PATCH /api/auth/users/:id`: admin must be in the same family as the target user, OR be a superadmin
- `PATCH /api/auth/users/:id/superadmin`: only superadmins
- `DELETE /api/families/:id`: only superadmins; cannot delete a family if it would orphan the last superadmin
- Admin toggle must prevent removing the last admin from a family
- Superadmin demote must prevent removing the last superadmin from the system

### Session invalidation

- When an admin resets another user's password, all of that user's sessions are deleted
- When a family is deleted, all sessions for users in that family are deleted

### Password reset behavior

- Admin sets a new password directly (no token/email flow)
- The target user's existing sessions are invalidated
- The new password is not echoed back; admin must communicate it out-of-band

## Frontend Architecture

### Component structure

```
App.jsx (state machine: add 'admin' view state)
  +-- AdminArea.jsx (new: top-level admin view)
        +-- AdminHeader.jsx (back button, title, tab bar)
        +-- UsersTab.jsx (refactored from AdminPanel.jsx)
        +-- SettingsTab.jsx (new)
        +-- ActivityTab.jsx (new)
        +-- SystemTab.jsx (new, superadmin only)
```

### Transition from AdminPanel.jsx

AdminPanel.jsx is retired. Its user list, create form, and invite sections move into UsersTab.jsx. The superadmin family-starter section moves into SystemTab.jsx.

### API client additions (api.js)

```javascript
export const admin = {
  updateUser: (id, data) => api.patch(`/api/auth/users/${id}`, data),
  toggleSuperadmin: (id, is_superadmin) => api.patch(`/api/auth/users/${id}/superadmin`, { is_superadmin }),
  listAllUsers: () => api.get('/api/auth/users/all'),
  listFamilies: () => api.get('/api/families'),
  renameFamily: (id, name) => api.patch(`/api/families/${id}`, { name }),
  deleteFamily: (id) => api.del(`/api/families/${id}`),
  familyActivity: (params) => api.get(`/api/log/family?${new URLSearchParams(params)}`),
};
```

## Documentation

### Admin panel docs

Update `docs/usage.md` to document admin panel features: what admins can do, what superadmins can do. Follow the project's documentation principles (user's goal first, explicit about side effects, task-oriented structure). Delegate prose writing to Sonnet per CLAUDE.md convention.

### Doc audit for recent features

Audit all recent commits against existing documentation. Several features have shipped without corresponding doc updates. As part of this work, review git history and ensure docs cover all user-facing features, not just the admin panels.

## Playwright Screenshots

### Setup

- Add Playwright as a dev dependency at the project root
- Create `playwright.config.js` configured for the Stash frontend
- Create a test harness that seeds a database with test data (families, users, items, consumption log entries)

### Screenshot scenarios

| Scenario | Description |
|----------|-------------|
| Users tab | User list with multiple members, admin badges, last logon times |
| Create user | The create user form expanded |
| Settings tab | Family name field and danger zone |
| Activity feed | Feed with mixed consumption/restock entries and filters |
| System tab (superadmin) | Global user list, family overview, family-starter codes |

### Dual purpose

- **Visual regression**: baseline comparison in CI, fails if UI drifts
- **Documentation**: screenshots exported to `docs/images/` for use in docs pages

## Verification

1. Start dev servers (backend + frontend)
2. Log in as superadmin
3. Navigate to admin area via menu
4. **Users tab**: create a user, toggle admin, reset password, delete user, generate/revoke invite
5. **Settings tab**: rename family, verify name updates across the app
6. **Activity tab**: verify feed shows recent consumption/restock entries, filters work
7. **System tab**: verify global user list shows users from all families, family overview shows correct counts, family-starter invites work
8. Log in as regular admin (non-superadmin) and verify System tab is not visible
9. Log in as regular user and verify admin menu item is not visible
10. Run Playwright tests and verify screenshots match baselines
