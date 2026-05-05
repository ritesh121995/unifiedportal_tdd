import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/authenticate.js";

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
  const [user] = await db
    .insert(usersTable)
    .values({ name, email: email.toLowerCase(), passwordHash, role })
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt });
  res.status(201).json({ user });
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { role, name } = req.body as { role?: string; name?: string };
  const validRoles = ["requestor", "enterprise_architect", "cloud_architect", "admin"];
  if (role && !validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const updates: Partial<{ role: string; name: string }> = {};
  if (role) updates.role = role;
  if (name) updates.name = name;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
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
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
  if (!deleted) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ok: true });
});

export default router;
