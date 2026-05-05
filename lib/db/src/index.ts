import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const DISABLE_SSL_MODES = new Set(["disable", "allow"]);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function shouldUseSsl(connectionString: string): boolean {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  if (sslMode) {
    return !DISABLE_SSL_MODES.has(sslMode);
  }

  return process.env.NODE_ENV === "production" || url.hostname.includes("azure.com");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL),
});

export const db = drizzle(pool, { schema });

export * from "./schema";
