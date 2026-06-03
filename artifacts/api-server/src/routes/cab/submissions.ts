import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { cabSubmissionsTable, architectureRequestsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "../../middleware/authenticate.js";

const router: IRouter = Router();

// GET /api/cab/submissions — list submissions (admins/architects see all; requestors see own)
router.get("/submissions", async (req, res) => {
  const user = req.user!;

  const cols = {
    id: cabSubmissionsTable.id,
    applicationName: cabSubmissionsTable.applicationName,
    organization: cabSubmissionsTable.organization,
    lineOfBusiness: cabSubmissionsTable.lineOfBusiness,
    requestorEmail: cabSubmissionsTable.requestorEmail,
    environments: cabSubmissionsTable.environments,
    status: cabSubmissionsTable.status,
    createdAt: cabSubmissionsTable.createdAt,
    updatedAt: cabSubmissionsTable.updatedAt,
  };

  const rows = user.role === "requestor"
    ? await db.select(cols).from(cabSubmissionsTable).where(eq(cabSubmissionsTable.requestorEmail, user.email)).orderBy(desc(cabSubmissionsTable.createdAt))
    : await db.select(cols).from(cabSubmissionsTable).orderBy(desc(cabSubmissionsTable.createdAt));

  res.json({ submissions: rows });
});

// GET /api/cab/submissions/:id — full submission including generated markdown
router.get("/submissions/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const user = req.user!;
  const [row] = await db.select().from(cabSubmissionsTable).where(eq(cabSubmissionsTable.id, id)).limit(1);

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (user.role === "requestor" && row.requestorEmail !== user.email) {
    // Also allow if this submission is linked to an architecture request owned by this user
    const [linkedRequest] = await db
      .select({ requestorEmail: architectureRequestsTable.requestorEmail })
      .from(architectureRequestsTable)
      .where(eq(architectureRequestsTable.cabSubmissionId, id))
      .limit(1);
    if (!linkedRequest || linkedRequest.requestorEmail !== user.email) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  res.json({ submission: row });
});

// DELETE /api/cab/submissions/:id — admin only
router.delete("/submissions/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(cabSubmissionsTable)
    .where(eq(cabSubmissionsTable.id, id))
    .returning({ id: cabSubmissionsTable.id });

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

export default router;
