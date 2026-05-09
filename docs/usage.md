# Usage

## First login (bootstrap)

When you open Stash for the first time, a setup form appears. Fill it in:

- **Family name** - the name for your household's shared stash (e.g. "The Smiths", "Apartment 4B")
- **Username** - your personal login handle
- **Password** - at least 8 characters
- **Emoji** - an avatar for yourself (optional, defaults to 😎)

Submit the form. You land on the main inventory screen, logged in as admin. This form only appears once. After this, new members must be invited.

## Inviting members

New family members join by entering an invite code you generate for them.

1. Open the menu (three dots, top right) and tap **FAMILY**.
2. In the admin panel, scroll to **Invite Codes** and tap **Generate Invite**.
3. Choose how many uses the code allows (1, 5, or unlimited) and how long it stays valid (1 hour, 24 hours, or 7 days).
4. Copy the code and send it to your family member.

The family member opens Stash, sees the login page, and clicks **Sign up with invite code**. They enter the code, pick a username and password, and join your family automatically.

!!! info "Invite codes are case-insensitive"
    Codes are displayed in uppercase but the registration form accepts any case.

## Adding items

Open the menu and tap the **+** button (or the plus icon in the header) to add an item.

Fill in the fields:

| Field | What it does |
|---|---|
| **Name** | What to call the item (e.g. "Tikkels", "Protein Powder") |
| **Emoji / Icon** | Pick from the presets or type your own |
| **Neon color** | Color for the card glow and accents |
| **Unit** | `pcs` (pieces), `mg`, `g`, or `ml` |
| **Starting count** | How many you have right now |
| **Low-stock threshold** | The count at which the card starts pulsing. Set to 0 to disable. |
| **Portion size** | How much one tap of TAKE removes. Defaults to 1 for `pcs`, 100 for `mg` and `g`, 250 for `ml`. |
| **Rush %** | How much this item contributes to the Rush-O-Meter relative to a standard portion. 100% is default. Set higher for stronger items, lower for milder ones. |
| **Decay** | How long until one portion's rush contribution fades to zero. Options: 30 min, 1 h, 2 h, 4 h, 6 h, 8 h. |

Tap **SAVE** and the item appears on the inventory grid.

To edit an item, tap the pencil icon on its card.

## Taking items

Each item card has two take buttons:

- **TAKE** - removes one full portion (whatever `portion_size` is set to)
- **±¼** - removes one quarter of a portion

Long-pressing either button removes ten portions at once (useful for restocking in reverse, or tracking a big session).

To add stock (restock), use the **+** button on the card. Long-press **+** to add ten at once.

The count on screen updates immediately. If the request fails, the count snaps back.

!!! tip "Quarter doses"
    The ±¼ button is useful for items you consume in fractions (half a gummy, a small sip of a drink). The quarter step is `portion_size ÷ 4`.

## Rush-O-Meter

The Rush-O-Meter is a bar at the top of the inventory screen. It shows how much you have consumed recently, expressed as a percentage.

### How it works

Every time you take an item, the server logs the consumption with a timestamp. The Rush-O-Meter replays those log entries, applies each item's rush factor and portion size, and calculates a rolling score. Each portion's contribution decays linearly to zero over the item's decay window. The meter ticks down on its own as time passes.

The math:

- **Rush score** = sum over recent consumptions of `(rush_factor × portions_consumed × (1 − age / decay_window))`
- **Rush %** = `rush_score × 100`

A single standard portion (rush factor 1.0, decay 4 hours) at the moment of consumption = 100%.

### Mascot tiers

The mascot emoji in the header reflects your current rush level:

| Rush % | Mascot | Label |
|---|---|---|
| 0–25 | 😴 | CHILL |
| 25–50 | 🙂 | WARMING UP |
| 50–75 | 😄 | HYPED |
| 75–150 | 🤪 | FULL RAVE |
| 150–250 | 🤯 | OVERDRIVE |
| 250+ | 💀 | COMA |

### Per-item rush configuration

You control two settings per item:

- **Rush %**: scales the contribution of each portion. 200% means one portion counts as two standard portions toward the meter. 50% means half. Range: 10%–1000%.
- **Decay**: how long before that portion's contribution fades. Shorter decay = faster recovery.

These settings let you model the real-world difference between, say, a piece of dark chocolate (high rush, fast decay) and a cup of tea (low rush, slow decay).

### Resetting the meter

If you want to clear your rush history without deleting consumption data, tap the Rush-O-Meter bar. A reset button appears. Tapping it sets a "reset timestamp": log entries before that timestamp are ignored when calculating your current rush level. Your charts are not affected.

## Charts

Below the item grid, you see a bar chart of rush units consumed over time. Use the **WEEK** / **YEAR** toggle to switch views:

- **WEEK** - past 7 days, one bar per day
- **YEAR** - past 12 months, one bar per month

The chart shows your own consumption only; each person's chart is private to their account.

## Low-stock alerts

When an item's count drops to or below its **threshold**, the card starts pulsing with a neon-pink glow. This is a visual reminder to restock.

To configure:

1. Tap the pencil icon on the item card.
2. Set the **Low-stock threshold** field to the count at which you want the alert.
3. Save.

Set the threshold to `0` to disable alerts for that item.

## Profile settings

Tap your name pill in the top-right corner (or go to menu → PROFILE) to open your profile settings.

You can change:

- **Emoji** - your avatar shown in the header pill
- **Color** - the neon color associated with your account
- **Email** - optional, stored but not used for notifications

Your username cannot be changed after registration. To change your password, see below.

## Admin panel

Open the menu and tap **FAMILY** (visible only to admins) to manage your family.

### Managing members

The admin panel lists all accounts in your family. For each member you can:

- See their username and admin status
- Delete their account (you cannot delete your own account)

To create a new account directly without an invite code:

1. Tap **New User** in the admin panel.
2. Fill in username, password, email (optional), emoji, and whether the account should be admin.
3. Tap **Create**.

### Invite codes

The **Invite Codes** section lists all active codes. For each code you see:

- The code itself (tap the copy icon to copy it)
- How many uses are left
- When it expires

Tap the trash icon to revoke a code before it expires.

To generate a new code:

1. Tap **Generate Invite**.
2. Choose max uses: `1`, `5`, or `∞` (unlimited).
3. Choose expiry: `1h`, `24h`, or `7d`.
4. Copy the code and share it.

## Changing your password

Open the menu and tap **PASSWORD**.

Enter your current password, then your new password (minimum 8 characters). Tap **Change Password**.

Changing your password invalidates all your other sessions, so any other browser or device logged in as you will be signed out.
