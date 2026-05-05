-- ============================================================================
-- McCain Unified Onboarding Portal — PostgreSQL schema
-- Generated from Drizzle ORM schema in lib/db/src/schema/
--
-- Usage (local Postgres):
--   createdb mccain_portal
--   psql -d mccain_portal -f database-schema.sql
--
-- Tested on PostgreSQL 14+
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. users
--    Application users with role-based access.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL       PRIMARY KEY,
    name            TEXT         NOT NULL,
    email           TEXT         NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    role            TEXT         NOT NULL DEFAULT 'requestor',
        -- expected values: admin | enterprise_architect | cloud_architect | requestor
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);


-- ----------------------------------------------------------------------------
-- 2. tdd_submissions
--    Generated Technical Design Documents (output of the TDD wizard).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tdd_submissions (
    id                  SERIAL       PRIMARY KEY,
    application_name    TEXT         NOT NULL,
    organization        TEXT         NOT NULL,
    line_of_business    TEXT         NOT NULL,
    requestor_email     TEXT         NOT NULL,
    environments        TEXT[]       NOT NULL,
    form_data           JSONB        NOT NULL,
    generated_content   TEXT,
    blob_path_markdown  TEXT,
    blob_path_docx      TEXT,
    blob_path_pdf       TEXT,
    storage_provider    TEXT         NOT NULL DEFAULT 'postgresql',
    status              TEXT         NOT NULL DEFAULT 'draft',
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tdd_submissions_email  ON tdd_submissions (requestor_email);
CREATE INDEX IF NOT EXISTS idx_tdd_submissions_status ON tdd_submissions (status);


-- ----------------------------------------------------------------------------
-- 3. architecture_requests
--    Central onboarding request — moves through the 5-phase workflow:
--    submitted → ea_triage → ea_approved → risk_approved
--    → tdd_in_progress → tdd_completed → devsecops_approved → finops_active
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS architecture_requests (
    id                          SERIAL       PRIMARY KEY,

    -- Project Overview
    title                       TEXT         NOT NULL,
    application_name            TEXT         NOT NULL,
    application_type            TEXT         NOT NULL,   -- Migration | Greenfield | Enhancement
    business_unit               TEXT         NOT NULL,
    line_of_business            TEXT         NOT NULL,
    priority                    TEXT         NOT NULL DEFAULT 'Medium',  -- Low | Medium | High | Critical
    description                 TEXT         NOT NULL,
    business_justification      TEXT         NOT NULL,
    target_environments         TEXT[]       NOT NULL,
    azure_regions               TEXT[]       NOT NULL,

    -- Project Overview – extended
    dtslt_leader                TEXT,
    expected_user_base          TEXT,
    target_go_live_date         DATE,
    deployment_model            TEXT         DEFAULT 'To be defined',

    -- Requestor
    requestor_id                INTEGER      NOT NULL REFERENCES users(id),
    requestor_name              TEXT         NOT NULL,
    requestor_email             TEXT         NOT NULL,

    -- Lifecycle status (see header for valid values)
    status                      TEXT         NOT NULL DEFAULT 'submitted',

    -- Phase 1 — Enterprise Architect review
    ea_reviewer_id              INTEGER      REFERENCES users(id),
    ea_reviewer_name            TEXT,
    ea_reviewed_at              TIMESTAMP,
    ea_comments                 TEXT,

    -- Phase 2 — Risk / Security Architect sign-off
    risk_reviewer_id            INTEGER      REFERENCES users(id),
    risk_reviewer_name          TEXT,
    risk_reviewed_at            TIMESTAMP,
    risk_comments               TEXT,

    -- Phase 3 — Cloud Architect / TDD authoring
    ca_assignee_id              INTEGER      REFERENCES users(id),
    ca_assignee_name            TEXT,
    tdd_submission_id           INTEGER      REFERENCES tdd_submissions(id),

    -- Phase 4 — DevSecOps / IaC approval
    devsecops_approver_id       INTEGER      REFERENCES users(id),
    devsecops_approver_name     TEXT,
    devsecops_approved_at       TIMESTAMP,
    devsecops_comments          TEXT,

    -- Phase 5 — FinOps activation
    finops_activated_at         TIMESTAMP,
    finops_activated_by         TEXT,

    -- TDD wizard pre-fill payload (large JSON blob captured at ARR submission)
    tdd_form_data               JSONB,

    created_at                  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_requests_status        ON architecture_requests (status);
CREATE INDEX IF NOT EXISTS idx_arch_requests_requestor     ON architecture_requests (requestor_id);
CREATE INDEX IF NOT EXISTS idx_arch_requests_ea_reviewer   ON architecture_requests (ea_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_arch_requests_ca_assignee   ON architecture_requests (ca_assignee_id);
CREATE INDEX IF NOT EXISTS idx_arch_requests_created_at    ON architecture_requests (created_at DESC);


-- ----------------------------------------------------------------------------
-- 4. request_events
--    Append-only audit log of state transitions and actions per request.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS request_events (
    id           SERIAL       PRIMARY KEY,
    request_id   INTEGER      NOT NULL REFERENCES architecture_requests(id) ON DELETE CASCADE,
    actor_name   TEXT         NOT NULL,
    actor_role   TEXT         NOT NULL,
    event_type   TEXT         NOT NULL,
    description  TEXT         NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_events_request_id ON request_events (request_id, created_at DESC);


-- ----------------------------------------------------------------------------
-- 5. conversations
--    AI assistant chat threads (one per user session/topic).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id          SERIAL                    PRIMARY KEY,
    title       TEXT                      NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE  NOT NULL DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- 6. messages
--    Individual messages within an AI conversation.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id              SERIAL                    PRIMARY KEY,
    conversation_id INTEGER                   NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT                      NOT NULL,   -- user | assistant | system
    content         TEXT                      NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, created_at);


-- ----------------------------------------------------------------------------
-- 7. portal_settings
--    Simple key/value configuration store for runtime toggles.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_settings (
    id          SERIAL       PRIMARY KEY,
    key         TEXT         NOT NULL UNIQUE,
    value       TEXT         NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- BOOTSTRAP ADMIN
-- ============================================================================
-- The application creates the first admin at startup only when the users table
-- is empty and BOOTSTRAP_ADMIN_PASSWORD is provided. Do not store a static
-- bootstrap password or hash in database scripts.

COMMIT;

-- ============================================================================
-- Verify install
-- ============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- SELECT email, role FROM users;
