/**
 * Seed the default admin user into the database.
 * Runs automatically on server startup if the users table is empty.
 */
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { count } from "drizzle-orm";

const DEFAULT_ADMIN_EMAIL = "enterprise@mccain.com";
const DEFAULT_ADMIN_NAME = "Enterprise Admin";
const DEFAULT_ADMIN_ROLE = "admin";
const MIN_PRODUCTION_PASSWORD_LENGTH = 16;

export async function seedUsersIfEmpty(): Promise<void> {
  try {
    const [{ value }] = await db.select({ value: count() }).from(usersTable);
    if (Number(value) > 0) return; // already seeded
    const password = getBootstrapAdminPassword();
    if (!password) return;
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(usersTable).values({
      name: process.env.BOOTSTRAP_ADMIN_NAME ?? DEFAULT_ADMIN_NAME,
      email: (process.env.BOOTSTRAP_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).toLowerCase(),
      passwordHash,
      role: DEFAULT_ADMIN_ROLE,
    });
    console.log(`[seed] Created bootstrap admin user: ${process.env.BOOTSTRAP_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown seed error";
    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    }
    console.warn("[seed] Could not seed users (DB may not be reachable):", message);
  }
}

function getBootstrapAdminPassword(): string | null {
  const configuredPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const isProduction = process.env.NODE_ENV === "production";

  if (configuredPassword && configuredPassword.length >= MIN_PRODUCTION_PASSWORD_LENGTH) {
    return configuredPassword;
  }

  if (isProduction) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be set to at least 16 characters for first production startup.");
  }

  if (configuredPassword) {
    return configuredPassword;
  }

  console.warn("[seed] BOOTSTRAP_ADMIN_PASSWORD not set; skipping bootstrap admin seed.");
  return null;
}

// Allow running directly: pnpm --filter @workspace/api-server run seed
if (process.argv[1]?.includes("seed-users")) {
  seedUsersIfEmpty().then(() => process.exit(0)).catch(() => process.exit(1));
}
