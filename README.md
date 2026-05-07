# McCain Unified Onboarding Portal

An enterprise Azure cloud infrastructure governance platform that manages the end-to-end lifecycle of cloud onboarding requests — from submission through EA review, TDD generation, DevSecOps approval, and FinOps activation.

---

## High-Level Architecture

```mermaid
flowchart TB
    %% ── ACTORS ─────────────────────────────────────────────────────────────
    REQ(["👤 Requestor"])
    CA(["👷 Cloud Architect"])
    EA(["🏛️ Enterprise Architect"])
    ADM(["⚙️ Admin"])

    %% ── FRONTEND ────────────────────────────────────────────────────────────
    subgraph SPA["⚛️  React SPA  ·  Vite  ·  Tailwind  ·  Radix UI"]
        F1["Dashboard  ·  Submit Request  ·  Request List"]
        F2["Request Detail  — all workflow phases"]
        F3["TDD Wizard  →  TDD Preview  SSE streaming"]
        F4["TDD Viewer  read-only  ·  Integrations  ·  Admin"]
    end

    %% ── CONTAINER ───────────────────────────────────────────────────────────
    subgraph ACA["🐳  Azure Container App  ·  test1995  ·  RG: Rishi_RG  ·  Port 8080"]
        subgraph API["🚀  Express REST API  ·  Node 22  ·  esbuild"]
            A1["  /api/auth         JWT · httpOnly cookie · 8h TTL  "]
            A2["  /api/requests     Workflow engine · AI classification  "]
            A3["  /api/tdd          Generate · Export · SSE · Diagnostics  "]
            A4["  /api/iac          Azure SDK deploy · status poll  "]
            A5["  /api/users        Admin CRUD  "]
            A6["  /api/settings     Portal config · webhook URL  "]
            A7["  /api/healthz      Liveness probe  "]
        end
    end

    %% ── DATABASE ────────────────────────────────────────────────────────────
    PG[("🗄️  PostgreSQL 16\n\narchitecture_requests\ntdd_submissions\nrequest_events\nusers · portal_settings")]

    %% ── AZURE OPENAI ────────────────────────────────────────────────────────
    AOAI["🤖  Azure OpenAI  ·  gpt-4o\n\n① Classify request: simple vs complex\n② Stream TDD generation  8 sections via SSE\n③ Regenerate individual sections\n④ Connection diagnostics"]

    %% ── IAC TARGET ──────────────────────────────────────────────────────────
    AZR["☁️  Azure Resource Manager\n\nResource Groups · App Services\nAKS · SQL · Key Vault · VNet"]

    %% ── CI / CD ─────────────────────────────────────────────────────────────
    subgraph CICD["🔄  CI / CD"]
        GHA["GitHub Actions\naudit · typecheck · docker build"]
        ACR["Azure Container Registry\ntestregistry1995.azurecr.io"]
    end

    %% ── REQUEST LIFECYCLE ───────────────────────────────────────────────────
    subgraph WF["📋  Request Lifecycle"]
        direction LR
        S1([submitted]) -->|"AI: complex"| S2([ea_triage])
        S1 -->|"AI: simple ⚡"| S3
        S2 -->|EA approves| S3([ea_approved])
        S3 --> S4([tdd_in_progress])
        S4 --> S5([tdd_completed])
        S5 --> S6([devsecops_approved])
        S6 --> S7([finops_active ✓])
    end

    %% ── CONNECTIONS ─────────────────────────────────────────────────────────
    REQ & CA & EA & ADM -->|HTTPS| SPA
    SPA <-->|"fetch / SSE"| ACA

    API <-->|"Drizzle ORM"| PG
    A2 & A3 -->|"chat completions"| AOAI
    A4 -->|"ARM SDK"| AZR

    GHA -->|"docker push"| ACR
    ACR -->|"image pull"| ACA
```

> For the full detailed architecture (DB schema, sequence diagrams, Docker build stages, CI/CD pipeline) see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS · Radix UI / Shadcn |
| Backend | Express.js · Node 22 · TypeScript · esbuild |
| Database | PostgreSQL 16 · Drizzle ORM |
| AI | Azure OpenAI (gpt-4o) · SSE streaming |
| Auth | JWT · httpOnly cookie · role-based access |
| IaC | Terraform generation · Azure SDK deployment |
| Deployment | Azure Container Apps · Azure Container Registry |
| CI/CD | GitHub Actions · pnpm 10 · Docker multi-stage build |

---

## Roles

| Role | Capabilities |
|------|-------------|
| `requestor` | Submit requests · view own requests · clone |
| `cloud_architect` | TDD generation · risk review · DevSecOps/IaC · deploy to Azure |
| `enterprise_architect` | EA triage & review · FinOps activation · CSV export |
| `admin` | All of the above · user management · portal settings |

---

## Request Workflow

```
submitted → ea_triage → ea_approved → tdd_in_progress → tdd_completed → devsecops_approved → finops_active
                ↑                          ↑
         AI: complex              AI: simple fast-tracks
                                  directly to ea_approved
```

---

## Quick Start

### Prerequisites
- Node 22 + pnpm 10
- PostgreSQL 16
- Azure OpenAI resource (or standard OpenAI API key as fallback)

### Environment Variables

```env
DATABASE_URL=postgresql://portaluser:portalpass@localhost:5432/portaldb
JWT_SECRET=<min 32 chars>
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=<password>

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_DEPLOYMENT=<deployment-name>

# Fallback (if Azure not configured)
OPENAI_API_KEY=<key>
```

### Run with Docker Compose

```bash
docker compose up --build
```

App available at `http://localhost:8080`.

### Run locally

```bash
pnpm install
pnpm build
pnpm start
```

---

## Deployment

Pushes to `main` trigger GitHub Actions which builds the Docker image and pushes to Azure Container Registry (`testregistry1995.azurecr.io`), then updates the Container App (`test1995`, RG: `Rishi_RG`).
