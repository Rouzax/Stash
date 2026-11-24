# syntax=docker/dockerfile:1.7

# Every stage uses the same node:22-alpine build, pinned by digest so builds are
# reproducible. Dependabot proposes new digests and auto-merges them; a Node
# version change is a reviewed change, because CI tests on Node 22.

# ---------- Frontend build (static output, no need for target-arch emulation) ----------
FROM --platform=linux/amd64 node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- Backend deps (installed once on the build host, for every platform) ----------
# argon2 and better-sqlite3 ship prebuilt binaries for all platforms and pick
# one when the app loads them, so node_modules is the same for amd64 and arm64
# and nothing is compiled. Running npm on the build host keeps it out of QEMU,
# where `npm ci` for arm64 can crash with an illegal instruction and hang the
# build. No install scripts are needed for that, so none are run.
FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---------- Runtime ----------
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runtime
# `apk upgrade` pulls in Alpine fixes published after the base image was
# built. release.yml rebuilds this stage without the build cache, so the
# weekly rebuild ships them even when the base digest has not changed.
# The app runs with plain `node`, so the package managers bundled in the base
# image are never used at runtime. Removing them keeps their vendored
# dependencies (and every CVE filed against those) out of the shipped image.
RUN apk upgrade --no-cache \
 && apk add --no-cache tini wget \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app

RUN mkdir -p /data && chown node:node /data
COPY --from=server-deps --chown=node:node /app/server/node_modules ./node_modules
COPY --chown=node:node server/ ./
COPY --from=web-build --chown=node:node /app/web/dist ./public

USER node

# Declared after the RUN steps so a new version does not invalidate their cache.
ARG APP_VERSION
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000 \
    DB_PATH=/data/stash.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "index.js"]
