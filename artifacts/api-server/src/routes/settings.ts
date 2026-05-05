import { Router } from "express";
import { db } from "@workspace/db";
import { portalSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate);

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(portalSettingsTable).where(eq(portalSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(portalSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: portalSettingsTable.key, set: { value, updatedAt: new Date() } });
}

router.get("/", requireRole("admin"), async (_req, res) => {
  const rows = await db.select().from(portalSettingsTable);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

router.put("/:key", requireRole("admin"), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body as { value?: string };
  if (value === undefined) { res.status(400).json({ error: "value is required" }); return; }
  await setSetting(key, value);
  res.json({ ok: true, key, value });
});

router.delete("/:key", requireRole("admin"), async (req, res) => {
  const { key } = req.params;
  await db.delete(portalSettingsTable).where(eq(portalSettingsTable.key, key));
  res.json({ ok: true });
});

export { getSetting, setSetting };
export default router;
