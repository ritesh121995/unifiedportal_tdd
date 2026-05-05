# Azure Static Web App setup (frontend fallback)

This project uses a pnpm workspace monorepo. The frontend app is in:

- `artifacts/tdd-generator`

The deployment workflow is:

- `.github/workflows/azure-static-web-apps.yml` (manual fallback only)

## Required GitHub configuration

Set the following in your GitHub repository:

### 1) Secret

- Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- Value: deployment token from Azure Static Web App (`Manage deployment token`)

### 2) Variable

- Name: `VITE_API_URL`
- Value: your API App Service URL, for example:
  - `https://<your-api-app>.azurewebsites.net`

## Trigger deployment

This workflow is manual-only (`workflow_dispatch`).
Primary production deployment now uses Azure Web App fullstack hosting.

## Validation

After a successful workflow run:

1. Open your Static Web App URL (`*.azurestaticapps.net`)
2. Confirm the frontend loads (not the default "Congratulations" page)
3. Confirm API health endpoint works:
   - `https://<your-api-app>.azurewebsites.net/api/healthz`

## Notes

- The frontend build injects `VITE_API_URL` at build time.
- SPA routing is handled by `artifacts/tdd-generator/public/staticwebapp.config.json`.
