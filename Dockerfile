# syntax=docker/dockerfile:1.7

# ---------- Frontend build ----------
FROM node:22-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- Backend deps (with build tools for native modules) ----------
FROM node:22-alpine AS server-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---------- Runtime ----------
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini wget
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

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
