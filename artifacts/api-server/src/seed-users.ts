/**
 * Seed the default admin user into the database.
 * Runs automatically on server startup if the users table is empty.
 */
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";

const DEFAULT_USERS = [
  {
    name: "Enterprise Admin",
    email: "enterprise@mccain.com",
    password: "McCain@123",
    role: "admin",
  },
];

export async function seedUsersIfEmpty(): Promise<void> {
  try {
    const [{ value }] = await db.select({ value: count() }).from(usersTable);
    if (Number(value) > 0) return; // already seeded
    for (const u of DEFAULT_USERS) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await db.insert(usersTable).values({ name: u.name, email: u.email, passwordHash, role: u.role });
      console.log(`[seed] Created user: ${u.email} (${u.role})`);
    }
  } catch (err) {
    console.warn("[seed] Could not seed users (DB may not be reachable):", (err as Error).message);
  }
}

// Allow running directly: pnpm --filter @workspace/api-server run seed
if (process.argv[1]?.includes("seed-users")) {
  seedUsersIfEmpty().then(() => process.exit(0)).catch(() => process.exit(1));
}
