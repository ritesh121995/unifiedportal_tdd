import { Router } from "express";
import { db } from "@workspace/db";
import { architectureRequestsTable, requestEventsTable, portalSettingsTable } from "@workspace/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import { createOpenAiClientContext, resolveOpenAiModel } from "./tdd/openai-client.js";

interface AiClassificationResult {
  classification: "simple" | "complex";
  confidence: "high" | "medium" | "low";
  reason: string;
}

async function classifyRequestWithAI(body: {
  applicationType: string;
  expectedUserBase?: string | null;
  securityImpact?: string;
  regulatoryImpact?: string;
  integrationImpact?: string;
  costTShirtSize?: string;
}): Promise<AiClassificationResult> {
  try {
    const { client, usesAzure } = createOpenAiClientContext();
    const model = resolveOpenAiModel(usesAzure);

    const prompt = `You are an Enterprise Architecture governance assistant at McCain Foods. Classify this cloud infrastructure request as "simple" (fast-track directly to TDD) or "complex" (requires EA review).

Classification is based solely on impact, scale, and cost — not on environment choice, region count, HA/DR settings, priority, or availability targets.

SIMPLE — fast-track to TDD (none of the complex triggers apply):
- Security impact: None or Low
- Regulatory impact: None or Low
- Integration impact: None or Low
- Expected user base under 500
- Cost size is not XL or XXL

COMPLEX — requires EA review (any one sufficient):
- Security impact: Medium or High
- Regulatory impact: Medium or High
- Integration impact: Medium or High
- Expected user base 500 or more
- Cost size XL or XXL

Request:
Application Type: ${body.applicationType}
User Base: ${body.expectedUserBase ?? "Not specified"}
Security Impact: ${body.securityImpact ?? "Not specified"}
Regulatory Impact: ${body.regulatoryImpact ?? "Not specified"}
Integration Impact: ${body.integrationImpact ?? "Not specified"}
Cost Size: ${body.costTShirtSize ?? "Not specified"}

Respond with JSON only: {"classification":"simple"|"complex","confidence":"high"|"medium"|"low","reason":"One sentence citing the specific field that determined the classification."}`;

    const response = await Promise.race([
      client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]) as Awaited<ReturnType<typeof client.chat.completions.create>>;

    const content = response.choices[0]?.message?.content ?? "{}";
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return {
      classification: parsed.classification === "simple" ? "simple" : "complex",
      confidence: (["high", "medium", "low"] as const).includes(parsed.confidence) ? parsed.confidence : "medium",
      reason: typeof parsed.reason === "string" ? parsed.reason : "Classification based on request parameters.",
    };
  } catch {
    return { classification: "complex", confidence: "low", reason: "AI classification unavailable — routed to EA review as a precaution." };
  }
}

const router = Router();
router.use(authenticate);

async function logEvent(
  requestId: number,
  actorName: string,
  actorRole: string,
  eventType: string,
  description: string
) {
  await db.insert(requestEventsTable).values({ requestId, actorName, actorRole, eventType, description });
}

async function sendWebhookNotification(requestTitle: string, actor: string, status: string, requestId: number): Promise<void> {
  try {
    const [row] = await db.select().from(portalSettingsTable).where(eq(portalSettingsTable.key, "teams_webhook_url")).limit(1);
    const webhookUrl = row?.value;
    if (!webhookUrl) return;

    const statusLabels: Record<string, string> = {
      submitted: "New request submitted",
      ea_triage: "Moved to EA Triage",
      ea_approved: "Approved by Enterprise Architect",
      ea_rejected: "Rejected by Enterprise Architect",
      risk_approved: "Risk Analysis approved",
      risk_rejected: "Risk Analysis rejected",
      tdd_in_progress: "TDD generation started",
      tdd_completed: "TDD completed and reviewed",
      devsecops_approved: "DevSecOps deployment approved",
      devsecops_rejected: "DevSecOps deployment rejected",
      finops_active: "FinOps monitoring activated",
    };

    const label = statusLabels[status] ?? status;
    const themeColor = status.includes("rejected") ? "FF0000" : status === "finops_active" ? "00C851" : "FFCD00";

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor,
        summary: `McCain CCoE Portal — ${label}`,
        sections: [{
          activityTitle: `**${label}**`,
          activitySubtitle: `ARR #${requestId} · ${requestTitle}`,
          activityText: `Action by: **${actor}**`,
          facts: [
            { name: "Request ID", value: `#${requestId}` },
            { name: "Application", value: requestTitle },
            { name: "Status", value: label },
            { name: "Actor", value: actor },
          ],
          markdown: true,
        }],
        potentialAction: [{
          "@type": "OpenUri",
          name: "View in Portal",
          targets: [{ os: "default", uri: `https://app.mccain.com/requests/${requestId}` }],
        }],
      }),
    });
  } catch {
    // non-blocking — webhook errors never affect the main response
  }
}

function parseRequestId(value: string | string[] | undefined): number {
  if (typeof value !== "string") {
    return Number.NaN;
  }

  return Number.parseInt(value, 10);
}

// In-memory throttle for view events — prevents per-refresh spam (1 hour window)
const viewThrottle = new Map<string, number>();
const VIEW_THROTTLE_MS = 60 * 60 * 1000;

// GET /api/requests
router.get("/", async (req, res) => {
  const user = req.user!;
  let rows;
  if (user.role === "requestor") {
    rows = await db
      .select()
      .from(architectureRequestsTable)
      .where(eq(architectureRequestsTable.requestorId, user.id))
      .orderBy(desc(architectureRequestsTable.createdAt));
  } else {
    rows = await db
      .select()
      .from(architectureRequestsTable)
      .orderBy(desc(architectureRequestsTable.createdAt));
  }
  res.json({ requests: rows });
});

// GET /api/requests/export — CSV download (admin / architect only)
router.get("/export", requireRole("enterprise_architect"), async (_req, res) => {
  const rows = await db
    .select()
    .from(architectureRequestsTable)
    .orderBy(desc(architectureRequestsTable.createdAt));

  const COLS = [
    "id", "title", "applicationName", "applicationType", "businessUnit", "lineOfBusiness",
    "priority", "status", "deploymentModel", "requestorName", "requestorEmail",
    "targetEnvironments", "azureRegions", "targetGoLiveDate", "dtsltLeader",
    "expectedUserBase", "eaReviewerName", "eaReviewedAt", "eaComments",
    "caAssigneeName", "devsecopsApproverName", "devsecopsApprovedAt",
    "finopsActivatedBy", "finopsActivatedAt", "createdAt", "updatedAt",
  ] as const;

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return `"${v.join("; ")}"`;
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = COLS.join(",");
  const lines = rows.map((r) => COLS.map((c) => escape(r[c as keyof typeof r])).join(","));
  const csv = [header, ...lines].join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="mccain-arr-requests-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

// POST /api/requests
router.post("/", requireRole("requestor"), async (req, res) => {
  const user = req.user!;
  const body = req.body as {
    title: string;
    applicationName: string;
    applicationType: string;
    businessCriticality?: string;
    solutionArchitecture?: string;
    businessUnit?: string;
    organization?: string;
    lineOfBusiness: string;
    priority?: string;
    description: string;
    businessJustification: string;
    targetEnvironments: string[];
    azureRegions: string[];
    dtsltLeader?: string;
    sltLeader?: string;
    appComplexity?: string;
    existingAppName?: string;
    existingAppId?: string;
    existingAppPlatform?: string;
    existingAppCurrentHost?: string;
    existingAppUsers?: string;
    existingAppOwner?: string;
    existingAppDescription?: string;
    expectedUserBase?: string;
    targetGoLiveDate?: string;
    deploymentModel?: string;
    workloadTier?: string;
    haEnabled?: boolean;
    drEnabled?: boolean;
    businessOwner?: string;
    businessOwnerEmail?: string;
    itOwner?: string;
    technologyOwnerEmail?: string;
    applicationSupportManager?: string;
    infrastructureSupportManager?: string;
    requestorEmail?: string;
    glAccountOwnerEmail?: string;
    billingCompanyCode?: string;
    billingPlant?: string;
    billingCostObject?: string;
    billingGlAccount?: string;
    budgetTrackerReference?: string;
    categoryOwner?: string;
    networkPosture?: string;
    solution?: string;
    applicationArchitecture?: string;
    applicationFlow?: string;
    frontendStack?: string;
    backendStack?: string;
    databaseStack?: string;
    scalabilityRequirements?: string;
    availabilityTarget?: string;
    rto?: string;
    rpo?: string;
    // 3rd party fields
    vendorName?: string;
    appTechStack?: string;
    hostingPlatform?: string;
    vendorContactName?: string;
    vendorContactEmail?: string;
    commercialModel?: string;
    contractStartDate?: string;
    contractEndDate?: string;
    dataResidency?: string;
    supportModel?: string;
    integrationRequired?: boolean;
    integrationDescription?: string;
    securityAssessmentRequired?: boolean;
    thirdPartyBusinessOwner?: string;
    thirdPartyItOwner?: string;
    thirdPartyBillingCode?: string;
    thirdPartyGlAccount?: string;
    // Impact fields
    costTShirtSize?: string;
    inScopeRegions?: string[];
    securityImpact?: string;
    securityImpactDetails?: string;
    dataImpact?: string;
    dataImpactDetails?: string;
    integrationImpact?: string;
    integrationImpactDetails?: string;
    regulatoryImpact?: string;
    regulatoryImpactDetails?: string;
    aiImpact?: string;
    aiImpactDetails?: string;
  };

  const [row] = await db
    .insert(architectureRequestsTable)
    .values({
      title: body.title,
      applicationName: body.applicationName,
      applicationType: body.applicationType,
      businessUnit: body.organization ?? body.businessUnit ?? "",
      lineOfBusiness: body.lineOfBusiness,
      priority: body.priority ?? "Medium",
      description: body.description,
      businessJustification: body.businessJustification,
      targetEnvironments: body.targetEnvironments,
      azureRegions: body.azureRegions,
      dtsltLeader: body.sltLeader ?? body.dtsltLeader ?? null,
      expectedUserBase: body.expectedUserBase || null,
      targetGoLiveDate: body.targetGoLiveDate || null,
      deploymentModel: body.deploymentModel || "To be defined",
      tddFormData: {
        businessCriticality: body.businessCriticality ?? "",
        solutionArchitecture: body.solutionArchitecture ?? "",
        workloadTier: body.workloadTier ?? "Tier 2",
        haEnabled: body.haEnabled ?? false,
        drEnabled: body.drEnabled ?? false,
        businessOwner: body.businessOwner ?? "",
        businessOwnerEmail: body.businessOwnerEmail ?? "",
        itOwner: body.itOwner ?? "",
        technologyOwnerEmail: body.technologyOwnerEmail ?? "",
        applicationSupportManager: body.applicationSupportManager ?? "",
        infrastructureSupportManager: body.infrastructureSupportManager ?? "",
        requestorEmail: body.requestorEmail ?? user.email ?? "",
        glAccountOwnerEmail: body.glAccountOwnerEmail ?? "",
        billingCompanyCode: body.billingCompanyCode ?? "",
        billingPlant: body.billingPlant ?? "",
        billingCostObject: body.billingCostObject ?? "",
        billingGlAccount: body.billingGlAccount ?? "",
        budgetTrackerReference: body.budgetTrackerReference ?? "",
        categoryOwner: body.categoryOwner ?? "",
        networkPosture: body.networkPosture ?? "Internal",
        appComplexity: body.appComplexity ?? "",
        organization: body.organization ?? body.businessUnit ?? "",
        sltLeader: body.sltLeader ?? body.dtsltLeader ?? "",
        existingAppName: body.existingAppName ?? "",
        existingAppId: body.existingAppId ?? "",
        existingAppPlatform: body.existingAppPlatform ?? "",
        existingAppCurrentHost: body.existingAppCurrentHost ?? "",
        existingAppUsers: body.existingAppUsers ?? "",
        existingAppOwner: body.existingAppOwner ?? "",
        existingAppDescription: body.existingAppDescription ?? "",
        solution: body.solution ?? body.applicationName,
        applicationArchitecture: body.applicationArchitecture ?? "",
        applicationFlow: body.applicationFlow ?? "",
        frontendStack: body.frontendStack ?? "",
        backendStack: body.backendStack ?? "",
        databaseStack: body.databaseStack ?? "",
        scalabilityRequirements: body.scalabilityRequirements ?? "",
        availabilityTarget: body.availabilityTarget ?? "99.9%",
        rto: body.rto ?? "",
        rpo: body.rpo ?? "",
        // 3rd party
        vendorName: body.vendorName ?? "",
        appTechStack: body.appTechStack ?? "",
        hostingPlatform: body.hostingPlatform ?? "",
        vendorContactName: body.vendorContactName ?? "",
        vendorContactEmail: body.vendorContactEmail ?? "",
        commercialModel: body.commercialModel ?? "",
        contractStartDate: body.contractStartDate ?? "",
        contractEndDate: body.contractEndDate ?? "",
        dataResidency: body.dataResidency ?? "",
        supportModel: body.supportModel ?? "",
        integrationRequired: body.integrationRequired ?? false,
        integrationDescription: body.integrationDescription ?? "",
        securityAssessmentRequired: body.securityAssessmentRequired ?? false,
        thirdPartyBusinessOwner: body.thirdPartyBusinessOwner ?? "",
        thirdPartyItOwner: body.thirdPartyItOwner ?? "",
        thirdPartyBillingCode: body.thirdPartyBillingCode ?? "",
        thirdPartyGlAccount: body.thirdPartyGlAccount ?? "",
        // Impact assessment
        costTShirtSize: body.costTShirtSize ?? "",
        inScopeRegions: body.inScopeRegions ?? [],
        securityImpact: body.securityImpact ?? "",
        securityImpactDetails: body.securityImpactDetails ?? "",
        dataImpact: body.dataImpact ?? "",
        dataImpactDetails: body.dataImpactDetails ?? "",
        integrationImpact: body.integrationImpact ?? "",
        integrationImpactDetails: body.integrationImpactDetails ?? "",
        regulatoryImpact: body.regulatoryImpact ?? "",
        regulatoryImpactDetails: body.regulatoryImpactDetails ?? "",
        aiImpact: body.aiImpact ?? "",
        aiImpactDetails: body.aiImpactDetails ?? "",
      },
      requestorId: user.id,
      requestorName: user.name,
      requestorEmail: user.email,
      status: "submitted",
    })
    .returning();

  await logEvent(row.id, user.name, user.role, "submitted", `Request submitted by ${user.name}`);
  sendWebhookNotification(row.title, user.name, "submitted", row.id);

  // ── AI-driven routing: classify request complexity and route accordingly ──
  const aiResult = await classifyRequestWithAI({
    applicationType: body.applicationType,
    expectedUserBase: body.expectedUserBase,
    securityImpact: body.securityImpact,
    regulatoryImpact: body.regulatoryImpact,
    integrationImpact: body.integrationImpact,
    costTShirtSize: body.costTShirtSize,
  });

  await db
    .update(architectureRequestsTable)
    .set({ aiClassification: aiResult.classification, aiClassificationReason: aiResult.reason, updatedAt: new Date() })
    .where(eq(architectureRequestsTable.id, row.id));

  if (aiResult.classification === "simple") {
    const [approvedRow] = await db
      .update(architectureRequestsTable)
      .set({
        status: "ea_approved",
        eaReviewerName: "AI Auto-Classification",
        eaReviewedAt: new Date(),
        eaComments: `AI classified this as a simple request (${aiResult.confidence} confidence) and fast-tracked it to TDD. Reason: ${aiResult.reason}`,
        updatedAt: new Date(),
      })
      .where(eq(architectureRequestsTable.id, row.id))
      .returning();

    await logEvent(row.id, "AI System", "system", "ea_approved",
      `AI classified as Simple (${aiResult.confidence} confidence) — fast-tracked to TDD. ${aiResult.reason}`
    );
    sendWebhookNotification(row.title, "AI Auto-Classification", "ea_approved", row.id);

    res.status(201).json({ request: approvedRow, fastTrack: true, aiClassification: "simple", aiReason: aiResult.reason, aiConfidence: aiResult.confidence });
    return;
  }

  res.status(201).json({ request: row, fastTrack: false, aiClassification: "complex", aiReason: aiResult.reason, aiConfidence: aiResult.confidence });
});

// POST /api/requests/bulk-action — EA / admin only
router.post("/bulk-action", requireRole("enterprise_architect"), async (req, res) => {
  const user = req.user!;
  const { ids, action } = req.body as { ids?: number[]; action?: string };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array required" }); return;
  }
  if (!["approve", "triage"].includes(action ?? "")) {
    res.status(400).json({ error: "action must be 'approve' or 'triage'" }); return;
  }

  const newStatus = action === "approve" ? "ea_approved" : "ea_triage";
  const eventType = action === "approve" ? "ea_approved" : "ea_triage";
  const description = action === "approve"
    ? `Bulk approved by ${user.name}`
    : `Bulk moved to EA Triage by ${user.name}`;

  const updated: number[] = [];
  for (const id of ids) {
    const [row] = await db
      .select({ id: architectureRequestsTable.id, status: architectureRequestsTable.status })
      .from(architectureRequestsTable)
      .where(eq(architectureRequestsTable.id, id))
      .limit(1);
    if (!row) continue;
    const allowedStatuses = action === "approve" ? ["submitted", "ea_triage"] : ["submitted"];
    if (!allowedStatuses.includes(row.status)) continue;

    await db.update(architectureRequestsTable)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(architectureRequestsTable.id, id));
    await logEvent(id, user.name, user.role, eventType, description);
    updated.push(id);
  }

  res.json({ updated, skipped: ids.length - updated.length });
});

// GET /api/requests/:id
router.get("/:id", async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const [row] = await db
    .select()
    .from(architectureRequestsTable)
    .where(eq(architectureRequestsTable.id, id))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  // Log view events for EA/CA/admin — throttled to once per hour per user per request
  if (user.role !== "requestor") {
    const throttleKey = `${user.id}:${id}`;
    const lastViewed = viewThrottle.get(throttleKey) ?? 0;
    if (Date.now() - lastViewed > VIEW_THROTTLE_MS) {
      viewThrottle.set(throttleKey, Date.now());
      logEvent(id, user.name, user.role, "viewed", `Request viewed by ${user.name} (${user.role})`).catch(() => {});
    }
  }

  res.json({ request: row });
});

// DELETE /api/requests/:id — admin only
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Fetch before deleting so we can capture details in the audit log
  const [target] = await db.select().from(architectureRequestsTable).where(eq(architectureRequestsTable.id, id)).limit(1);
  if (!target) { res.status(404).json({ error: "Request not found" }); return; }

  // Log deletion event BEFORE removing the record — events are intentionally retained for audit
  await logEvent(id, user.name, user.role, "deleted",
    `Request permanently deleted by ${user.name}. Title: "${target.title}", Status at deletion: ${target.status}, Requestor: ${target.requestorName}`
  );

  // Delete the request only — events are preserved as a permanent audit trail
  const [deleted] = await db
    .delete(architectureRequestsTable)
    .where(eq(architectureRequestsTable.id, id))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Request not found" }); return; }
  res.json({ ok: true });
});

// GET /api/requests/events/recent — last 50 events across all requests visible to the user
router.get("/events/recent", async (req, res) => {
  const user = req.user!;
  const baseRequests = user.role === "requestor"
    ? await db.select({ id: architectureRequestsTable.id }).from(architectureRequestsTable).where(eq(architectureRequestsTable.requestorId, user.id))
    : await db.select({ id: architectureRequestsTable.id }).from(architectureRequestsTable);

  const requestIds = baseRequests.map((r) => r.id);
  if (requestIds.length === 0) { res.json({ events: [] }); return; }

  const events = await db
    .select({
      id: requestEventsTable.id,
      requestId: requestEventsTable.requestId,
      requestTitle: architectureRequestsTable.title,
      actorName: requestEventsTable.actorName,
      actorRole: requestEventsTable.actorRole,
      eventType: requestEventsTable.eventType,
      description: requestEventsTable.description,
      createdAt: requestEventsTable.createdAt,
    })
    .from(requestEventsTable)
    .innerJoin(architectureRequestsTable, eq(requestEventsTable.requestId, architectureRequestsTable.id))
    .where(inArray(requestEventsTable.requestId, requestIds))
    .orderBy(desc(requestEventsTable.createdAt))
    .limit(50);

  res.json({ events });
});

// GET /api/requests/:id/events
router.get("/:id/events", async (req, res) => {
  const id = parseRequestId(req.params.id);
  const events = await db
    .select()
    .from(requestEventsTable)
    .where(eq(requestEventsTable.requestId, id))
    .orderBy(requestEventsTable.createdAt);
  res.json({ events });
});

// POST /api/requests/:id/comment — any authenticated user
router.post("/:id/comment", async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { comment } = req.body as { comment?: string };
  if (!comment?.trim()) { res.status(400).json({ error: "Comment cannot be empty" }); return; }

  const existing = await db.select({ id: architectureRequestsTable.id })
    .from(architectureRequestsTable)
    .where(eq(architectureRequestsTable.id, id))
    .limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Request not found" }); return; }

  await logEvent(id, user.name, user.role, "comment", comment.trim());
  res.status(201).json({ ok: true });
});

// POST /api/requests/:id/clone — duplicate a request
router.post("/:id/clone", requireRole("requestor"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [source] = await db
    .select()
    .from(architectureRequestsTable)
    .where(eq(architectureRequestsTable.id, id))
    .limit(1);
  if (!source) { res.status(404).json({ error: "Source request not found" }); return; }

  const [clone] = await db
    .insert(architectureRequestsTable)
    .values({
      title: `${source.title} (Copy)`,
      applicationName: source.applicationName,
      applicationType: source.applicationType,
      businessUnit: source.businessUnit,
      lineOfBusiness: source.lineOfBusiness,
      priority: source.priority,
      description: source.description,
      businessJustification: source.businessJustification,
      targetEnvironments: source.targetEnvironments,
      azureRegions: source.azureRegions,
      dtsltLeader: source.dtsltLeader,
      expectedUserBase: source.expectedUserBase,
      targetGoLiveDate: source.targetGoLiveDate,
      deploymentModel: source.deploymentModel,
      tddFormData: source.tddFormData,
      requestorId: user.id,
      requestorName: user.name,
      requestorEmail: user.email,
      status: "submitted",
    })
    .returning();

  await logEvent(clone.id, user.name, user.role, "submitted", `Cloned from ARR #${id} by ${user.name}`);
  sendWebhookNotification(clone.title, user.name, "submitted", clone.id);

  res.status(201).json({ request: clone });
});

// PATCH /api/requests/:id/review
router.patch("/:id/review", requireRole("enterprise_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const { action, comments } = req.body as { action: "approve" | "reject"; comments?: string };

  if (!["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }

  const newStatus = action === "approve" ? "ea_approved" : "ea_rejected";

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: newStatus,
      eaReviewerId: user.id,
      eaReviewerName: user.name,
      eaReviewedAt: new Date(),
      eaComments: comments ?? null,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  const desc = action === "approve"
    ? `Approved by ${user.name}${comments ? ` — "${comments}"` : ""}`
    : `Rejected by ${user.name}${comments ? ` — "${comments}"` : ""}`;
  await logEvent(id, user.name, user.role, action === "approve" ? "ea_approved" : "ea_rejected", desc);
  sendWebhookNotification(row.title, user.name, newStatus, id);

  res.json({ request: row });
});

// PATCH /api/requests/:id/triage
router.patch("/:id/triage", requireRole("enterprise_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: "ea_triage",
      eaReviewerId: user.id,
      eaReviewerName: user.name,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  await logEvent(id, user.name, user.role, "ea_triage", `Moved to EA Triage by ${user.name}`);
  sendWebhookNotification(row.title, user.name, "ea_triage", id);
  res.json({ request: row });
});

// PATCH /api/requests/:id/request-modification  (EA only)
router.patch("/:id/request-modification", requireRole("enterprise_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const { notes } = req.body as { notes?: string };

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: "modification_requested",
      eaReviewerId: user.id,
      eaReviewerName: user.name,
      eaComments: notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  await logEvent(id, user.name, user.role, "modification_requested",
    `Changes requested by ${user.name}${notes?.trim() ? ` — "${notes.trim()}"` : ""}`);
  sendWebhookNotification(row.title, user.name, "modification_requested", id);
  res.json({ request: row });
});

// PATCH /api/requests/:id/resubmit  (requestor / owner only)
router.patch("/:id/resubmit", async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const { note } = req.body as { note?: string };

  const existing = await db.query.architectureRequestsTable.findFirst({
    where: eq(architectureRequestsTable.id, id),
  });
  if (!existing) { res.status(404).json({ error: "Request not found" }); return; }
  if (existing.requestorId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (existing.status !== "modification_requested") {
    res.status(400).json({ error: "Request is not pending modification" }); return;
  }

  const [row] = await db
    .update(architectureRequestsTable)
    .set({ status: "submitted", eaComments: null, updatedAt: new Date() })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  await logEvent(id, user.name, user.role, "submitted",
    `Resubmitted by ${user.name}${note?.trim() ? ` — "${note.trim()}"` : ""}`);
  sendWebhookNotification(row.title, user.name, "submitted", id);
  res.json({ request: row });
});

// PATCH /api/requests/:id/risk-review
router.patch("/:id/risk-review", requireRole("cloud_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const { action, comments } = req.body as { action: "approve" | "reject"; comments?: string };

  if (!["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }

  const newStatus = action === "approve" ? "risk_approved" : "risk_rejected";

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: newStatus,
      riskReviewerId: user.id,
      riskReviewerName: user.name,
      riskReviewedAt: new Date(),
      riskComments: comments ?? null,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  const logDesc = action === "approve"
    ? `Risk Analysis approved by ${user.name}${comments ? ` — "${comments}"` : ""}`
    : `Risk Analysis rejected by ${user.name}${comments ? ` — "${comments}"` : ""}`;
  await logEvent(id, user.name, user.role, action === "approve" ? "risk_approved" : "risk_rejected", logDesc);
  sendWebhookNotification(row.title, user.name, newStatus, id);

  res.json({ request: row });
});

// PATCH /api/requests/:id/devsecops-review
router.patch("/:id/devsecops-review", requireRole("cloud_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const { action, comments } = req.body as { action: "approve" | "reject"; comments?: string };

  if (!["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }

  const newStatus = action === "approve" ? "devsecops_approved" : "devsecops_rejected";

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: newStatus,
      devsecopsApproverId: user.id,
      devsecopsApproverName: user.name,
      devsecopsApprovedAt: new Date(),
      devsecopsComments: comments ?? null,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  const logDesc = action === "approve"
    ? `DevSecOps deployment approved by ${user.name}${comments ? ` — "${comments}"` : ""}`
    : `DevSecOps deployment rejected by ${user.name}${comments ? ` — "${comments}"` : ""}`;
  await logEvent(id, user.name, user.role, action === "approve" ? "devsecops_approved" : "devsecops_rejected", logDesc);
  sendWebhookNotification(row.title, user.name, newStatus, id);

  res.json({ request: row });
});

// PATCH /api/requests/:id/observability-complete
router.patch("/:id/observability-complete", requireRole("cloud_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const { comments } = req.body as { comments?: string };

  const existing = await db.query.architectureRequestsTable.findFirst({ where: eq(architectureRequestsTable.id, id) });
  if (!existing) { res.status(404).json({ error: "Request not found" }); return; }
  if (existing.status !== "devsecops_approved") {
    res.status(400).json({ error: `Cannot complete Observability from status: ${existing.status}` });
    return;
  }

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: "observability_approved",
      observabilityReviewerName: user.name,
      observabilityReviewedAt: new Date(),
      observabilityComments: comments ?? null,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  await logEvent(id, user.name, user.role, "observability_approved",
    `Observability setup confirmed by ${user.name}${comments ? ` — "${comments}"` : ""}`);
  sendWebhookNotification(existing.title, user.name, "observability_approved", id);
  res.json({ request: row });
});

// PATCH /api/requests/:id/finops-activate
router.patch("/:id/finops-activate", requireRole("enterprise_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);

  const existing = await db.query.architectureRequestsTable.findFirst({ where: eq(architectureRequestsTable.id, id) });
  if (!existing) { res.status(404).json({ error: "Request not found" }); return; }

  const isCloudTenant = existing.deploymentModel === "Cloud (McCain Tenant)";
  const validFromStatus = isCloudTenant
    ? ["observability_approved"]
    : ["ea_approved", "vendor_active"];

  if (!validFromStatus.includes(existing.status)) {
    res.status(400).json({ error: `Cannot activate FinOps from status: ${existing.status}` });
    return;
  }

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: "finops_active",
      finopsActivatedAt: new Date(),
      finopsActivatedBy: user.name,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  await logEvent(id, user.name, user.role, "finops_active", `FinOps monitoring activated by ${user.name}`);
  sendWebhookNotification(existing.title, user.name, "finops_active", id);
  res.json({ request: row });
});

// PATCH /api/requests/:id/start-tdd
router.patch("/:id/start-tdd", requireRole("cloud_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const { environmentCidrs } = req.body as { environmentCidrs?: Record<string, string> };

  const [existing] = await db
    .select()
    .from(architectureRequestsTable)
    .where(eq(architectureRequestsTable.id, id))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Request not found" }); return; }

  const mergedFormData = {
    ...(existing.tddFormData as Record<string, unknown> ?? {}),
    ...(environmentCidrs ? { environmentCidrs } : {}),
  };

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: "tdd_in_progress",
      caAssigneeId: user.id,
      caAssigneeName: user.name,
      tddFormData: mergedFormData,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  await logEvent(id, user.name, user.role, "tdd_started", `TDD generation started by ${user.name}`);
  sendWebhookNotification(existing.title, user.name, "tdd_in_progress", id);
  res.json({ request: row });
});

// PATCH /api/requests/:id/complete-tdd
router.patch("/:id/complete-tdd", requireRole("cloud_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  const { tddSubmissionId, reviewNotes } = req.body as { tddSubmissionId?: number; reviewNotes?: string | null };

  const [existing] = await db
    .select()
    .from(architectureRequestsTable)
    .where(eq(architectureRequestsTable.id, id))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Request not found" }); return; }

  const mergedFormData = {
    ...(existing.tddFormData as Record<string, unknown> ?? {}),
    reviewedBy: user.name,
    reviewedAt: new Date().toISOString(),
    ...(reviewNotes != null ? { reviewNotes } : {}),
  };

  const [row] = await db
    .update(architectureRequestsTable)
    .set({
      status: "tdd_completed",
      tddSubmissionId: tddSubmissionId ?? null,
      tddFormData: mergedFormData,
      updatedAt: new Date(),
    })
    .where(eq(architectureRequestsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  await logEvent(id, user.name, user.role, "tdd_completed", `TDD reviewed and completed by ${user.name}`);
  sendWebhookNotification(existing.title, user.name, "tdd_completed", id);
  res.json({ request: row });
});

// POST /api/requests/:id/audit-report — generate and download server-side audit report
router.post("/:id/audit-report", async (req, res) => {
  const user = req.user!;
  const id = parseRequestId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(architectureRequestsTable).where(eq(architectureRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const events = await db
    .select()
    .from(requestEventsTable)
    .where(eq(requestEventsTable.requestId, id))
    .orderBy(requestEventsTable.createdAt);

  // Log the download itself as an auditable action
  await logEvent(id, user.name, user.role, "audit_report_downloaded",
    `Audit report downloaded by ${user.name} (${user.role})`
  );

  const sep = "=".repeat(60);
  const lines = [
    `MCCAIN FOODS — ARCHITECTURE REQUEST AUDIT REPORT`,
    sep,
    `Request #${request.id}: ${request.title}`,
    `Application: ${request.applicationName}`,
    `Type: ${request.applicationType}`,
    `Deployment Model: ${request.deploymentModel}`,
    `Status: ${request.status}`,
    `Requestor: ${request.requestorName} (${request.requestorEmail})`,
    `Submitted: ${new Date(request.createdAt).toISOString()}`,
    `Last Updated: ${new Date(request.updatedAt).toISOString()}`,
    ``,
    `Report Generated: ${new Date().toISOString()}`,
    `Generated By: ${user.name} (${user.role})`,
    ``,
    `AUDIT TRAIL (${events.length} events)`,
    sep,
    ...events.map((e) =>
      `[${new Date(e.createdAt).toISOString()}] ${e.eventType.toUpperCase()}\n` +
      `  Actor: ${e.actorName} (${e.actorRole})\n` +
      `  Detail: ${e.description}`
    ),
    ``,
    sep,
    `McCain CCoE Portal — Confidential — Do not distribute`,
  ];

  const content = lines.join("\n");
  const filename = `mccain-architecture-request-${id}-audit-${new Date().toISOString().slice(0, 10)}.txt`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(content);
});

export default router;
