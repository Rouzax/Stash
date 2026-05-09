# Installation

Stash runs as a single Docker container with a named volume for the database. You need Docker and Docker Compose - nothing else.

## Prerequisites

- Docker 24 or later
- Docker Compose v2 (`docker compose`, not `docker-compose`)
- A machine with a port you can reach from the browser (or a reverse proxy)

## Step 1 - Create a directory

```bash
mkdir stash && cd stash
```

## Step 2 - Get the compose file

Download the production compose file:

```bash
curl -sSL https://raw.githubusercontent.com/Rouzax/Stash/main/docker-compose.prod.yml \
  -o docker-compose.prod.yml
```

Or create it manually:

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

volumes:
  stash-data:
```

## Step 3 - Create the .env file

Generate a random session secret and write it to `.env`:

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
```

!!! warning "Keep this secret safe"
    The `SESSION_SECRET` signs all session cookies. If you change it, every logged-in user will be signed out. If you lose it, generate a new one and restart - the database is unaffected.

Your `.env` should look something like this:

```
SESSION_SECRET=a3f8c2e1d4b7a9f0e5c3b8d1a6f4e2c9b7a3d8f1e4c2b9a6d3f7e1c4b8a5d2
```

Add other variables as needed (see [Configuration](configuration/) for the full list):

```
TZ=America/New_York
PORT=8080
```

## Step 4 - Start the container

```bash
docker compose -f docker-compose.prod.yml up -d
```

Docker will pull the image from the GitHub Container Registry and start the container. The database is created automatically on first boot.

## Step 5 - Bootstrap your family

Open `http://your-host:3000` in a browser.

The first time you open Stash, you see a setup form:

1. **Family name** - what to call your household (e.g. "The Smiths")
2. **Username** - your admin account username
3. **Password** - at least 8 characters
4. **Emoji** - pick one to represent yourself (optional)

Submit the form. You are now logged in as admin. To add other family members, see [Inviting Members](usage/#inviting-members).

!!! info "Only runs once"
    The bootstrap form only appears when the database has no users. Once you submit it, it is gone. If you need to start over, see the [FAQ](faq/#how-do-i-reset-everything).

## Step 6 - Verify the container is healthy

```bash
docker inspect --format='{{.State.Health.Status}}' stash
```

Expected output: `healthy`

You can also check the health endpoint directly:

```bash
curl http://localhost:3000/api/health
```

Expected response: `{"ok":true}`

## Running behind a reverse proxy

If you are fronting Stash with Traefik, Nginx, or Caddy, see the [Configuration](configuration/#reverse-proxy) page for examples and a note on the `BEHIND_PROXY` setting.

!!! tip "Local use without HTTPS"
    If you are running Stash on your local network without TLS, set `BEHIND_PROXY=false` in your `.env`. Otherwise the browser refuses to set the session cookie on plain HTTP.
