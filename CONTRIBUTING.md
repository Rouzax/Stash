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
3. Run the e2e tests: `npm ci && npx playwright install chromium && npm run test:e2e` (from the repo root, with `server/` and `web/` dependencies installed). The tests also regenerate the screenshots in `docs/images`; discard those changes unless the UI changed on purpose.
4. Test locally with Docker: `docker compose up -d --build`
5. Open a PR against `main`

CI runs the Docker build and the e2e tests on every PR; both must pass before anything merges into `main`.

## Dependency Updates

Dependabot checks weekly and ignores versions published less than 7 days ago. Minor and patch bumps are grouped into one PR per directory.

- **npm minor/patch groups** merge automatically once CI passes (`.github/workflows/dependabot-automerge.yml`).
- **Everything else** waits for a manual review: major versions, GitHub Actions, the Docker base image, and the docs (`pip`) dependencies.

Merged updates are not released until a new version tag is pushed.

## Code Style

- ES modules throughout (`"type": "module"`)
- Node >= 22
- No TypeScript — plain JS with JSX
- Input validation goes in `server/validation.js`
- React components are single-file `.jsx`
