# Contributing to Stash

## Development Setup

```bash
# Backend (terminal 1)
cd server && npm install
SESSION_SECRET=$(openssl rand -hex 32) DB_PATH=./stash.db node index.js

# Frontend (terminal 2)
cd web && npm install
npm run dev
```

Vite dev server runs on `:5173` and proxies `/api/*` to `localhost:3000`.

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes
3. Test locally with Docker: `docker compose up -d --build`
4. Open a PR against `main`

## Code Style

- ES modules throughout (`"type": "module"`)
- Node >= 22
- No TypeScript — plain JS with JSX
- Input validation goes in `server/validation.js`
- React components are single-file `.jsx`
