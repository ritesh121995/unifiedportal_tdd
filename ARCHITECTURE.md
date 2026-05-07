# McCain Unified Onboarding Portal — Architecture

## System Overview

The portal is a **pnpm monorepo** running as a single Docker container on Azure Container Apps, serving both the API and the React SPA from one Express process.

---

## Package Structure

```
unifiedportal_tdd/                     ← pnpm workspace root
├── artifacts/
│   ├── api-server/                    ← Express.js REST API (Node 22, esbuild)
│   ├── tdd-generator/                 ← React 19 SPA (Vite, Tailwind, Radix UI)
│   ├── api-client-react/              ← React Query hooks (shared API client)
│   └── mockup-sandbox/
├── lib/
│   ├── db/                            ← Drizzle ORM + PostgreSQL 16 schema
│   ├── api-zod/                       ← Zod schemas shared by server + client
│   └── integrations-openai-*/         ← Azure OpenAI / standard OpenAI clients
├── Dockerfile                         ← 4-stage build → single runtime image
└── .github/workflows/ci.yml           ← Node 20 + pnpm, typecheck + audit on push
```

---

## Deployment Architecture

```
                          ┌─────────────────────────────────────────┐
                          │  Azure Container App  (test1995)        │
                          │  RG: Rishi_RG  ·  Port 8080            │
                          │                                          │
  Browser ──HTTPS──►  ┌───┤  Express (Node 22)                      │
                       │   │   ├── /api/*  → REST routes            │
                       │   │   └── /*      → SPA static assets      │
                       │   │                                         │
                       │   │  Environment Variables                  │
                       │   │   AZURE_OPENAI_ENDPOINT                │
                       │   │   AZURE_OPENAI_API_KEY                 │
                       │   │   AZURE_OPENAI_DEPLOYMENT              │
                       │   │   DATABASE_URL                         │
                       │   │   JWT_SECRET                           │
                       └───┤                                         │
                          └────────────┬────────────────────────────┘
                                       │
                          ┌────────────▼────────────────────────────┐
                          │  PostgreSQL 16  (portaldb)              │
                          └─────────────────────────────────────────┘
                                       │
                          ┌────────────▼────────────────────────────┐
                          │  Azure OpenAI                           │
                          │  (TDD generation + request classifier)  │
                          └─────────────────────────────────────────┘

  ACR: testregistry1995.azurecr.io
  CI/CD: GitHub Actions → Docker build → push to ACR → Container App deploy
```

---

## Authentication & Authorization

JWT stored in an **httpOnly cookie** (`portal_token`), signed with `JWT_SECRET`, expires in 8h.

| Role | Access |
|------|--------|
| `requestor` | Submit requests, view own requests, clone |
| `cloud_architect` | TDD generation, risk review, DevSecOps approval, IaC deploy |
| `enterprise_architect` | EA triage, EA review, FinOps activation, CSV export |
| `admin` | All of the above + user management + portal settings |

---

## Multi-Phase Approval Workflow

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Request Lifecycle                                │
└──────────────────────────────────────────────────────────────────────┘

  submitted ──AI classify──► simple?──YES──► ea_approved ──────────────────┐
      │                       │                                            │
      │                      NO                                            │
      │                       │                                            ▼
      │                       ▼                               tdd_in_progress
      │                  ea_triage                                         │
      │                       │                               [CA generates TDD
      │              [EA reviews]                              via Azure OpenAI]
      │                       │                                            │
      │                  ea_approved ───────────────────────► tdd_completed
      │                                                                    │
      └───────────────────────────────────────────────────────────────────►
                                                               [CA reviews IaC]
                                                                            │
                                                               devsecops_approved
                                                                            │
                                                               [EA activates]
                                                                            │
                                                               finops_active ✓
```

**AI Classification** (`POST /api/requests`): determines `simple` vs `complex` at submission time based on:
- Security / regulatory / integration impact: Medium or High → **complex**
- Expected user base ≥ 500 → **complex**
- Cost T-shirt size XL or XXL → **complex**
- All others → **simple** (fast-tracked directly to TDD, skipping EA review)

---

## API Surface

```
/api/auth
  POST   /login                   ← rate-limited, sets httpOnly JWT cookie
  POST   /logout                  ← clears cookie
  GET    /me                      ← current session user

/api/requests
  GET    /                        ← list (requestors see own; architects see all)
  POST   /                        ← submit + AI classify
  GET    /:id
  DELETE /:id                     ← admin only
  GET    /export                  ← CSV (enterprise_architect only)
  PATCH  /:id/review              ← EA approve/reject
  PATCH  /:id/triage              ← move to ea_triage
  PATCH  /:id/request-modification
  PATCH  /:id/resubmit
  PATCH  /:id/risk-review         ← cloud_architect
  PATCH  /:id/start-tdd
  PATCH  /:id/complete-tdd
  PATCH  /:id/devsecops-review    ← cloud_architect approve/reject
  PATCH  /:id/finops-activate     ← enterprise_architect
  POST   /:id/comment
  POST   /:id/clone
  GET    /:id/events
  GET    /events/recent

/api/tdd
  POST   /generate                ← SSE streaming TDD generation (Azure OpenAI)
  POST   /export                  ← markdown / docx / pdf
  POST   /section-regenerate      ← regenerate individual TDD sections
  GET    /submissions             ← list TDD submissions
  GET    /submissions/:id         ← full submission + generatedContent
  POST   /submissions
  DELETE /submissions/:id         ← admin only
  POST   /cidr                    ← CIDR range calculations
  POST   /naming                  ← naming convention validation
  GET    /diagnostics             ← Azure OpenAI connectivity test (admin/architect)

/api/iac
  POST   /deploy                  ← start Azure IaC deployment (Azure SDK)
  GET    /deploy/:id              ← poll deployment status

/api/users                        ← admin only
  GET  /  ·  POST /  ·  PATCH /:id  ·  DELETE /:id

/api/settings                     ← admin only
  GET /  ·  PUT /:key  ·  DELETE /:key

/api/healthz                      ← liveness probe (blob storage + DB)
```

---

## Database Schema

```
users
  id · name · email (unique) · password_hash
  role (requestor | enterprise_architect | cloud_architect | admin)
  created_at · updated_at

architecture_requests
  id · title · application_name · application_type
  business_unit · line_of_business · priority
  description · business_justification
  target_environments[] · azure_regions[]
  deployment_model · expected_user_base · target_go_live_date
  requestor_id → users.id · requestor_name · requestor_email
  status (submitted → ea_triage → ea_approved → tdd_in_progress
          → tdd_completed → devsecops_approved → finops_active)
  ai_classification (simple | complex) · ai_classification_reason
  tdd_form_data (jsonb)
  tdd_submission_id → tdd_submissions.id
  ea_reviewer_name · ea_reviewed_at · ea_comments
  risk_reviewer_name · risk_reviewed_at · risk_comments
  ca_assignee_name
  devsecops_approver_name · devsecops_approved_at · devsecops_comments
  finops_activated_by · finops_activated_at
  created_at · updated_at

tdd_submissions
  id · application_name · organization · line_of_business
  requestor_email · environments[]
  form_data (jsonb) · generated_content (markdown text)
  blob_path_markdown · blob_path_docx · blob_path_pdf
  storage_provider · status
  created_at · updated_at

request_events
  id · request_id → architecture_requests.id
  actor_name · actor_role · event_type · description · created_at

portal_settings
  id · key (unique) · value · updated_at
```

---

## Frontend Page Map

```
/login                   Public — credential login
/dashboard               Summary cards + recent activity feed
/requests                RequestList — filtered by role
/requests/new            SubmitRequest — 5-step form (AI classifies on submit)
/requests/:id            RequestDetail — full workflow view
                           ├─ Phase 1: EA Review        (enterprise_architect)
                           ├─ Phase 2: Risk Review       (cloud_architect)
                           ├─ Phase 3: DevSecOps / IaC   (cloud_architect)
                           │    ├─ AzureServiceSelector (auto-detected from TDD)
                           │    ├─ Terraform code preview (copy / download)
                           │    ├─ Deploy to Azure (Azure SDK, status polling)
                           │    └─ Approve / Reject
                           └─ Phase 4: FinOps Activation (enterprise_architect)
/tdd-view/:requestId     TddViewer — read-only markdown view of completed TDD
/wizard/:requestId       Wizard — 5-step TDD generation form (cloud_architect)
/preview                 Preview — live TDD with SSE streaming + IaC generation
/integrations            Azure OpenAI diagnostics + Teams webhook config
/admin/users             User management (admin only)
```

---

## AI Integration

Two uses of Azure OpenAI (falls back to standard OpenAI via `OPENAI_API_KEY` if Azure is not configured):

| Use | Endpoint | Model | Notes |
|-----|----------|-------|-------|
| Request classifier | `POST /api/requests` | `gpt-4o` | Called at submission; returns `simple\|complex` + one-sentence reason |
| TDD generator | `POST /api/tdd/generate` | `gpt-4o` | Streaming SSE; generates 8 TDD sections from full form context |
| Section regenerate | `POST /api/tdd/section-regenerate` | `gpt-4o` | Regenerates a single named section in isolation |
| Diagnostics | `GET /api/tdd/diagnostics` | `gpt-4o` | Sends "Reply with exactly: OK"; reports latency, env config, error diagnosis |

---

## Docker Build (4 stages)

```
FROM node:22        AS deps        → pnpm install --frozen-lockfile
FROM deps           AS build-api   → tsc + esbuild → artifacts/api-server/dist/
FROM deps           AS build-web   → vite build → artifacts/tdd-generator/dist/
FROM node:22-slim   AS runtime
  COPY --from=build-api  → /app/
  COPY --from=build-web  → /app/public/  (served as static files by Express)
  USER mccain  (non-root)
  EXPOSE 8080
  HEALTHCHECK  GET /api/healthz  (5s interval, 3 retries)
```

---

## CI/CD Pipeline

```
GitHub push to main / PR opened
        │
        ▼
.github/workflows/ci.yml  (Node 20 + pnpm 10)
  1. checkout
  2. setup pnpm + node (frozen-lockfile cache)
  3. pnpm install
  4. pnpm audit --audit-level=moderate
  5. pnpm build  (typecheck + compile all packages)
        │
        ▼  (main branch only, after CI passes)
Docker build  →  push to ACR (testregistry1995.azurecr.io)
        │
        ▼
Azure Container App revision update  (test1995, RG: Rishi_RG)
```
