# Updating

## Standard update

Stash uses a named Docker volume for the database, so updating the container does not touch your data.

```bash
# Pull the latest image
docker compose pull

# Restart with the new image
docker compose up -d
```

Docker Compose will stop the running container, start a new one with the updated image, and reattach the data volume. Downtime is a few seconds.

## Back up before updating

It is good practice to snapshot the database before any update:

```bash
docker compose exec stash \
  sh -c 'cat /data/stash.db' > backup-before-update-$(date +%F).db
```

Store this file somewhere outside the Docker volume. If anything goes wrong, you can restore it (see [Configuration - Restore](configuration/#restore)).

## Checking the current version

To see which image digest your running container uses:

```bash
docker inspect stash --format '{{.Image}}'
```

To see the image tag and creation date:

```bash
docker images ghcr.io/rouzax/stash
```

## Version pinning

The compose file uses `:latest`, which always points to the most recent release. If you want to stay on a specific version:

```yaml
image: ghcr.io/rouzax/stash:1.2.0
```

Replace `1.2.0` with the tag you want. You can find all available tags on the [GitHub Container Registry page](https://github.com/Rouzax/Stash/pkgs/container/stash).

!!! tip "When to pin"
    Pinning is useful in shared or production-like setups where you want to control exactly when you take updates. For home use, `:latest` is fine.

## Automatic updates with Watchtower

[Watchtower](https://containrrr.dev/watchtower/) can watch your containers and pull new images automatically.

Add a Watchtower service to your compose file:

```yaml
services:
  stash:
    image: ghcr.io/rouzax/stash:latest
    container_name: stash
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - stash-data:/data
    environment:
      SESSION_SECRET: ${SESSION_SECRET:?Generate with openssl rand -hex 32}
      BEHIND_PROXY: ${BEHIND_PROXY:-true}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      TZ: ${TZ:-Europe/Amsterdam}

  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 86400 stash

volumes:
  stash-data:
```

The `--interval 86400` flag checks for updates once a day (86400 seconds). The `stash` argument at the end tells Watchtower to only watch that specific container.

!!! warning "Watchtower updates without notice"
    Watchtower restarts the container as soon as it finds a new image. This means brief downtime at an unpredictable time. If that is a problem, remove the Watchtower service and update manually.
