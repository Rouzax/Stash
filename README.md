# Stash

[![GitHub Release](https://img.shields.io/github/v/release/Rouzax/Stash)](https://github.com/Rouzax/Stash/releases)
[![GHCR](https://img.shields.io/badge/ghcr.io-rouzax%2Fstash-blue)](https://ghcr.io/rouzax/stash)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Self-hosted family candy tracker with per-person rush meters and a synthwave aesthetic. Track your shared candy drawer, see who's been raiding the stash, and watch the Rush-O-Meter spike.

![Inventory](docs/images/inventory.png)

## Features

- **Shared family stash** — one candy drawer, everyone sees the same inventory
- **Per-person rush meter** — each family member has their own Rush-O-Meter
- **Per-item rush config** — set rush % and decay time for each item
- **Portion-based tracking** — TAKE 1 or TAKE 1/4 with one tap
- **Invite codes** — admins generate codes to add family members
- **Charts** — 7-day and 12-month rush % history per person
- **Low-stock alerts** — cards pulse when you're running low
- **User profiles** — emoji avatars and color customization

## Quick Start

```bash
mkdir stash && cd stash

# Create docker-compose.yml
curl -o docker-compose.yml https://raw.githubusercontent.com/Rouzax/Stash/main/docker-compose.prod.yml

# Create .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env

# Start
docker compose up -d
```

Open `http://localhost:3000` — name your family and create the admin account.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SESSION_SECRET` | *required* | 32+ character secret for signing session cookies |
| `PORT` | `3000` | Host-side port |
| `BEHIND_PROXY` | `true` | Set `Secure` cookie flag and trust proxy headers |
| `LOG_LEVEL` | `info` | `trace` / `debug` / `info` / `warn` / `error` |
| `TZ` | `Europe/Amsterdam` | Container timezone |

### Reverse Proxy

When behind a TLS-terminating proxy (Traefik, Nginx, Caddy), keep `BEHIND_PROXY=true` (the default). If running locally without HTTPS, set `BEHIND_PROXY=false`.

## Updating

```bash
docker compose pull
docker compose up -d
```

Your data is safe — the SQLite database lives on a Docker named volume.

## Backups

```bash
docker compose exec stash sh -c 'cat /data/stash.db' > backup-$(date +%F).db
```

## Documentation

Full documentation at **[rouzax.github.io/Stash](https://rouzax.github.io/Stash/)**

## Development

```bash
# Backend (terminal 1)
cd server && npm install
SESSION_SECRET=$(openssl rand -hex 32) DB_PATH=./stash.db node index.js

# Frontend (terminal 2)
cd web && npm install
npm run dev
```

Vite dev server on `:5173` proxies `/api/*` to `localhost:3000`.

## License

[MIT](LICENSE)
