# syntax=docker/dockerfile:1.7

# ---------- Frontend build (static output, no need for target-arch emulation) ----------
FROM --platform=linux/amd64 node:22-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- Backend deps (glibc base so argon2 + better-sqlite3 use prebuilt binaries) ----------
FROM node:22-slim AS server-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---------- Runtime ----------
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends tini wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=web-build /app/web/dist ./public

RUN mkdir -p /data && chown -R node:node /app /data

USER node

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/stash.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "index.js"]
