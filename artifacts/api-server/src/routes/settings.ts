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

function getRouteParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  return null;
}

router.get("/", requireRole("admin"), async (_req, res) => {
  const rows = await db.select().from(portalSettingsTable);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

router.put("/:key", requireRole("admin"), async (req, res) => {
  const key = getRouteParam(req.params.key);
  const { value } = req.body as { value?: string };
  if (!key) { res.status(400).json({ error: "Invalid key" }); return; }
  if (value === undefined) { res.status(400).json({ error: "value is required" }); return; }
  await setSetting(key, value);
  res.json({ ok: true, key, value });
});

router.delete("/:key", requireRole("admin"), async (req, res) => {
  const key = getRouteParam(req.params.key);
  if (!key) { res.status(400).json({ error: "Invalid key" }); return; }
  await db.delete(portalSettingsTable).where(eq(portalSettingsTable.key, key));
  res.json({ ok: true });
});

export { getSetting, setSetting };
export default router;
