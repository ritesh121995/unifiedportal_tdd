# ═══════════════════════════════════════════════════════════════════════════
# McCain Unified Onboarding Portal — Multi-stage Dockerfile
# ═══════════════════════════════════════════════════════════════════════════
#
# Stages:
#   1. deps        — install all pnpm workspace dependencies (cached layer)
#   2. build-api   — compile Express API server via esbuild → self-contained bundle
#   3. build-web   — compile React frontend via Vite → static files
#   4. runtime     — ultra-slim final image
#
# The runtime image contains only:
#   /app/dist/     — esbuild-bundled Node.js server
#   /app/public/   — built React SPA (served as static files by Express)
#
# Build for linux/amd64 (required for Azure Container Apps):
#   docker build --platform linux/amd64 -t mccain-portal .
# ═══════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Install all workspace dependencies ────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /workspace

# Install pnpm (match version used in development)
RUN npm install -g pnpm@10 --ignore-scripts

# Copy workspace config files first — changes here invalidate the dep cache
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy every package manifest so pnpm can resolve the full workspace graph.
# Copy manifests only (not source) so the install layer is cached unless
# a package.json changes.
COPY artifacts/api-server/package.json      ./artifacts/api-server/
COPY artifacts/tdd-generator/package.json   ./artifacts/tdd-generator/
COPY lib/db/package.json                    ./lib/db/
COPY lib/api-zod/package.json               ./lib/api-zod/
COPY lib/api-spec/package.json              ./lib/api-spec/
COPY lib/api-client-react/package.json      ./lib/api-client-react/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY lib/integrations-openai-ai-react/package.json  ./lib/integrations-openai-ai-react/
COPY scripts/package.json                   ./scripts/

# Install all workspace dependencies.
# --frozen-lockfile ensures the lock file is never updated inside Docker.
# --ignore-scripts skips lifecycle scripts for security (esbuild is in
# onlyBuiltDependencies so it will still compile its native binary).
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build the Express API server ──────────────────────────────────
FROM deps AS build-api

# Copy full workspace source on top of the installed deps
COPY . .

# Compile TypeScript → single self-contained ESM bundle via esbuild.
# Output: artifacts/api-server/dist/index.mjs (and source maps)
RUN pnpm --filter @workspace/api-server run build

# ─── Stage 3: Build the React frontend ─────────────────────────────────────
FROM deps AS build-web

COPY . .

# VITE_API_URL is intentionally left EMPTY.
# The frontend will call /api on the same origin — Express serves both
# the static files (from /app/public/) and the API routes (/api/*).
# BASE_PATH=/ means the app is mounted at the root, not a sub-path.
ENV VITE_API_URL=""
RUN BASE_PATH=/ pnpm --filter @workspace/tdd-generator run build

# ─── Stage 4: Minimal runtime image ─────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache wget

# Create a non-root user — never run containers as root in production
RUN addgroup -g 1001 -S mccain \
 && adduser  -u 1001 -S mccain -G mccain

# Copy the pre-built API bundle from build-api stage.
COPY --from=build-api --chown=mccain:mccain \
  /workspace/artifacts/api-server/dist ./dist

# Copy the pre-built React SPA from build-web stage.
# Express serves files in ./public/ as static assets automatically
# (see artifacts/api-server/src/app.ts — hasFrontendBuild logic).
COPY --from=build-web --chown=mccain:mccain \
  /workspace/artifacts/tdd-generator/dist ./public

# Minimal package.json so Azure Container Apps / App Service can detect
# the Node.js startup command if needed.
COPY --chown=mccain:mccain artifacts/api-server/package.json ./

USER mccain

# Azure Container Apps routes external traffic to this port.
EXPOSE 8080

# Sensible production defaults — override via Container App env vars.
ENV NODE_ENV=production \
    PORT=8080

# Health check — Azure Container Apps uses this to determine readiness.
# /api/healthz returns 200 JSON with auth mode and service status.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

CMD ["node", "dist/index.mjs"]
