import { Router } from "express";
import { db } from "@workspace/db";
import { portalSettingsTable, requestEventsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/authenticate.js";

// requestId 0 is a sentinel for admin/system-level events not tied to a specific request
async function logAdminEvent(actorName: string, actorRole: string, eventType: string, description: string) {
  await db.insert(requestEventsTable).values({ requestId: 0, actorName, actorRole, eventType, description });
}

const router = Router();
router.use(authenticate);

const SETTINGS_KEY = "approval_delegations";

interface Delegation {
  id: string;
  delegatorName: string;
  delegatorRole: string;
  delegateName: string;
  delegateEmail: string;
  scope: string;
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
}

async function loadDelegations(): Promise<Delegation[]> {
  const [row] = await db
    .select()
    .from(portalSettingsTable)
    .where(eq(portalSettingsTable.key, SETTINGS_KEY))
    .limit(1);
  if (!row?.value) return [];
  try {
    return JSON.parse(row.value) as Delegation[];
  } catch {
    return [];
  }
}

async function saveDelegations(delegations: Delegation[]) {
  const value = JSON.stringify(delegations);
  const existing = await db
    .select({ id: portalSettingsTable.id })
    .from(portalSettingsTable)
    .where(eq(portalSettingsTable.key, SETTINGS_KEY))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(portalSettingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(portalSettingsTable.key, SETTINGS_KEY));
  } else {
    await db.insert(portalSettingsTable).values({ key: SETTINGS_KEY, value });
  }
}

// GET /api/delegations
router.get("/", async (_req, res) => {
  try {
    const delegations = await loadDelegations();
    const today = new Date().toISOString().slice(0, 10);
    const enriched = delegations.map((d) => ({
      ...d,
      active: d.startDate <= today && d.endDate >= today,
    }));
    res.json({ delegations: enriched });
  } catch {
    res.status(500).json({ error: "Failed to load delegations" });
  }
});

// POST /api/delegations
router.post("/", requireRole("enterprise_architect", "cloud_architect", "admin"), async (req, res) => {
  try {
    const user = req.user!;
    const { delegateName, delegateEmail, scope, startDate, endDate, reason } = req.body as {
      delegateName?: string;
      delegateEmail?: string;
      scope?: string;
      startDate?: string;
      endDate?: string;
      reason?: string;
    };

    if (!delegateName?.trim() || !delegateEmail?.trim() || !startDate || !endDate || !scope) {
      res.status(400).json({ error: "delegateName, delegateEmail, scope, startDate, and endDate are required" });
      return;
    }

    if (endDate < startDate) {
      res.status(400).json({ error: "endDate must be on or after startDate" });
      return;
    }

    const delegation: Delegation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      delegatorName: user.name,
      delegatorRole: user.role,
      delegateName: delegateName.trim(),
      delegateEmail: delegateEmail.trim().toLowerCase(),
      scope: scope.trim(),
      startDate,
      endDate,
      reason: reason?.trim() ?? "",
      createdAt: new Date().toISOString(),
    };

    const existing = await loadDelegations();
    await saveDelegations([...existing, delegation]);

    await logAdminEvent(user.name, user.role, "delegation_created",
      `Approval delegation created — Delegated to: ${delegateName.trim()} (${delegateEmail.trim().toLowerCase()}), Scope: ${scope.trim()}, Period: ${startDate} to ${endDate}`
    );

    res.status(201).json({ delegation });
  } catch {
    res.status(500).json({ error: "Failed to create delegation" });
  }
});

// DELETE /api/delegations/:id
router.delete("/:id", requireRole("enterprise_architect", "cloud_architect", "admin"), async (req, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const existing = await loadDelegations();

    const target = existing.find((d) => d.id === id);
    if (!target) {
      res.status(404).json({ error: "Delegation not found" });
      return;
    }

    if (target.delegatorName !== user.name && user.role !== "admin") {
      res.status(403).json({ error: "You can only remove your own delegations" });
      return;
    }

    await saveDelegations(existing.filter((d) => d.id !== id));
    await logAdminEvent(user.name, user.role, "delegation_revoked",
      `Approval delegation revoked — Delegate: ${target.delegateName} (${target.delegateEmail}), Scope: ${target.scope}, Original period: ${target.startDate} to ${target.endDate}`
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove delegation" });
  }
});

export default router;
