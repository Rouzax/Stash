# Configuration

All configuration is done through environment variables. The recommended way is a `.env` file next to your compose file.

## Environment variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `SESSION_SECRET` | - | Yes | Signs session cookies. Use `openssl rand -hex 32` to generate. Must be 32+ characters. Changing it invalidates all active sessions. |
| `PORT` | `3000` | No | Port the container listens on (host side). Change this if 3000 is taken. |
| `BEHIND_PROXY` | `true` | No | Set to `true` when Stash sits behind a TLS-terminating reverse proxy. Enables Secure cookies and trusts `X-Forwarded-*` headers. Set to `false` for plain-HTTP local access. |
| `LOG_LEVEL` | `info` | No | Logging verbosity. One of: `trace`, `debug`, `info`, `warn`, `error`. |
| `TZ` | `Europe/Amsterdam` | No | Container timezone. Affects timestamps in logs. Use any IANA timezone string (e.g. `America/New_York`, `Asia/Tokyo`). |
| `DB_PATH` | `/data/stash.db` | No | Full path to the SQLite database file inside the container. The default location is on the named volume. Only change this if you know what you are doing. |

### Example .env

```
SESSION_SECRET=a3f8c2e1d4b7a9f0e5c3b8d1a6f4e2c9b7a3d8f1e4c2b9a6d3f7e1c4b8a5d2
TZ=Europe/Berlin
LOG_LEVEL=info
BEHIND_PROXY=true
```

## Reverse proxy

### BEHIND_PROXY

When `BEHIND_PROXY=true` (the default), Stash does two things:

1. Sets the `Secure` flag on session cookies - the browser will only send them over HTTPS.
2. Trusts `X-Forwarded-For` and `X-Forwarded-Proto` headers from the proxy for rate limiting and logging.

If you run Stash directly on HTTP without a proxy (e.g. on a home LAN), set `BEHIND_PROXY=false`. Otherwise your browser will refuse to set the cookie and you will be stuck on the login screen.

### Traefik

Add these labels to the `stash` service in your compose file:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.stash.rule=Host(`stash.example.com`)"
  - "traefik.http.routers.stash.entrypoints=websecure"
  - "traefik.http.routers.stash.tls.certresolver=letsencrypt"
  - "traefik.http.services.stash.loadbalancer.server.port=3000"
```

Remove the `ports:` section if you do not want to expose port 3000 directly.

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name stash.example.com;

    ssl_certificate     /etc/ssl/certs/stash.crt;
    ssl_certificate_key /etc/ssl/private/stash.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy

```
stash.example.com {
    reverse_proxy localhost:3000
}
```

Caddy handles TLS automatically. No extra headers needed - Caddy sets `X-Forwarded-For` by default.

## Database

### Location

The database is a single SQLite file at `/data/stash.db` inside the container, on a Docker named volume (`stash-data`). The schema is created automatically on first boot.

You can move the file by setting `DB_PATH`, but the directory must exist and be writable by the `node` user inside the container.

### Backup

To take a snapshot while the container is running:

```bash
docker compose -f docker-compose.prod.yml exec stash \
  sh -c 'cat /data/stash.db' > backup-$(date +%F).db
```

For a consistent backup under concurrent writes, use SQLite's `.backup` command:

```bash
docker compose -f docker-compose.prod.yml exec stash \
  sh -c 'sqlite3 /data/stash.db ".backup /tmp/snap.db" && cat /tmp/snap.db' \
  > backup-$(date +%F).db
```

### Restore

```bash
# Stop the container
docker compose -f docker-compose.prod.yml down

# Copy the backup into the volume
docker run --rm \
  -v stash_stash-data:/data \
  -v $(pwd):/backup \
  alpine sh -c "cp /backup/backup-2024-01-01.db /data/stash.db"

# Start again
docker compose -f docker-compose.prod.yml up -d
```

!!! warning "Volume name"
    The Docker volume is named `stash-data` in the compose file, but Docker prefixes it with the project name. If you are in a directory called `stash`, the volume is called `stash_stash-data`. Run `docker volume ls` to find the exact name.

### Automatic housekeeping

Stash runs these cleanup jobs automatically - you do not need to configure anything:

- Expired sessions are deleted on startup and then every hour.
- Expired invite codes are deleted on startup and then every hour.
- Consumption log entries older than 400 days are deleted on startup and then every 24 hours.
