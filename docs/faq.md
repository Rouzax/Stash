# FAQ

## How do I reset everything and start over?

Stop the container, delete the database file from the volume, and start again:

```bash
docker compose down

# Remove the database (this deletes all users, items, and history)
docker run --rm -v stash_stash-data:/data alpine rm /data/stash.db

docker compose up -d
```

The next time you open Stash, the bootstrap form appears again.

!!! warning "This deletes everything"
    All users, items, invite codes, and consumption history are gone. Back up the database first if you might want to recover any of it.

## How do I reset a password?

**If you have an email address on your account:** Use the password reset feature on the login screen. Tap "Forgot password?", enter your username, and check your email for a reset link. The link expires after 1 hour. See [Password reset](usage.md#password-reset) for details.

**If you do not have an email set:** Ask a family admin to reset your password from the admin panel (FAMILY > Users tab > key icon next to your name). The admin sets a new password and tells you what it is. Your existing sessions are logged out.

**If you are the only admin and have no email:** Reset everything (see above) or copy the database out, edit it with an SQLite tool to update the password hash, and copy it back.

## Can I run Stash without Docker?

Yes. See the [Contributing](contributing/#development-setup) page for the dev setup instructions. It works on any machine with Node.js 22 or later and npm. There is no migration framework: the schema is created from scratch on first boot.

## Is my data safe when I update?

Yes. The database lives on a named Docker volume (`stash-data`), which is separate from the container image. Pulling a new image and restarting the container does not touch the volume.

The only way to lose data is to explicitly delete the volume (`docker volume rm`) or run `rm` inside the container.

## How do I migrate to a different server?

1. On the old server, back up the database:

    ```bash
    docker compose exec stash \
      sh -c 'cat /data/stash.db' > stash-backup.db
    ```

2. On the new server, set up Stash following the [Installation](installation/) guide, but do not open the browser yet.

3. Copy the backup file to the new server and restore it:

    ```bash
    docker compose down

    docker run --rm \
      -v stash_stash-data:/data \
      -v $(pwd):/backup \
      alpine sh -c "cp /backup/stash-backup.db /data/stash.db"

    docker compose up -d
    ```

4. Open the browser on the new server. You should see your existing family and items.

## What browsers does Stash support?

Any modern browser works: Chrome, Firefox, Safari, Edge. The app is a single-page React application and runs entirely in the browser after the initial load. No special extensions required.

## Can multiple families share one Stash instance?

Yes. Each family is completely separate: shared items, consumption logs, and users are all scoped to a family. Family members cannot see other families' data.

A regular family admin can only manage their own family. The superadmin (the account created during bootstrap) can create family starter codes to provision new families. See [How do I add a new family?](#how-do-i-add-a-new-family) below.

## How do I add a new family?

Only the superadmin can add new families. There is no open or self-service registration.

1. Log in as the superadmin.
2. Open the menu and tap **FAMILY**.
3. Scroll to **NEW FAMILY CODES** (the pink section) and tap **Generate Code**.
4. Copy the code and send it to the person who will run the new family.

That person goes to the Stash join screen, enters the starter code in the **INVITE CODE** field, and clicks **CONTINUE**. The app confirms they are creating a new family. They fill in a **FAMILY NAME**, pick a username and password, then click **CREATE FAMILY**. Their account is created, a new family is set up with the name they chose, and they become that family's admin. They can then invite their own family members with member invites.

## How do invite codes work?

There are two kinds of invite codes:

**Member invites** are created by any family admin in the **MEMBER INVITES** section of the admin panel. The invited person enters the code on the join screen and clicks **CONTINUE**. The app shows which family they are joining, and they pick a username and password and click **JOIN FAMILY** to be added to that admin's family.

**Family starter codes** are created only by the superadmin in the **NEW FAMILY CODES** section. The recipient enters the code on the join screen and clicks **CONTINUE**. The app shows they are creating a new family, and they fill in a family name and their credentials, then click **CREATE FAMILY**. A new family is created with that name and they become its admin.

For both types: the admin chooses how many times the code can be used and when it expires. The code is a random 8-character string (letters and numbers, no ambiguous characters like `0`, `O`, `1`, `I`).

Once a code reaches its use limit or expires, it stops working. The admin can also revoke it early from the admin panel.

## What happens when an item's stock hits zero?

The count is clamped at zero. You can still tap the take buttons, but nothing happens: the server rejects deltas that would make the count negative. The card will be showing a low-stock pulse (if you have a threshold set) to remind you to restock.

Use the **+** button or the edit form to set the count back to a positive number when you restock.

## What happens when I delete an item?

The item disappears from the inventory grid immediately. Your consumption history for that item is not deleted: past entries still count toward your rush meter, appear in your charts, and show up in the admin activity feed. In the activity feed, the item's name stays visible with a "(removed)" label so you can still tell what it was.

The item row is kept in the database with a deletion timestamp. There is currently no way to restore a deleted item from the UI.

## If I change an item's rush settings, do my old charts change?

No. Every time you take an item, Stash captures the rush settings in effect at that moment (rush factor, portion size, onset, and decay). Charts and rush calculations always use those captured values for past entries, not the item's current settings. Updating an item's rush configuration only affects consumption logged from that point forward.

## Can I log something I forgot to track?

Yes. Tap the pencil icon next to the chart title on the main inventory screen to open the history editor. Tap ADD, select the item, enter the amount, and pick the date and time it happened. The entry is added to your chart and rush meter as if you had logged it at that time.

Adding a history entry does not change the item's current stock count. If you also need to adjust stock, use the item's TAKE or + buttons separately.

## Why do my charts show 0 after a fresh install?

Charts are built from the consumption log, which only has entries from the moment you started taking items with this installation. If you imported a database backup, the log entries from the backup will appear in the charts.

## What does "decay" mean on an item?

Decay is the time window over which one portion's contribution to the Rush-O-Meter fades from full to zero. A decay of 4 hours means: if you took one standard portion right now, your rush meter would be at 100%. In 2 hours it would be at 50%. In 4 hours it would be at 0%.

Shorter decay = the rush disappears faster. Longer decay = it lingers. Set it to match how long you feel the real-world effect of the item.
