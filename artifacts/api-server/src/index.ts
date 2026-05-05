import app from "./app";
import { logger } from "./lib/logger";
import { seedUsersIfEmpty } from "./seed-users.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runStartupMigrations() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'requestor',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tdd_submissions (
        id SERIAL PRIMARY KEY,
        application_name TEXT NOT NULL,
        organization TEXT NOT NULL,
        line_of_business TEXT NOT NULL,
        requestor_email TEXT NOT NULL,
        environments TEXT[] NOT NULL,
        form_data JSONB NOT NULL,
        generated_content TEXT,
        blob_path_markdown TEXT,
        blob_path_docx TEXT,
        blob_path_pdf TEXT,
        storage_provider TEXT NOT NULL DEFAULT 'postgresql',
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tdd_submissions_email ON tdd_submissions (requestor_email)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tdd_submissions_status ON tdd_submissions (status)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS architecture_requests (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        application_name TEXT NOT NULL,
        application_type TEXT NOT NULL,
        business_unit TEXT NOT NULL,
        line_of_business TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Medium',
        description TEXT NOT NULL,
        business_justification TEXT NOT NULL,
        target_environments TEXT[] NOT NULL,
        azure_regions TEXT[] NOT NULL,
        dtslt_leader TEXT,
        expected_user_base TEXT,
        target_go_live_date DATE,
        deployment_model TEXT DEFAULT 'To be defined',
        requestor_id INTEGER NOT NULL,
        requestor_name TEXT NOT NULL,
        requestor_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'submitted',
        ea_reviewer_id INTEGER,
        ea_reviewer_name TEXT,
        ea_reviewed_at TIMESTAMP,
        ea_comments TEXT,
        risk_reviewer_id INTEGER,
        risk_reviewer_name TEXT,
        risk_reviewed_at TIMESTAMP,
        risk_comments TEXT,
        ca_assignee_id INTEGER,
        ca_assignee_name TEXT,
        tdd_submission_id INTEGER,
        devsecops_approver_id INTEGER,
        devsecops_approver_name TEXT,
        devsecops_approved_at TIMESTAMP,
        devsecops_comments TEXT,
        finops_activated_at TIMESTAMP,
        finops_activated_by TEXT,
        tdd_form_data JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_requests_status ON architecture_requests (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_requests_requestor ON architecture_requests (requestor_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_requests_ea_reviewer ON architecture_requests (ea_reviewer_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_requests_ca_assignee ON architecture_requests (ca_assignee_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_requests_created_at ON architecture_requests (created_at DESC)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS request_events (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        event_type TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_request_events_request_id ON request_events (request_id, created_at DESC)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, created_at)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS portal_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`
      ALTER TABLE architecture_requests
        ADD COLUMN IF NOT EXISTS dtslt_leader TEXT,
        ADD COLUMN IF NOT EXISTS expected_user_base TEXT,
        ADD COLUMN IF NOT EXISTS target_go_live_date DATE,
        ADD COLUMN IF NOT EXISTS deployment_model TEXT DEFAULT 'To be defined'
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS iac_deployments (
        id SERIAL PRIMARY KEY,
        request_id INTEGER,
        subscription_id TEXT NOT NULL,
        resource_group TEXT NOT NULL,
        app_name TEXT NOT NULL,
        region TEXT NOT NULL DEFAULT 'canadacentral',
        status TEXT NOT NULL DEFAULT 'pending',
        resources JSONB,
        log TEXT,
        error TEXT,
        started_at TIMESTAMP DEFAULT NOW() NOT NULL,
        completed_at TIMESTAMP
      )
    `);
    logger.info("Startup migrations complete");
  } catch (err) {
    logger.error({ err }, "Startup migration failed");
    throw err;
  }
}

async function startServer(): Promise<void> {
  await runStartupMigrations();
  await seedUsersIfEmpty();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Server startup failed");
  process.exit(1);
});
