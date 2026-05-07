# McCain Unified Onboarding Portal — Architecture

> Diagrams render natively on GitHub. For standalone export, paste any block into [mermaid.live](https://mermaid.live).

---

## 1. System Overview

```mermaid
flowchart TD
    Browser("🌐 Browser")

    subgraph ACA["Azure Container App — test1995 · RG: Rishi_RG · Port 8080"]
        Express["Express.js (Node 22)\n/api/* → REST routes\n/*   → SPA static files"]
    end

    subgraph External["External Services"]
        PG[("PostgreSQL 16\nportaldb")]
        AOAI["Azure OpenAI\ngpt-4o"]
    end

    subgraph CICD["CI / CD"]
        GHA["GitHub Actions"]
        ACR["Azure Container Registry\ntestregistry1995.azurecr.io"]
    end

    Browser -- HTTPS --> Express
    Express -- Drizzle ORM --> PG
    Express -- REST (chat completions) --> AOAI
    GHA -- docker build + push --> ACR
    ACR -- image pull on deploy --> ACA
```

---

## 2. Monorepo Package Structure

```mermaid
flowchart LR
    Root["unifiedportal_tdd\npnpm workspace"]

    Root --> ApiServer["artifacts/api-server\nExpress REST API\nNode 22 · esbuild"]
    Root --> TddGen["artifacts/tdd-generator\nReact 19 SPA\nVite · Tailwind · Radix UI"]
    Root --> ApiClient["artifacts/api-client-react\nReact Query hooks\nshared API client"]
    Root --> DB["lib/db\nDrizzle ORM\nPostgreSQL 16 schema"]
    Root --> ApiZod["lib/api-zod\nZod schemas\nshared server + client"]
    Root --> OpenAI["lib/integrations-openai-*\nAzure OpenAI client\nOpenAI fallback client"]

    ApiServer -- imports --> DB
    ApiServer -- imports --> ApiZod
    ApiServer -- imports --> OpenAI
    TddGen -- imports --> ApiClient
    TddGen -- imports --> ApiZod
    ApiClient -- imports --> ApiZod
```

---

## 3. Request Workflow (State Machine)

```mermaid
stateDiagram-v2
    direction LR

    [*] --> submitted : Requestor submits

    submitted --> ea_approved : AI → simple\n(fast-track)
    submitted --> ea_triage   : AI → complex

    ea_triage --> ea_approved          : EA approves
    ea_triage --> submitted            : EA requests changes

    ea_approved --> tdd_in_progress    : Cloud Architect starts TDD

    tdd_in_progress --> tdd_completed  : CA completes TDD

    tdd_completed --> devsecops_approved : CA approves DevSecOps / IaC
    tdd_completed --> tdd_in_progress    : CA rejects — rework

    devsecops_approved --> finops_active : EA activates FinOps

    finops_active --> [*]
```

### AI Classification Logic

```mermaid
flowchart TD
    Submit["Request submitted"]
    AI{"Azure OpenAI\nclassifier"}

    Submit --> AI

    AI -->|"Security / Regulatory /\nIntegration impact: Medium or High\nOR user base ≥ 500\nOR cost: XL or XXL"| Complex["complex\n→ EA review required"]
    AI -->|"All impacts Low / None\nAND users < 500\nAND cost not XL/XXL"| Simple["simple\n→ fast-track to TDD"]

    Complex --> EATriage["ea_triage → ea_approved"]
    Simple   --> EAApproved["ea_approved directly"]
```

---

## 4. Authentication & Roles

```mermaid
flowchart LR
    Login["POST /api/auth/login"]
    JWT["JWT · httpOnly cookie\nportal_token · 8h TTL"]

    Login --> JWT

    JWT --> R1["requestor\nSubmit · view own\nrequests · clone"]
    JWT --> R2["cloud_architect\nTDD generation\nRisk review\nDevSecOps / IaC\nDeploy to Azure"]
    JWT --> R3["enterprise_architect\nEA triage + review\nFinOps activation\nCSV export"]
    JWT --> R4["admin\nAll of the above\nUser management\nPortal settings"]
```

---

## 5. API Structure

```mermaid
flowchart LR
    subgraph Auth["/api/auth"]
        A1["POST /login"]
        A2["POST /logout"]
        A3["GET  /me"]
    end

    subgraph Requests["/api/requests"]
        B1["GET  /\nPOST /"]
        B2["GET  /:id\nDELETE /:id"]
        B3["PATCH /:id/review\n/triage\n/risk-review"]
        B4["PATCH /:id/start-tdd\n/complete-tdd\n/devsecops-review\n/finops-activate"]
        B5["POST /:id/comment\nPOST /:id/clone\nGET  /:id/events"]
        B6["GET /export (CSV)"]
    end

    subgraph TDD["/api/tdd"]
        C1["POST /generate (SSE)"]
        C2["POST /section-regenerate"]
        C3["POST /export (md/docx/pdf)"]
        C4["GET  /submissions\nGET  /submissions/:id"]
        C5["POST /cidr\nPOST /naming"]
        C6["GET  /diagnostics"]
    end

    subgraph IaC["/api/iac"]
        D1["POST /deploy"]
        D2["GET  /deploy/:id"]
    end

    subgraph Admin["/api/users\n/api/settings"]
        E1["Users CRUD\n(admin only)"]
        E2["Settings CRUD\n(admin only)"]
    end

    subgraph Health["/api/healthz"]
        F1["GET /healthz"]
    end
```

---

## 6. Database Schema

```mermaid
erDiagram
    users {
        int     id              PK
        string  name
        string  email
        string  password_hash
        string  role
        timestamp created_at
        timestamp updated_at
    }

    architecture_requests {
        int     id                      PK
        string  title
        string  application_name
        string  application_type
        string  business_unit
        string  line_of_business
        string  status
        string  deployment_model
        string  ai_classification
        string  ai_classification_reason
        jsonb   tdd_form_data
        int     requestor_id            FK
        int     tdd_submission_id       FK
        string  ea_reviewer_name
        string  risk_reviewer_name
        string  ca_assignee_name
        string  devsecops_approver_name
        string  finops_activated_by
        timestamp created_at
        timestamp updated_at
    }

    tdd_submissions {
        int     id              PK
        string  application_name
        string  organization
        string  requestor_email
        jsonb   form_data
        text    generated_content
        string  blob_path_markdown
        string  blob_path_docx
        string  blob_path_pdf
        string  status
        timestamp created_at
        timestamp updated_at
    }

    request_events {
        int     id          PK
        int     request_id  FK
        string  actor_name
        string  actor_role
        string  event_type
        string  description
        timestamp created_at
    }

    portal_settings {
        int     id    PK
        string  key
        string  value
        timestamp updated_at
    }

    users                  ||--o{ architecture_requests : "submits"
    architecture_requests  ||--o|  tdd_submissions      : "links to"
    architecture_requests  ||--o{ request_events        : "has audit trail"
```

---

## 7. Frontend Page Map

```mermaid
flowchart TD
    Login["/login\nLogin"]

    Login --> Dashboard["/dashboard\nDashboard"]

    Dashboard --> RequestList["/requests\nAll Requests\nfiltered by role"]
    Dashboard --> SubmitRequest["/requests/new\nSubmit Request\n5-step form"]
    Dashboard --> Integrations["/integrations\nAzure OpenAI diagnostics\nTeams webhook config"]
    Dashboard --> AdminUsers["/admin/users\nUser Management\nadmin only"]

    RequestList --> RequestDetail["/requests/:id\nRequest Detail\nfull workflow view"]

    RequestDetail -->|"status: tdd_completed\n(View TDD)"| TddViewer["/tdd-view/:requestId\nTDD Viewer\nread-only markdown"]
    RequestDetail -->|"status: tdd_in_progress\n(Continue TDD)"| Wizard["/wizard/:requestId\nTDD Wizard\n5-step generation form"]

    Wizard --> Preview["/preview\nTDD Preview\nSSE streaming + IaC"]

    subgraph Phase3["Phase 3 — DevSecOps (inside /requests/:id)"]
        P3A["AzureServiceSelector\nauto-detected from TDD"]
        P3B["Terraform code preview\ncopy / download"]
        P3C["Deploy to Azure\nstatus polling"]
        P3D["Approve / Reject"]
        P3A --> P3B --> P3C --> P3D
    end

    RequestDetail --> Phase3
```

---

## 8. AI Integration

```mermaid
sequenceDiagram
    participant U as User / CA
    participant API as Express API
    participant AOAI as Azure OpenAI (gpt-4o)

    Note over U,AOAI: Request Classification (at submission)
    U->>API: POST /api/requests {form data}
    API->>AOAI: classify: simple or complex?
    AOAI-->>API: {classification, confidence, reason}
    API-->>U: {request, fastTrack, aiClassification}

    Note over U,AOAI: TDD Generation (SSE streaming)
    U->>API: POST /api/tdd/generate
    loop 8 TDD sections
        API->>AOAI: generate section N
        AOAI-->>API: streamed tokens
        API-->>U: SSE chunk {content, sectionTitle}
    end
    API-->>U: SSE done {fullContent}

    Note over U,AOAI: Section Regeneration
    U->>API: POST /api/tdd/section-regenerate
    API->>AOAI: regenerate {sectionTitle, context}
    AOAI-->>API: regenerated content
    API-->>U: {sectionTitle, regenerated}

    Note over U,AOAI: Connectivity Diagnostics
    U->>API: GET /api/tdd/diagnostics
    API->>AOAI: "Reply with exactly: OK"
    AOAI-->>API: "OK" + latency
    API-->>U: {status, latencyMs, provider, diagnosis}
```

---

## 9. IaC Deployment Flow

```mermaid
sequenceDiagram
    participant CA as Cloud Architect
    participant UI as React (RequestDetail)
    participant API as Express API
    participant AZ as Azure SDK

    CA->>UI: Phase 3 — opens request (tdd_completed)
    UI->>API: GET /api/tdd/submissions/:tddSubmissionId
    API-->>UI: {generatedContent}
    UI->>UI: detectServicesFromTdd(content)
    UI-->>CA: AzureServiceSelector (auto-selected)

    CA->>UI: confirm services + enter password
    CA->>UI: click Deploy to Azure
    UI->>API: POST /api/iac/deploy {appName, region, selectedServices, adminPassword}
    API->>AZ: create resource group + resources
    AZ-->>API: {deploymentId}
    API-->>UI: {deploymentId}

    loop poll every 5s
        UI->>API: GET /api/iac/deploy/:deploymentId
        API->>AZ: get deployment status
        AZ-->>API: {status: pending|provisioning|succeeded|failed}
        API-->>UI: {deployment}
    end

    UI-->>CA: Deployment succeeded / failed
    CA->>UI: Approve DevSecOps
    UI->>API: PATCH /api/requests/:id/devsecops-review {action: approve}
    API-->>UI: {request: status=devsecops_approved}
```

---

## 10. Docker Build

```mermaid
flowchart TD
    S1["Stage 1: deps\nFROM node:22\npnpm install --frozen-lockfile"]

    S2["Stage 2: build-api\nFROM deps\ntsc + esbuild\n→ artifacts/api-server/dist/"]

    S3["Stage 3: build-web\nFROM deps\nvite build\n→ artifacts/tdd-generator/dist/"]

    S4["Stage 4: runtime\nFROM node:22-slim\nCOPY api dist → /app/\nCOPY web dist → /app/public/\nUSER mccain (non-root)\nEXPOSE 8080\nHEALTHCHECK GET /api/healthz"]

    S1 --> S2
    S1 --> S3
    S2 --> S4
    S3 --> S4
```

---

## 11. CI/CD Pipeline

```mermaid
flowchart TD
    Push["git push to main\nor Pull Request opened"]

    subgraph CI["GitHub Actions — ci.yml (Node 20 + pnpm 10)"]
        C1["checkout"]
        C2["setup pnpm + node\nrestore cache"]
        C3["pnpm install\n--frozen-lockfile"]
        C4["pnpm audit\n--audit-level=moderate"]
        C5["pnpm build\ntypecheck + compile all packages"]
    end

    subgraph Deploy["Deploy (main branch only)"]
        D1["docker build\n4-stage"]
        D2["docker push\ntestregistry1995.azurecr.io"]
        D3["Azure Container App\nrevision update\ntest1995 · RG: Rishi_RG"]
    end

    Push --> C1 --> C2 --> C3 --> C4 --> C5
    C5 -->|CI passes on main| D1 --> D2 --> D3
```
