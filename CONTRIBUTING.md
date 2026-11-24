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
- **Docker base image:** the `Dockerfile` pins `node:22-alpine` by digest. A new digest for the same Node version merges automatically once CI passes. Dependabot does not propose other Node versions; moving to one is a manual change to the `Dockerfile` and to `node-version` in `.github/workflows/build.yml`.
- **Everything else** waits for a manual review: major versions, GitHub Actions, and the docs (`pip`) dependencies.

## Releases

Pushing a `v*` tag builds the image and publishes the release (`.github/workflows/release.yml`). The image takes its version from the tag; the `version` fields in `server/package.json` and `web/package.json` are not bumped and only show up in local runs.

Every Monday, `.github/workflows/auto-release.yml` checks whether anything under `server/`, `web/` or the `Dockerfile` changed since the last tag. If so, it runs the build and e2e tests on that commit, creates the next patch tag, and publishes the release. If nothing changed, it rebuilds the image of the last tag instead and re-pushes its image tags (for example `0.2.24`, `0.2` and `latest`) without a new GitHub Release. Either way the image picks up Alpine security fixes: the `Dockerfile` runs `apk upgrade`, and `release.yml` builds that stage without the build cache. It can also be started by hand from the Actions tab.

## Code Style

- ES modules throughout (`"type": "module"`)
- Node >= 22
- No TypeScript — plain JS with JSX
- Input validation goes in `server/validation.js`
- React components are single-file `.jsx`
