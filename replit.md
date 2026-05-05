# McCain Unified Onboarding Portal

## Overview

A 6-phase enterprise onboarding portal for McCain Foods Cloud Centre of Excellence (CCoE). Governs every new workload from Enterprise Architecture review through to live production deployment and ongoing cost management. Three roles collaborate through a complete lifecycle: Requestors submit architecture review requests → Enterprise Architects review and approve → Cloud Architects generate TDDs and deploy via IaC.

### Key Features (v2.1)
- **Activity log & audit trail** — every status change logged with actor, timestamp; visible on RequestDetail
- **Comments/discussion thread** — any authenticated user can post comments on a request (POST /api/requests/:id/comment); comments appear inline in the activity timeline
- **Microsoft Teams webhook** — configurable incoming webhook URL for status-change notifications (admin → Integrations)
- **Export CSV** — Enterprise Architects / admins can export all ARRs to CSV from All Requests page
- **Request clone / duplicate** — requestors can duplicate any existing request as a new draft
- **User management** — admin page to list, create, edit roles, and delete portal users
- **Mandatory impact fields** — Security Impact and Data Impact are required on every submission
- **LeanIX integration placeholder** — Integrations page with LeanIX API credentials storage (ready for future activation)

### 6-Phase Framework
- **Phase 1 — EA Review**: Architecture domain cards (Business, Data, App, Tech, Security, Integration), intake form with file upload, ARB scoring metrics
- **Phase 2 — Cloud Architecture Review**: Azure WAF 5-pillar assessment table, Landing Zone configuration status, WAF scoring with action items
- **Phase 3 — Risk Analysis**: Live risk register with CVSS scoring, interactive 5×5 risk heat map, compliance checklists (NIST, ISO 27001, SOC2, PIPEDA, PCI-DSS)
- **Phase 4 — TDD Generation**: 6-section document builder with auto-populate status, template/format/approval selectors, one-click AI generation
- **Phase 5 — DevSecOps / IaC**: McCain Certified Module catalog with versioning, copyable Terraform code, 4-stage deployment pipeline
- **Phase 6 — FinOps**: Animated cost-by-service bar chart, savings recommendations with ROI, budget alerts with forecast vs actuals

pnpm workspace monorepo using TypeScript. Two primary applications: a React+Vite frontend portal and an Express 5 backend API.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (API server), Vite (frontend)
- **AI**: Azure OpenAI gpt-4o (or OpenAI API via Replit integrations)
- **Document export**: docx (Word), jsPDF (PDF)
- **Auth**: Three modes — `none` (dev default), `single_user` (JWT), `entra` (Azure AD MSAL)

## Structure

```text
artifacts/
├── api-server/              # Express 5 API server (port 8080)
│   └── src/
│       ├── app.ts           # CORS, middleware, static file serving for prod
│       ├── routes/
│       │   ├── index.ts     # Router mounting (/healthz, /auth, /tdd/*)
│       │   ├── health.ts    # GET /api/healthz — returns auth mode + health
│       │   ├── auth.ts      # POST /api/auth/login, /logout, /session
│       │   └── tdd/
│       │       ├── generate.ts   # POST /api/tdd/generate — SSE streaming TDD generation (1900+ lines)
│       │       ├── export.ts     # POST /api/tdd/export — DOCX/PDF export + Blob upload
│       │       ├── cidr.ts       # POST /api/tdd/subnet-analysis
│       │       └── naming.ts     # POST /api/tdd/naming-preview
│       ├── middleware/
│       │   ├── portal-auth.ts   # Auth dispatcher (none/single_user/entra)
│       │   ├── simple-user-auth.ts  # JWT username/password auth
│       │   ├── entra-auth.ts    # Azure AD token verification (jose)
│       │   └── rate-limit.ts    # Rate limiting for generate endpoint
│       └── lib/
│           ├── blob-storage.ts  # Azure Blob Storage upload
│           └── logger.ts        # Pino logger
│
└── tdd-generator/           # React+Vite frontend (port 18825)
    └── src/
        ├── App.tsx          # Router, auth guard, API base URL config
        ├── pages/
        │   ├── Wizard.tsx   # Multi-step form (8 steps, ~750 lines)
        │   ├── Preview.tsx  # SSE streaming preview + DOCX/PDF export (~660 lines)
        │   └── Login.tsx    # Auth login page
        ├── components/
        │   ├── layout/AppLayout.tsx  # Header (uses VITE_ORG_NAME env var)
        │   └── MermaidDiagram.tsx    # Mermaid diagram renderer
        ├── lib/
        │   ├── portal-auth.ts    # Frontend auth mode resolver (fetches /api/healthz)
        │   └── entra-auth.ts     # MSAL browser auth for Azure AD
        └── store/
            └── app-context.tsx   # Form state (no default organization — user fills in)

lib/
├── api-spec/            # OpenAPI 3.1 spec + Orval codegen config
├── api-client-react/    # Generated React Query hooks
├── api-zod/             # Generated Zod schemas
└── db/                  # Drizzle ORM schema + DB connection
```

## TDD Document Sections (11 total)

The AI-generated Technical Design Document has 11 sections:
1. Executive Summary
2. Ownership, Stakeholders & Billing Context
3. Workload Context & Classification
4. Current State Architecture (As-Is)
5. Platform Components (Infrastructure View)
6. Proposed Target State Architecture (To-Be) — includes Mermaid architecture diagram
7. Target Solution Detailed Design Components — networking tables, NSG rules, RBAC, monitoring, BCDR, DevOps, costs
8. Deployment Architecture — naming standards table, IaC deployment inputs table
9. Security Controls & Compliance — Defender for Cloud, Zero Trust, encryption, compliance schedule
10. Monitoring & Observability Strategy — SLIs/SLOs, alerting severity matrix, dashboards, diagnostics
11. Cost Management & FinOps — budget alerts, tagging policy, optimization strategies

## Azure Deployment

Two deployment options are available — both included in the repo:

| Option | Script | Infra | Best for |
|---|---|---|---|
| **ZIP deploy** (App Service) | `azure-deploy.sh` | App Service B1 | Simplest, cheapest (~$13/month) |
| **Container** (Container Apps) | `infra/container-deploy.sh` | ACR + Container Apps | CI/CD pipelines, auto-scaling |

### Option A — ZIP Deploy to Azure App Service

```bash
# 1. az login
# 2. Edit RESOURCE_GROUP / APP_SERVICE_NAME at top of script
./azure-deploy.sh
```

Builds API + React → bundles everything into a ZIP → deploys to Linux App Service B1.

### Option B — Docker / Azure Container Apps (recommended for enterprise)

```bash
# 1. Fill in secrets
cp infra/container-deploy.env.example infra/.deploy.env
# Edit infra/.deploy.env with your values

# 2. Source and deploy
source infra/.deploy.env && ./infra/container-deploy.sh
```

The script: builds multi-stage Docker image → pushes to Azure Container Registry → creates Container Apps Environment → deploys Container App with all env vars.

#### Container image architecture

```
Dockerfile (4-stage multi-stage build):
  Stage 1 — deps        install pnpm workspace deps (cached layer)
  Stage 2 — build-api   esbuild → self-contained dist/index.mjs
  Stage 3 — build-web   Vite → React static files
  Stage 4 — runtime     node:20-alpine + dist/ + public/ only (~120 MB)
                         runs as non-root user "mccain"
```

No `node_modules` in the final image — esbuild bundles everything.

#### Local Docker testing

```bash
docker compose up --build    # builds image + spins up Postgres
# Portal at http://localhost:8080
# Login: enterprise@mccain.com / McCain@123
docker compose down -v       # teardown
```

### Required environment variables in Azure App Service

Set these under **App Service → Settings → Environment variables**:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `8080` | Set automatically by Azure |
| `JWT_SECRET` | random 64-char hex | `openssl rand -hex 64` |
| `AUTH_MODE` | `password` | |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` | Azure PostgreSQL |
| `AZURE_OPENAI_ENDPOINT` | `https://<resource>.openai.azure.com/` | From Azure Portal → Azure OpenAI → Keys & Endpoint |
| `AZURE_OPENAI_API_KEY` | `<key>` | From Azure Portal → Azure OpenAI → Keys & Endpoint |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o` | Deployment name from Azure OpenAI Studio |
| `AZURE_OPENAI_API_VERSION` | `2024-08-01-preview` | Optional — this is the default |

See `artifacts/api-server/.env.example` for the full list including optional variables (Blob Storage, IaC deployment, Confluence, etc.).

### AI provider priority

The `openai-client.ts` checks in this order:
1. **Azure OpenAI** — if `AZURE_OPENAI_ENDPOINT` is set → uses `AzureOpenAI` client with `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_DEPLOYMENT`. API version defaults to `2024-08-01-preview` if `AZURE_OPENAI_API_VERSION` is not set.
2. **Standard OpenAI** — if only `OPENAI_API_KEY` is set → uses standard `OpenAI` client (calls `api.openai.com` directly, no base URL needed).
3. **Replit AI Integrations** — if `AI_INTEGRATIONS_OPENAI_*` vars are set (injected automatically by Replit integration).

## Environment Variables

### Backend (`api-server`)
| Variable | Purpose | Required |
|---|---|---|
| `PORT` | Express server port | Yes (Azure sets automatically) |
| `NODE_ENV` | `production` in Azure | Yes |
| `JWT_SECRET` | JWT signing secret (min 64 chars) | Yes in production |
| `AUTH_MODE` | `password` / `none` | Recommended |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL | For Azure OpenAI |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | For Azure OpenAI |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name (e.g. `gpt-4o`) | For Azure OpenAI |
| `AZURE_OPENAI_API_VERSION` | API version (default `2024-08-01-preview`) | Optional |
| `OPENAI_API_KEY` | Standard OpenAI key (alternative to Azure) | If not using Azure OpenAI |
| `ALLOWED_ORIGIN` | Frontend URL for CORS (blank = same-origin) | If hosting separately |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob Storage for TDD archival | Optional |
| `AZURE_TENANT_ID` | Service Principal tenant | For IaC deployment feature |
| `AZURE_CLIENT_ID` | Service Principal client ID | For IaC deployment feature |
| `AZURE_CLIENT_SECRET` | Service Principal secret | For IaC deployment feature |
| `AZURE_SUBSCRIPTION_ID` | Subscription for IaC deployments | For IaC deployment feature |

### Frontend (`tdd-generator`)
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base URL — leave **empty** when frontend is served by Express (single App Service) |
| `BASE_PATH` | App base path (default `/`) |

## Development Workflow

The single workflow runs both services:
```
PORT=8080 AUTH_MODE=none pnpm --filter @workspace/api-server run dev & PORT=18825 BASE_PATH=/ pnpm --filter @workspace/tdd-generator run dev
```

- **`AUTH_MODE=none`** means no login is required in development
- **Vite proxy** forwards all `/api` requests from port 18825 → port 8080 automatically
- In production (Azure App Service): Express serves the built frontend from `artifacts/api-server/public/`

## Auth Modes

- **`none`**: No authentication, all API endpoints open. Default for development.
- **`single_user`**: Username/password login, JWT session tokens. Set `SIMPLE_AUTH_USERNAME`, `SIMPLE_AUTH_PASSWORD`, `SIMPLE_AUTH_JWT_SECRET`.
- **`entra`**: Microsoft Entra ID (Azure AD) MSAL authentication. Requires `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`, `VITE_ENTRA_SCOPES` on the frontend plus backend token verification.

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — actual JS bundling handled by esbuild/Vite
- Run codegen: `pnpm --filter @workspace/api-spec run codegen`
