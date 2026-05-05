import { Router } from "express";
import { db } from "@workspace/db";
import { architectureRequestsTable, requestEventsTable, portalSettingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/authenticate.js";

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

  // ── Simple App Fast-Track: auto-approve immediately on submit ────────────
  const isSimpleApp =
    body.deploymentModel === "Cloud (McCain Tenant)" &&
    body.appComplexity === "Simple";

  if (isSimpleApp) {
    const [approvedRow] = await db
      .update(architectureRequestsTable)
      .set({
        status: "ea_approved",
        eaReviewerName: "System (Auto-Approved)",
        eaReviewedAt: new Date(),
        eaComments: "Simple application — automatically approved via fast-track. TDD will be auto-generated once network CIDRs are entered.",
        updatedAt: new Date(),
      })
      .where(eq(architectureRequestsTable.id, row.id))
      .returning();

    await logEvent(
      row.id,
      "System",
      "system",
      "ea_approved",
      "Simple application fast-tracked: automatically approved by system. TDD generation is ready to begin."
    );
    sendWebhookNotification(row.title, "System (Fast-Track)", "ea_approved", row.id);

    res.status(201).json({ request: approvedRow, fastTrack: true });
    return;
  }

  res.status(201).json({ request: row });
});

// GET /api/requests/:id
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [row] = await db
    .select()
    .from(architectureRequestsTable)
    .where(eq(architectureRequestsTable.id, id))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Request not found" }); return; }
  res.json({ request: row });
});

// DELETE /api/requests/:id — admin only
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(requestEventsTable).where(eq(requestEventsTable.requestId, id));
  const [deleted] = await db
    .delete(architectureRequestsTable)
    .where(eq(architectureRequestsTable.id, id))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Request not found" }); return; }
  res.json({ ok: true });
});

// GET /api/requests/:id/events
router.get("/:id/events", async (req, res) => {
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
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
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

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
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);

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
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
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

// PATCH /api/requests/:id/finops-activate
router.patch("/:id/finops-activate", requireRole("enterprise_architect"), async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id, 10);

  const existing = await db.query.architectureRequestsTable.findFirst({ where: eq(architectureRequestsTable.id, id) });
  if (!existing) { res.status(404).json({ error: "Request not found" }); return; }

  const isCloudTenant = existing.deploymentModel === "Cloud (McCain Tenant)";
  const validFromStatus = isCloudTenant
    ? ["devsecops_approved"]
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
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
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

export default router;
