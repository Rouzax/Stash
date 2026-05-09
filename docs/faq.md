# FAQ

## How do I reset everything and start over?

Stop the container, delete the database file from the volume, and start again:

```bash
docker compose -f docker-compose.prod.yml down

# Remove the database (this deletes all users, items, and history)
docker run --rm -v stash_stash-data:/data alpine rm /data/stash.db

docker compose -f docker-compose.prod.yml up -d
```

The next time you open Stash, the bootstrap form appears again.

!!! warning "This deletes everything"
    All users, items, invite codes, and consumption history are gone. Back up the database first if you might want to recover any of it.

## How do I reset the admin password?

There is no password reset email or recovery form. If you lose the admin password, the options are:

1. If another admin account exists, log in as that account and delete/recreate the locked-out account.
2. If there is only one admin, reset everything (see above) and start fresh, or copy the database out, edit it with an SQLite tool to update the password hash, and copy it back.

The simplest path for a home setup is usually option 2 (reset). Your items and history are rarely worth recovering compared to the hassle of editing a database manually.

## Can I run Stash without Docker?

Yes. See the [Contributing](contributing/#development-setup) page for the dev setup instructions. It works on any machine with Node.js 22 or later and npm. There is no migration framework: the schema is created from scratch on first boot.

## Is my data safe when I update?

Yes. The database lives on a named Docker volume (`stash-data`), which is separate from the container image. Pulling a new image and restarting the container does not touch the volume.

The only way to lose data is to explicitly delete the volume (`docker volume rm`) or run `rm` inside the container.

## How do I migrate to a different server?

1. On the old server, back up the database:

    ```bash
    docker compose -f docker-compose.prod.yml exec stash \
      sh -c 'cat /data/stash.db' > stash-backup.db
    ```

2. On the new server, set up Stash following the [Installation](installation/) guide, but do not open the browser yet.

3. Copy the backup file to the new server and restore it:

    ```bash
    docker compose -f docker-compose.prod.yml down

    docker run --rm \
      -v stash_stash-data:/data \
      -v $(pwd):/backup \
      alpine sh -c "cp /backup/stash-backup.db /data/stash.db"

    docker compose -f docker-compose.prod.yml up -d
    ```

4. Open the browser on the new server. You should see your existing family and items.

## What browsers does Stash support?

Any modern browser works: Chrome, Firefox, Safari, Edge. The app is a single-page React application and runs entirely in the browser after the initial load. No special extensions required.

## Can multiple families share one Stash instance?

Yes. Each family is completely separate: shared items, consumption logs, and users are all scoped to a family. Family members cannot see other families' data.

An admin can only manage their own family. There is no super-admin role that spans families. To set up a second family, someone from that family needs to register through an invite code (which creates a new family automatically; this is the bootstrap path for subsequent families after the first one is created directly).

## How do invite codes work?

An admin generates a code in the admin panel. They choose how many times it can be used and when it expires. The code is a random 8-character string (letters and numbers, no ambiguous characters like `0`, `O`, `1`, `I`).

The invited person opens Stash, taps **Sign up with invite code**, and enters the code. If the code is valid and has uses remaining, their new account is created and automatically joined to the admin's family.

Once a code reaches its use limit or expires, it stops working. The admin can also revoke it early from the admin panel.

## What happens when an item's stock hits zero?

The count is clamped at zero. You can still tap the take buttons, but nothing happens: the server rejects deltas that would make the count negative. The card will be showing a low-stock pulse (if you have a threshold set) to remind you to restock.

Use the **+** button or the edit form to set the count back to a positive number when you restock.

## Why do my charts show 0 after a fresh install?

Charts are built from the consumption log, which only has entries from the moment you started taking items with this installation. If you imported a database backup, the log entries from the backup will appear in the charts.

## What does "decay" mean on an item?

Decay is the time window over which one portion's contribution to the Rush-O-Meter fades from full to zero. A decay of 4 hours means: if you took one standard portion right now, your rush meter would be at 100%. In 2 hours it would be at 50%. In 4 hours it would be at 0%.

Shorter decay = the rush disappears faster. Longer decay = it lingers. Set it to match how long you feel the real-world effect of the item.
