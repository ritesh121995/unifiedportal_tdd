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
    logger.warn({ err }, "Startup migration warning (non-fatal)");
  }
}

seedUsersIfEmpty();
runStartupMigrations();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
