import { pgTable, text, serial, timestamp, integer, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const architectureRequestsTable = pgTable("architecture_requests", {
  id: serial("id").primaryKey(),

  // Basic request info
  title: text("title").notNull(),
  applicationName: text("application_name").notNull(),
  applicationType: text("application_type").notNull(), // Migration | Greenfield | Enhancement
  businessUnit: text("business_unit").notNull(),
  lineOfBusiness: text("line_of_business").notNull(),
  priority: text("priority").notNull().default("Medium"), // Low | Medium | High | Critical
  description: text("description").notNull(),
  businessJustification: text("business_justification").notNull(),
  targetEnvironments: text("target_environments").array().notNull(),
  azureRegions: text("azure_regions").array().notNull(),

  // Project Overview – extended fields
  dtsltLeader: text("dtslt_leader"),
  expectedUserBase: text("expected_user_base"),
  targetGoLiveDate: date("target_go_live_date"),
  deploymentModel: text("deployment_model").default("To be defined"),

  // Requestor info
  requestorId: integer("requestor_id").notNull(),
  requestorName: text("requestor_name").notNull(),
  requestorEmail: text("requestor_email").notNull(),

  // Status lifecycle:
  // submitted → ea_triage → ea_approved | ea_rejected
  //   → cab_in_progress → cab_completed (status values unchanged for DB compat)
  //     → devsecops_approved | devsecops_rejected
  //       → observability_approved
  //         → finops_active
  status: text("status").notNull().default("submitted"),

  // Phase 1 — EA & Architecture Review
  eaReviewerId: integer("ea_reviewer_id"),
  eaReviewerName: text("ea_reviewer_name"),
  eaReviewedAt: timestamp("ea_reviewed_at"),
  eaComments: text("ea_comments"),

  // Phase 2 — Risk Analysis (Security Architect sign-off)
  riskReviewerId: integer("risk_reviewer_id"),
  riskReviewerName: text("risk_reviewer_name"),
  riskReviewedAt: timestamp("risk_reviewed_at"),
  riskComments: text("risk_comments"),

  // Phase 3 — Cloud Architect / CAB
  caAssigneeId: integer("ca_assignee_id"),
  caAssigneeName: text("ca_assignee_name"),
  cabSubmissionId: integer("cab_submission_id"),

  // Phase 4 — DevSecOps / IaC
  devsecopsApproverId: integer("devsecops_approver_id"),
  devsecopsApproverName: text("devsecops_approver_name"),
  devsecopsApprovedAt: timestamp("devsecops_approved_at"),
  devsecopsComments: text("devsecops_comments"),

  // Phase 5 — Observability
  observabilityReviewerName: text("observability_reviewer_name"),
  observabilityReviewedAt: timestamp("observability_reviewed_at"),
  observabilityComments: text("observability_comments"),

  // Phase 6 — FinOps
  finopsActivatedAt: timestamp("finops_activated_at"),
  finopsActivatedBy: text("finops_activated_by"),

  // Partial form data pre-fill for CAB wizard (populated from request on approval)
  cabFormData: jsonb("cab_form_data"),

  // AI-driven routing classification set at submission time
  aiClassification: text("ai_classification"),       // 'simple' | 'complex'
  aiClassificationReason: text("ai_classification_reason"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertArchitectureRequestSchema = createInsertSchema(architectureRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  eaReviewerId: true,
  eaReviewerName: true,
  eaReviewedAt: true,
  eaComments: true,
  riskReviewerId: true,
  riskReviewerName: true,
  riskReviewedAt: true,
  riskComments: true,
  caAssigneeId: true,
  caAssigneeName: true,
  cabSubmissionId: true,
  devsecopsApproverId: true,
  devsecopsApproverName: true,
  devsecopsApprovedAt: true,
  devsecopsComments: true,
  finopsActivatedAt: true,
  finopsActivatedBy: true,
  cabFormData: true,
  status: true,
});

export type InsertArchitectureRequest = z.infer<typeof insertArchitectureRequestSchema>;
export type ArchitectureRequest = typeof architectureRequestsTable.$inferSelect;
export type RequestStatus =
  | "submitted"
  | "ea_triage"
  | "ea_approved"
  | "ea_rejected"
  | "modification_requested"
  | "cab_in_progress"
  | "cab_completed"
  | "devsecops_approved"
  | "devsecops_rejected"
  | "observability_approved"
  | "finops_active"
  | "cancelled";
