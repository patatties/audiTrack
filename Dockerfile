# audiTrack — self-hosted image: one Node process serves the web app and the REST API (/api),
# with all data in the built-in database (or PostgreSQL via DATABASE_URL) on the /data volume.

# ---- Build stage ----
# Runs on the build machine's own platform: the output (JavaScript + WebAssembly) works on every
# platform, so multi-platform builds (amd64 + arm64) only repeat the small runtime stage.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Shown in the sidebar. Example: docker build --build-arg APP_VERSION=$(git describe --tags) .
ARG APP_VERSION=docker
ENV APP_VERSION=${APP_VERSION}
# Web app (static SPA) and the server bundled into one file.
RUN npm run build && npm run build:server

# ---- Runtime stage ----
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist-server/server.js ./server.js
# The built-in database (PGlite) ships WebAssembly files and stays outside the bundle.
COPY --from=build /app/node_modules/@electric-sql/pglite ./node_modules/@electric-sql/pglite
COPY --from=build /app/dist ./public

ENV NODE_ENV=production \
    PORT=3000 \
    AUDITRACK_DATA_DIR=/data \
    AUDITRACK_STATIC=/app/public

RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
