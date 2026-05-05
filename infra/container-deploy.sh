#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# McCain Unified Onboarding Portal — Azure Container Apps Deployment
# ═══════════════════════════════════════════════════════════════════════════
#
# What this script does:
#   1.  Creates a Resource Group
#   2.  Creates an Azure Container Registry (ACR) — stores your Docker image
#   3.  Builds the Docker image and pushes it to ACR
#   4.  Creates a Log Analytics workspace (required by Container Apps)
#   5.  Creates an Azure Container Apps Environment
#   6.  Creates the Container App with secret references for sensitive values
#   7.  Prints the live URL
#
# Prerequisites:
#   - Docker Desktop running locally
#   - Azure CLI:  brew install azure-cli  OR  https://aka.ms/installazurecliwindows
#   - Logged in:  az login
#
# Usage:
#   chmod +x infra/container-deploy.sh
#   cp infra/container-deploy.env.example infra/.deploy.env   # fill in values
#   source infra/.deploy.env
#   ./infra/container-deploy.sh
#
# Estimated cost (Canada Central, ~$15–25/month):
#   Azure Container Registry Basic   ~$5/month
#   Container Apps (0.5 vCPU/1 GB)  ~$8–15/month (scales to zero when idle)
#   Azure Database for PostgreSQL    ~$12–25/month (Flexible Server, Burstable B1)
#   Azure OpenAI                     ~$1–10/month  (pay-per-token)
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── ❶  Configuration — edit these before running ─────────────────────────
RESOURCE_GROUP="mccain-portal-rg"
LOCATION="canadacentral"
ACR_NAME="mccainportalacr"            # Must be globally unique, lowercase, 5-50 chars
APP_NAME="mccain-portal"              # Container App name
ENVIRONMENT_NAME="mccain-portal-env"  # Container Apps environment name
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"

# ── ❷  Secrets — set as environment variables before running ─────────────
# Required:
: "${DATABASE_URL:?Set DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require}"
: "${JWT_SECRET:?Set JWT_SECRET to a random 64-char hex string (openssl rand -hex 64)}"
: "${BOOTSTRAP_ADMIN_PASSWORD:?Set BOOTSTRAP_ADMIN_PASSWORD for first startup, then rotate it after login}"

# Azure OpenAI (choose one AI provider):
AZURE_OPENAI_ENDPOINT="${AZURE_OPENAI_ENDPOINT:-}"
AZURE_OPENAI_API_KEY="${AZURE_OPENAI_API_KEY:-}"
AZURE_OPENAI_DEPLOYMENT="${AZURE_OPENAI_DEPLOYMENT:-gpt-4o}"
AZURE_OPENAI_API_VERSION="${AZURE_OPENAI_API_VERSION:-2024-08-01-preview}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"   # Standard OpenAI fallback

# Optional:
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-}"

# ── Colors ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${CYAN}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}✔${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
bold() { echo -e "${BOLD}$*${NC}"; }

# ─────────────────────────────────────────────────────────────────────────────

bold "\n══════════════════════════════════════════"
bold " McCain Portal — Azure Container Apps Deploy"
bold "══════════════════════════════════════════\n"

# ── Check Azure CLI login ─────────────────────────────────────────────────
log "Checking Azure CLI login..."
if ! az account show &>/dev/null; then
  warn "Not logged in. Run: az login"
  exit 1
fi
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
ok "Logged in. Subscription: $SUBSCRIPTION_ID"

# ── Step 1: Resource Group ────────────────────────────────────────────────
log "Creating resource group: $RESOURCE_GROUP..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
ok "Resource group ready: $RESOURCE_GROUP ($LOCATION)"

# ── Step 2: Azure Container Registry ─────────────────────────────────────
log "Creating Azure Container Registry: $ACR_NAME..."
az acr create \
  --name "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --sku Basic \
  --admin-enabled true \
  --output none 2>/dev/null || log "ACR already exists, skipping..."

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
ok "Container Registry: $ACR_LOGIN_SERVER"

# ── Step 3: Build and push Docker image ──────────────────────────────────
IMAGE_NAME="$ACR_LOGIN_SERVER/$APP_NAME:$IMAGE_TAG"

log "Building Docker image (linux/amd64)..."
docker build \
  --platform linux/amd64 \
  --tag "$IMAGE_NAME" \
  --file Dockerfile \
  .
ok "Image built: $IMAGE_NAME"

log "Pushing image to ACR..."
az acr login --name "$ACR_NAME" --output none

docker push "$IMAGE_NAME"
ok "Image pushed to ACR"

# ── Step 4: Log Analytics Workspace ──────────────────────────────────────
LOG_WS_NAME="mccain-portal-logs"
log "Creating Log Analytics workspace..."
az monitor log-analytics workspace create \
  --workspace-name "$LOG_WS_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none 2>/dev/null || log "Workspace already exists, skipping..."

LOG_WS_ID=$(az monitor log-analytics workspace show \
  --workspace-name "$LOG_WS_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query customerId -o tsv)

LOG_WS_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --workspace-name "$LOG_WS_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query primarySharedKey -o tsv)
ok "Log Analytics workspace ready"

# ── Step 5: Container Apps Environment ───────────────────────────────────
log "Creating Container Apps environment: $ENVIRONMENT_NAME..."
az containerapp env create \
  --name "$ENVIRONMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --logs-workspace-id "$LOG_WS_ID" \
  --logs-workspace-key "$LOG_WS_KEY" \
  --output none 2>/dev/null || log "Environment already exists, skipping..."
ok "Container Apps environment ready"

# ── Step 6: Build environment variable list ───────────────────────────────
SECRET_ARGS=(
  "jwt-secret=$JWT_SECRET"
  "database-url=$DATABASE_URL"
  "bootstrap-admin-password=$BOOTSTRAP_ADMIN_PASSWORD"
)

ENV_VARS=(
  "NODE_ENV=production"
  "PORT=8080"
  "AUTH_MODE=password"
  "JWT_SECRET=secretref:jwt-secret"
  "DATABASE_URL=secretref:database-url"
  "BOOTSTRAP_ADMIN_PASSWORD=secretref:bootstrap-admin-password"
  "ALLOWED_ORIGIN=$ALLOWED_ORIGIN"
)

if [[ -n "$AZURE_OPENAI_ENDPOINT" ]]; then
  ENV_VARS+=("AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT")
  if [[ -z "$AZURE_OPENAI_API_KEY" ]]; then
    warn "AZURE_OPENAI_ENDPOINT is set but AZURE_OPENAI_API_KEY is empty."
  else
    SECRET_ARGS+=("azure-openai-api-key=$AZURE_OPENAI_API_KEY")
    ENV_VARS+=("AZURE_OPENAI_API_KEY=secretref:azure-openai-api-key")
  fi
  ENV_VARS+=("AZURE_OPENAI_DEPLOYMENT=$AZURE_OPENAI_DEPLOYMENT")
  ENV_VARS+=("AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION")
  log "Using Azure OpenAI: $AZURE_OPENAI_ENDPOINT"
elif [[ -n "$OPENAI_API_KEY" ]]; then
  SECRET_ARGS+=("openai-api-key=$OPENAI_API_KEY")
  ENV_VARS+=("OPENAI_API_KEY=secretref:openai-api-key")
  log "Using standard OpenAI API"
else
  warn "No AI provider configured. Set AZURE_OPENAI_ENDPOINT or OPENAI_API_KEY."
fi

# ── Step 7: Create / update Container App ─────────────────────────────────
log "Deploying Container App: $APP_NAME..."

# Check if app already exists
if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  log "Container App exists — updating image and env vars..."
  az containerapp secret set \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --secrets "${SECRET_ARGS[@]}" \
    --output none

  az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$IMAGE_NAME" \
    --set-env-vars "${ENV_VARS[@]}" \
    --output none
else
  az containerapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT_NAME" \
    --image "$IMAGE_NAME" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --target-port 8080 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 3 \
    --cpu 0.5 \
    --memory 1.0Gi \
    --env-vars "${ENV_VARS[@]}" \
    --secrets "${SECRET_ARGS[@]}" \
    --output none
fi

# ── Done — print the URL ───────────────────────────────────────────────────
APP_URL=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

bold "\n══════════════════════════════════════════"
ok "Deployment complete!"
bold "══════════════════════════════════════════"
echo ""
echo -e "${GREEN}Portal URL:${NC} https://$APP_URL"
echo ""
echo -e "${CYAN}Monitor logs:${NC}"
echo "  az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP --follow"
echo ""
echo -e "${CYAN}Update after code changes:${NC}"
echo "  ./infra/container-deploy.sh   (re-runs the full build+push+deploy)"
echo ""
