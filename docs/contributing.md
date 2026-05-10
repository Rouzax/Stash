# Contributing

## Development setup

You need Node.js 22 or later and npm.

### Backend

```bash
cd server
npm install
SESSION_SECRET=$(openssl rand -hex 32) DB_PATH=./stash.db node index.js
```

The API server starts on port 3000.

### Frontend

In a second terminal:

```bash
cd web
npm install
npm run dev
```

Vite starts on port 5173 and proxies all `/api/*` requests to `localhost:3000`. Open `http://localhost:5173` in your browser.

Hot reload is active for the frontend. For the backend, use `node --watch` or restart manually after changes.

### Test with Docker

To test the full production build locally:

```bash
docker compose up -d --build
```

This builds the image from source (multi-stage build) and starts the container. Open `http://localhost:3000`.

## Pull request process

1. Fork the repository and create a feature branch from `main`.
2. Make your changes.
3. Test locally: both the dev setup and the Docker build.
4. Open a pull request against `main` on [GitHub](https://github.com/Rouzax/Stash).

Keep PRs focused. One feature or fix per PR makes review faster.

## Code style

- ES modules throughout (`"type": "module"` in package.json)
- Node.js 22 minimum
- No TypeScript: plain JavaScript with JSX for the frontend
- Input validation lives in `server/validation.js`; add new validators there rather than inline in route handlers
- React components are single-file `.jsx` files in `web/src/`
- No build step for the backend: it runs directly with Node

## Project layout

```
.
├── Dockerfile              # Multi-stage build (web → server → runtime)
├── docker-compose.yml      # Production (pulls from GHCR)
├── server/
│   ├── index.js            # Fastify app entry point
│   ├── db.js               # Schema, SQLite setup, boot housekeeping
│   ├── auth.js             # Sessions, Argon2, middleware
│   ├── validation.js       # Shared input validators
│   └── routes/
│       ├── auth.js         # Login, logout, users, password, invites
│       ├── items.js        # Item CRUD + atomic adjust
│       └── log.js          # Consumption history + rush reset
└── web/
    ├── vite.config.js
    └── src/
        ├── App.jsx               # Top-level routing (login → inventory)
        ├── Inventory.jsx         # Main screen: items, rush meter, charts
        ├── ItemModal.jsx         # Add / edit item form
        ├── AdminPanel.jsx        # User management + invite codes
        ├── ChangePasswordModal.jsx
        ├── UserSettingsModal.jsx # Profile settings (emoji, color, email)
        ├── Login.jsx
        ├── api.js                # Typed API client
        ├── background.jsx        # Synthwave animated background
        └── styles.css
```
