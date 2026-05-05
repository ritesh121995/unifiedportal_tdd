#!/usr/bin/env bash
# ============================================================
# McCain Unified Onboarding Portal — Azure Deployment Script
# ============================================================
# Usage:
#   chmod +x azure-deploy.sh
#   ./azure-deploy.sh
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - pnpm installed
#   - jq installed (optional, for JSON parsing)
#
# What this script does:
#   1. Builds the API server (esbuild bundle → dist/)
#   2. Builds the React frontend (Vite → tdd-generator/dist/)
#   3. Copies the frontend into api-server/public/ so Express serves it
#   4. Creates a deployment ZIP
#   5. Deploys the ZIP to Azure App Service via az cli
# ============================================================

set -euo pipefail

# ── Configuration — edit these before running ────────────────
RESOURCE_GROUP="mccain-portal-rg"
APP_SERVICE_NAME="mccain-portal-api"
REGION="canadacentral"
APP_SERVICE_PLAN="mccain-portal-plan"
ZIP_FILE="mccain-portal-deploy.zip"

# ── Colors ────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[done]${NC}  $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $1"; }

# ── Step 1: Install dependencies ─────────────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile
ok "Dependencies installed"

# ── Step 2: Build API server ──────────────────────────────────
log "Building API server..."
pnpm --filter @workspace/api-server run build
ok "API server built → artifacts/api-server/dist/"

# ── Step 3: Build React frontend (same-origin, no VITE_API_URL) ──
log "Building React frontend..."
# VITE_API_URL is intentionally left empty so the frontend calls /api
# on the same host (Express serves both static files and the API).
BASE_PATH=/ pnpm --filter @workspace/tdd-generator run build
ok "Frontend built → artifacts/tdd-generator/dist/"

# ── Step 4: Copy frontend into api-server/public/ ─────────────
log "Copying frontend build into api-server/public/..."
rm -rf artifacts/api-server/public
cp -r artifacts/tdd-generator/dist artifacts/api-server/public
ok "Frontend copied → artifacts/api-server/public/"

# ── Step 5: Create deployment ZIP ─────────────────────────────
log "Creating deployment ZIP..."
rm -f "$ZIP_FILE"

# Include only what Azure App Service needs:
#   dist/         — compiled Node.js server (self-contained bundle)
#   public/       — built React SPA (served as static files by Express)
#   package.json  — required by Azure for startup command detection
#
# node_modules/ is NOT needed — esbuild bundles all dependencies.
cd artifacts/api-server
zip -r "../../$ZIP_FILE" \
  dist/ \
  public/ \
  package.json \
  --exclude "*.map"
cd ../..

ok "ZIP created → $ZIP_FILE ($(du -sh "$ZIP_FILE" | cut -f1))"

# ── Step 6: Deploy to Azure App Service ───────────────────────
log "Checking Azure CLI login..."
if ! az account show &>/dev/null; then
  warn "Not logged in to Azure CLI. Run: az login"
  exit 1
fi

log "Deploying to Azure App Service: $APP_SERVICE_NAME..."

# Create resource group if it doesn't exist
if ! az group show --name "$RESOURCE_GROUP" &>/dev/null; then
  log "Creating resource group: $RESOURCE_GROUP in $REGION..."
  az group create --name "$RESOURCE_GROUP" --location "$REGION"
fi

# Create App Service Plan if it doesn't exist (B1 Linux — ~$13/month)
if ! az appservice plan show --name "$APP_SERVICE_PLAN" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  log "Creating App Service Plan: $APP_SERVICE_PLAN (B1 Linux)..."
  az appservice plan create \
    --name "$APP_SERVICE_PLAN" \
    --resource-group "$RESOURCE_GROUP" \
    --sku B1 \
    --is-linux
fi

# Create Web App if it doesn't exist
if ! az webapp show --name "$APP_SERVICE_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  log "Creating Web App: $APP_SERVICE_NAME..."
  az webapp create \
    --name "$APP_SERVICE_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --plan "$APP_SERVICE_PLAN" \
    --runtime "NODE:20-lts"

  # Set the startup command — runs the pre-built bundle
  az webapp config set \
    --name "$APP_SERVICE_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --startup-file "node --enable-source-maps dist/index.mjs"
fi

# Deploy the ZIP
az webapp deployment source config-zip \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src "$ZIP_FILE"

ok "Deployment complete!"
echo ""
echo -e "${GREEN}Portal URL:${NC} https://${APP_SERVICE_NAME}.azurewebsites.net"
echo ""
echo -e "${YELLOW}IMPORTANT — Set these environment variables in Azure Portal:${NC}"
echo "  App Service → Settings → Environment variables"
echo ""
echo "  NODE_ENV                  = production"
echo "  PORT                      = 8080"
echo "  JWT_SECRET                = <generate with: openssl rand -hex 64>"
echo "  DATABASE_URL              = postgresql://user:pass@host:5432/db?sslmode=require"
echo "  AZURE_OPENAI_ENDPOINT     = https://<resource>.openai.azure.com/"
echo "  AZURE_OPENAI_API_KEY      = <key from Azure Portal>"
echo "  AZURE_OPENAI_DEPLOYMENT   = gpt-4o"
echo "  AUTH_MODE                 = password"
echo ""
echo "See artifacts/api-server/.env.example for the full list of variables."
