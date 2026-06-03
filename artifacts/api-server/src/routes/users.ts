import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, requestEventsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/authenticate.js";

// requestId 0 is a sentinel for admin/system-level events not tied to a specific request
async function logAdminEvent(actorName: string, actorRole: string, eventType: string, description: string) {
  await db.insert(requestEventsTable).values({ requestId: 0, actorName, actorRole, eventType, description });
}

const router = Router();
router.use(authenticate);
router.use(requireRole("admin"));

router.get("/", async (_req, res) => {
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));
  res.json({ users });
});

router.post("/", async (req, res) => {
  const { name, email, password, role } = req.body as { name?: string; email?: string; password?: string; role?: string };
  if (!name || !email || !password || !role) {
    res.status(400).json({ error: "name, email, password and role are required" });
    return;
  }
  const validRoles = ["requestor", "enterprise_architect", "cloud_architect", "admin"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "A user with that email already exists" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const actor = req.user!;
  const [user] = await db
    .insert(usersTable)
    .values({ name, email: email.toLowerCase(), passwordHash, role })
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt });
  await logAdminEvent(actor.name, actor.role, "admin_user_created",
    `User account created — Name: "${name}", Email: ${email.toLowerCase()}, Role: ${role}`
  );
  res.status(201).json({ user });
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { role, name, email, password } = req.body as { role?: string; name?: string; email?: string; password?: string };
  const validRoles = ["requestor", "enterprise_architect", "cloud_architect", "admin"];
  if (role && !validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  if (email !== undefined) {
    if (!email.trim()) { res.status(400).json({ error: "Email address is required" }); return; }
    const conflict = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (conflict.length > 0 && conflict[0].id !== id) {
      res.status(409).json({ error: "A user with that email already exists" });
      return;
    }
  }
  if (password !== undefined && password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  const updates: Partial<{ role: string; name: string; email: string; passwordHash: string }> = {};
  if (role) updates.role = role;
  if (name) updates.name = name;
  if (email) updates.email = email.toLowerCase();
  if (password) updates.passwordHash = await bcrypt.hash(password, 12);
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const actor = req.user!;
  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const changeDesc = [
    role ? `role → ${role}` : null,
    name ? `name → "${name}"` : null,
    email ? `email → ${email.toLowerCase()}` : null,
    password ? `password changed` : null,
  ].filter(Boolean).join(", ");
  await logAdminEvent(actor.name, actor.role, "admin_user_updated",
    `User account updated — ${user.name} (${user.email}): ${changeDesc}`
  );
  res.json({ user });
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const reqUser = req.user!;
  if (reqUser.id === id) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }
  // Fetch before deleting to capture name/email in audit log
  const [target] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
  if (!deleted) { res.status(404).json({ error: "User not found" }); return; }
  await logAdminEvent(reqUser.name, reqUser.role, "admin_user_deleted",
    `User account deleted — Name: "${target.name}", Email: ${target.email}, Role: ${target.role}`
  );
  res.json({ ok: true });
});

export default router;
