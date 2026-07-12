# syntax=docker/dockerfile:1.7

# ---------- Frontend build (static output, no need for target-arch emulation) ----------
FROM --platform=linux/amd64 node:25-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- Backend deps (native modules: argon2 has musl prebuilds, better-sqlite3 compiles from source) ----------
FROM node:25-alpine AS server-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---------- Runtime ----------
FROM node:25-alpine AS runtime
RUN apk add --no-cache tini wget
WORKDIR /app

RUN mkdir -p /data && chown node:node /data
COPY --from=server-deps --chown=node:node /app/server/node_modules ./node_modules
COPY --chown=node:node server/ ./
COPY --from=web-build --chown=node:node /app/web/dist ./public

USER node

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/stash.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "index.js"]
