# Email Notifications Design

## Context

Stash currently has no way to notify users about events outside the app. If an item runs low, nobody knows until they open the UI. If a user forgets their password, an admin has to manually reset it. Email notifications solve both problems and add a weekly consumption digest and rush meter warnings.

## Requirements

- Four notification types: low stock alerts, weekly digest, rush meter warnings, password reset
- Per-user opt-in for each type (except password reset, which is on-demand)
- External SMTP via environment variables (nodemailer)
- Synthwave-themed HTML templates with plain-text fallbacks
- Inline fire-and-forget sending (no queue infrastructure)
- In-memory rate limiting to prevent spam
- Graceful degradation when SMTP is not configured

## Data Model

### `notification_preferences` table

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  low_stock INTEGER NOT NULL DEFAULT 0,
  weekly_digest INTEGER NOT NULL DEFAULT 0,
  rush_warning INTEGER NOT NULL DEFAULT 0
);
```

Row created on first preference update. All default to off (opt-in).

### `password_reset_tokens` table

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
```

Tokens are single-use, expire after 1 hour. Pruned on server start (same pattern as consumption_log).

No changes to the existing `users` table -- the `email` column already exists.

## Email Service Module (`server/email.js`)

Single module that owns all email sending.

### Initialization

Creates a nodemailer transporter from env vars:

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (default 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender address (e.g., `Stash <stash@example.com>`) |

If `SMTP_HOST` is not set, the module logs a warning at startup and all send functions become no-ops. The app works fine without email configured.

### Public API

- `sendLowStockAlert(user, item)` -- item count crossed below threshold
- `sendWeeklyDigest(user, familyStats)` -- weekly consumption summary
- `sendRushWarning(user, meterLevel)` -- rush meter crossed 80%
- `sendPasswordReset(user, resetUrl)` -- password reset link

Each function:
1. Checks if transporter is configured (no-op if not)
2. For non-reset emails, checks user's notification preferences
3. Checks user has an email address set
4. Renders the HTML + plain-text template
5. Calls `transporter.sendMail()` fire-and-forget (`.catch(err => log.error(...))`)

### Rate Limiting

In-memory map tracking `lastSent` timestamps per `{type, key}`. Resets on server restart.

| Type | Key | Limit |
|------|-----|-------|
| Low stock | item ID | 1 per 6 hours |
| Rush warning | user ID | 1 per 4 hours |
| Password reset | user ID | 3 per hour |
| Weekly digest | schedule | inherently limited |

## Notification Triggers

### Low stock alert

In the item adjust route (`POST /api/items/:id/adjust`), after the transaction:

```
if (newCount <= item.threshold && newCount > 0) {
  // find all family members with low_stock preference enabled
  // send each one a low-stock email (rate-limited per item)
}
```

Only fires on consumption adjustments (negative delta), not on PATCH restocking. Sends to all opted-in family members, not just the consumer.

### Rush meter warning

In the same adjust route, after updating consumption_log. Calculate the user's current rush level. If it crosses 80%, send the consuming user a warning (if they opted in to rush_warning).

### Weekly digest

A `setInterval` in `server/index.js` that fires once per hour. On Monday at 08:00 (server-local time):

1. For each family, aggregate the week's consumption_log
2. For each opted-in user, send a digest containing:
   - Top consumed items (name, amount, biggest consumer)
   - Current low-stock items
   - Total family consumption
   - Fun stat (e.g., most snacked day of the week)

### Password reset

New unauthenticated routes:

- `POST /api/auth/forgot-password` -- accepts `{ username }`, looks up user, generates token, sends email. Always returns 200 regardless of whether user exists (prevent user enumeration).
- `POST /api/auth/reset-password` -- accepts `{ token, newPassword }`, validates token (not expired, not used), updates password hash, marks token as used.

## API Endpoints

| Method | Path | Auth | Body | Purpose |
|--------|------|------|------|---------|
| GET | `/api/notifications/preferences` | requireAuth | -- | Get current user's notification preferences |
| PUT | `/api/notifications/preferences` | requireAuth | `{ low_stock, weekly_digest, rush_warning }` | Update preferences (0/1 booleans) |
| POST | `/api/auth/forgot-password` | none | `{ username }` | Request password reset email |
| POST | `/api/auth/reset-password` | none | `{ token, newPassword }` | Set new password with valid token |

## Frontend Changes

### Profile/Settings page

Add a "Notifications" section with three toggles:
- Low stock alerts
- Weekly digest
- Rush meter warnings

All toggles disabled with hint text ("Set your email to enable notifications") until the user has an email address configured. Toggles call `PUT /api/notifications/preferences` on change.

### Login page

Add a "Forgot password?" link below the login form. Opens a simple form: enter username, submit, see "Check your email" confirmation. No indication of whether the username exists.

### Reset password page

New route: `/reset-password?token=xxx`

Form with new password + confirm fields. On submit, calls `POST /api/auth/reset-password`. On success, redirects to login with a success message. On invalid/expired token, shows an error with a link to request a new reset.

## Email Templates

### Shared layout

All templates use a common wrapper function:

- Background: `#1a1a2e` (deep dark blue)
- Content card: `#16213e` with `#0f3460` border
- Primary accent: `#e94560` (neon pink) for headings and CTA buttons
- Secondary accent: `#00d2d3` (neon cyan) for highlights and links
- Text color: `#e0e0e0` (soft white)
- Font: system font stack (no web fonts)
- Max width: 600px, centered
- Header: "Stash" in neon pink with CSS text-shadow glow
- Footer: "Sent by Stash" + manage preferences link
- All CSS inline (email client compatibility)

### Low stock alert

Item name with emoji, current count vs threshold, "Time to restock!" call-to-action linking to the app.

### Weekly digest

Table of top consumed items (name, amount, top consumer), list of current low-stock items, total family consumption stat, one fun stat line. Readable summary format.

### Rush warning

Visual rush level bar (HTML table-based), list of contributing items, friendly "maybe ease up" message. Light-hearted tone matching the app personality.

### Password reset

Minimal: reset CTA button, expiry notice (1 hour), "if you didn't request this, ignore this email" disclaimer.

### Plain-text fallbacks

Every template includes a plain-text alternative with the same information, formatted for readability without HTML.

## Environment Configuration

Add to `.env.example` and document in README:

```env
# Email (optional -- app works without these)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Stash <stash@example.com>
```

Add to `docker-compose.yml` as optional environment variables.

## Files to Create or Modify

### New files
- `server/email.js` -- email service module (transporter, rate limiter, send functions)
- `server/templates/` -- directory with template functions (or inline in email.js)
- `server/routes/notifications.js` -- preference endpoints
- `web/src/pages/ForgotPassword.jsx` -- forgot password form
- `web/src/pages/ResetPassword.jsx` -- reset password form

### Modified files
- `server/db.js` -- add notification_preferences and password_reset_tokens tables
- `server/index.js` -- register notification routes, start weekly digest scheduler, prune expired tokens on start
- `server/routes/auth.js` -- add forgot-password and reset-password endpoints
- `server/routes/items.js` -- add low-stock and rush-warning trigger logic after adjust
- `server/package.json` -- add nodemailer dependency
- `web/src/App.jsx` -- add routes for forgot/reset password pages
- `web/src/pages/Profile.jsx` (or equivalent settings component) -- add notification preferences UI
- `web/src/pages/Login.jsx` (or equivalent) -- add "Forgot password?" link
- `.env.example` -- add SMTP variables
- `docker-compose.yml` -- add SMTP environment variables

## Verification

1. **SMTP not configured**: Start server without SMTP env vars. Verify warning is logged, app functions normally, no errors on actions that would trigger notifications.
2. **Low stock alert**: Configure SMTP, set an item threshold to 5, set count to 6, opt in to low_stock, adjust item by -1. Verify email received. Adjust again immediately -- verify rate limit prevents duplicate.
3. **Rush warning**: Consume items rapidly until rush meter exceeds 80%. Verify warning email sent (if opted in).
4. **Weekly digest**: Temporarily override the schedule check to fire immediately. Verify digest email contains correct consumption data for the family.
5. **Password reset**: Request reset for existing user with email. Verify email with valid link. Click link, set new password, log in with new password. Verify expired/used tokens are rejected.
6. **Preference toggles**: Toggle each preference on/off, verify persistence across page reloads. Verify toggles are disabled when no email is set.
7. **Template rendering**: Visually inspect each email type in a mail client for synthwave styling, layout, and plain-text fallback.
