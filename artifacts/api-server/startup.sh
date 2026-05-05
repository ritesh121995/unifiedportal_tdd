#!/usr/bin/env bash
# Azure App Service startup script.
# Set this as the "Startup command" in App Service → Configuration → General settings.
# Or set it via CLI: az webapp config set --startup-file "bash startup.sh"
#
# This script is only needed if you deploy SOURCE CODE rather than a pre-built ZIP.
# If you use azure-deploy.sh (ZIP deployment), this file is not required.
set -e
echo "[startup] Installing dependencies..."
npm install --production=false
echo "[startup] Building application..."
npm run build
echo "[startup] Starting server..."
exec node --enable-source-maps dist/index.mjs
