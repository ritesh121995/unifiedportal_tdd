import { useEffect, useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Clock, MessageSquare,
  Cloud, FileText, Calendar, User, Building2, AlertTriangle, Info,
  Send, ShieldCheck, ShieldX, Play, Flag, Network,
  Code2, DollarSign, Rocket, Trash2, RefreshCw, PenLine, Copy, Check, Download, Cpu, Activity,
} from "lucide-react";
import AzureServiceSelector, { detectServicesFromTdd } from "@/components/AzureServiceSelector";
import { generateMultiServiceTerraform } from "@/lib/terraformGenerator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/store/auth-context";
import { useAppContext, type FormDraft } from "@/store/app-context";
import { getApiBase } from "@/lib/api-base";
import { StatusBadge, type RequestStatus } from "@/components/RequestStatusBadge";
import { computeArchitectRecommendations, computeRisksAndInsights, computeArchitecturePattern, type FormSnapshot } from "@/lib/architect-utils";

interface StoredCabFormData {
  workflowType?: string;         // 'sandbox' | 'development' | 'standard'
  businessCriticality?: string;
  solutionArchitecture?: string;
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
  billingCostCenter?: string;
  billingCostObject?: string;
  billingGlAccount?: string;
  budgetTrackerReference?: string;
  categoryOwner?: string;
  networkPosture?: string;
  solution?: string;
  organization?: string;
  lineOfBusiness?: string;
  appComplexity?: string;
  applicationArchitecture?: string;
  applicationFlow?: string;
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
  scalabilityRequirements?: string;
  availabilityTarget?: string;
  rto?: string;
  rpo?: string;
  environmentCidrs?: Record<string, string>;
  // Impact assessment fields (stored in cabFormData JSON blob)
  securityImpact?: string;
  dataImpact?: string;
  integrationImpact?: string;
  regulatoryImpact?: string;
  aiImpact?: string;
  costTShirtSize?: string;
  businessValueHypothesis?: string[];
  integrationRequired?: boolean;
  securityAssessmentRequired?: boolean;
}

function toRequestNumber(id: number, createdAt: string): string {
  const year = new Date(createdAt).getFullYear();
  return `MCN-${year}-${id.toString().padStart(4, "0")}`;
}

/** Map any display-label variant → the canonical API enum value */
function normalizeNetworkPosture(raw: string | undefined): FormDraft["networkPosture"] {
  const map: Record<string, FormDraft["networkPosture"]> = {
    "Internal":                      "Internal-Only",
    "Internal-Only":                 "Internal-Only",
    "External":                      "Internet-Facing",
    "Internet-Facing":               "Internet-Facing",
    "Hybrid (Internal & External)":  "Hybrid",
    "Hybrid":                        "Hybrid",
  };
  return map[raw ?? ""] ?? "Internal-Only";
}

interface ArchitectureRequest {
  id: number;
  title: string;
  applicationName: string;
  applicationType: string;
  businessUnit: string;
  lineOfBusiness: string;
  priority: string;
  description: string;
  businessJustification: string;
  targetEnvironments: string[];
  azureRegions: string[];
  dtsltLeader: string | null;
  expectedUserBase: string | null;
  targetGoLiveDate: string | null;
  deploymentModel: string | null;
  requestorId: number;
  requestorName: string;
  requestorEmail: string;
  status: RequestStatus;
  // Phase 1
  eaReviewerName: string | null;
  eaReviewedAt: string | null;
  eaComments: string | null;
  // Phase 2
  riskReviewerName: string | null;
  riskReviewedAt: string | null;
  riskComments: string | null;
  // Phase 3
  caAssigneeName: string | null;
  cabSubmissionId: number | null;
  // Phase 4
  devsecopsApproverName: string | null;
  devsecopsApprovedAt: string | null;
  devsecopsComments: string | null;
  // Phase 5
  observabilityReviewerName: string | null;
  observabilityReviewedAt: string | null;
  observabilityComments: string | null;
  // Phase 6
  finopsActivatedAt: string | null;
  finopsActivatedBy: string | null;
  cabFormData: StoredCabFormData | null;
  aiClassification: string | null;
  aiClassificationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RequestEvent {
  id: number;
  requestId: number;
  actorName: string;
  actorRole: string;
  eventType: string;
  description: string;
  createdAt: string;
}

const CA_REVIEW_CHECKLIST = [
  "Design document reviewed and technically accurate",
  "Checkov policy scans completed — no critical violations",
  "Terraform IaC peer-reviewed by a second Cloud Architect",
  "QA environment deployment verified and tested",
  "STG environment deployment verified and tested",
  "PRD deployment plan confirmed with change management",
  "Network Security Groups and firewall rules validated",
  "Identity & Access Management roles reviewed (RBAC/ABAC)",
  "Backup and DR configuration confirmed per RTO/RPO requirements",
  "Cost estimate and tagging policy reviewed with Cost Management",
];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "text-red-600",
  High: "text-orange-600",
  Medium: "text-yellow-600",
  Low: "text-slate-500",
};

const EVENT_ICONS: Record<string, React.ElementType> = {
  submitted:                Send,
  ea_triage:                Clock,
  ea_approved:              ShieldCheck,
  ea_rejected:              ShieldX,
  modification_requested:   AlertTriangle,
  risk_approved:            ShieldCheck,
  risk_rejected:            ShieldX,
  cab_started:              Play,
  cab_completed:            Flag,
  devsecops_approved:       Code2,
  devsecops_rejected:       ShieldX,
  finops_active:            DollarSign,
  comment:                  MessageSquare,
  viewed:                   Info,
  deleted:                  Trash2,
  audit_report_downloaded:  Download,
  admin_user_created:       User,
  admin_user_updated:       User,
  admin_user_deleted:       Trash2,
  delegation_created:       Network,
  delegation_revoked:       ShieldX,
};

const EVENT_COLORS: Record<string, string> = {
  submitted:                "bg-yellow-100 text-yellow-600 border-yellow-200",
  ea_triage:                "bg-orange-100 text-orange-600 border-orange-200",
  ea_approved:              "bg-green-100 text-green-600 border-green-200",
  ea_rejected:              "bg-red-100 text-red-600 border-red-200",
  modification_requested:   "bg-amber-100 text-amber-600 border-amber-200",
  risk_approved:            "bg-teal-100 text-teal-600 border-teal-200",
  risk_rejected:            "bg-red-100 text-red-600 border-red-200",
  cab_started:              "bg-blue-100 text-blue-600 border-blue-200",
  cab_completed:            "bg-purple-100 text-purple-600 border-purple-200",
  devsecops_approved:       "bg-indigo-100 text-indigo-600 border-indigo-200",
  devsecops_rejected:       "bg-red-100 text-red-600 border-red-200",
  finops_active:            "bg-emerald-100 text-emerald-600 border-emerald-200",
  comment:                  "bg-slate-100 text-slate-500 border-slate-200",
  viewed:                   "bg-slate-100 text-slate-400 border-slate-200",
  deleted:                  "bg-red-100 text-red-600 border-red-200",
  audit_report_downloaded:  "bg-blue-50 text-blue-500 border-blue-200",
  admin_user_created:       "bg-green-100 text-green-600 border-green-200",
  admin_user_updated:       "bg-blue-100 text-blue-600 border-blue-200",
  admin_user_deleted:       "bg-red-100 text-red-600 border-red-200",
  delegation_created:       "bg-violet-100 text-violet-600 border-violet-200",
  delegation_revoked:       "bg-orange-100 text-orange-600 border-orange-200",
};

function getRiskSeverityClass(severity: "high" | "medium" | "info"): string {
  if (severity === "high") {
    return "border-red-200 bg-red-50";
  }
  if (severity === "medium") {
    return "border-amber-200 bg-amber-50";
  }
  return "border-blue-200 bg-blue-50";
}

function getRiskIconClass(severity: "high" | "medium" | "info"): string {
  if (severity === "high") {
    return "text-red-500";
  }
  if (severity === "medium") {
    return "text-amber-500";
  }
  return "text-blue-500";
}

function buildApprovalRiskSummary(risks: ReturnType<typeof computeRisksAndInsights>): string {
  if (risks.length === 0) {
    return "Risk review: no automated risk flags identified.";
  }

  const highCount = risks.filter((risk) => risk.severity === "high").length;
  const mediumCount = risks.filter((risk) => risk.severity === "medium").length;
  const topRisks = risks
    .filter((risk) => risk.severity !== "info")
    .slice(0, 3)
    .map((risk) => risk.title)
    .join("; ");

  const riskCounts = `${highCount} high, ${mediumCount} medium`;
  return topRisks
    ? `Risk review: ${riskCounts} risk flags reviewed. Key items: ${topRisks}.`
    : `Risk review: ${riskCounts} risk flags reviewed.`;
}

function ActivityTimeline({ events }: { events: RequestEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ol className="relative border-l border-slate-200 space-y-5 ml-2">
      {events.map((ev) => {
        const Icon = EVENT_ICONS[ev.eventType] ?? Clock;
        const colorClass = EVENT_COLORS[ev.eventType] ?? "bg-slate-100 text-slate-600 border-slate-200";
        const isComment = ev.eventType === "comment";
        return (
          <li key={ev.id} className="ml-5">
            <span className={`absolute -left-3.5 flex items-center justify-center w-7 h-7 rounded-full border-2 border-white ${colorClass}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div>
              {isComment ? (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-medium text-slate-500 mb-1">{ev.actorName} <span className="font-normal">commented</span></p>
                  <p className="text-sm text-slate-800">{ev.description}</p>
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-800">{ev.description}</p>
              )}
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(ev.createdAt).toLocaleString()}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function parseTerraformResources(hcl: string): { type: string; name: string }[] {
  const matches = [...hcl.matchAll(/^resource\s+"([^"]+)"\s+"([^"]+)"/gm)];
  return matches.map((m) => ({ type: m[1]!, name: m[2]! }));
}


interface IacDeployStatus {
  id: number;
  status: string;
  resource_group: string;
  app_name: string;
  region: string;
  error_message?: string | null;
}

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { setFormData } = useAppContext();
  const [, setLocation] = useLocation();
  const [request, setRequest] = useState<ArchitectureRequest | null>(null);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [eaComments, setEaComments] = useState("");
  const [devsecopsComments, setDevsecopsComments] = useState("");
  const [obsComments, setObsComments] = useState("");
  const [obsChecks, setObsChecks] = useState<string[]>([]);
  const [domainArchsConsulted, setDomainArchsConsulted] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [cloningRequest, setCloningRequest] = useState(false);

  // Phase 3 IaC state
  const [iacCabContent, setIacTddContent] = useState("");
  const [iacCabLoading, setIacTddLoading] = useState(false);
  const [iacCabError, setIacTddError] = useState<string | null>(null);
  const [iacSelectedServices, setIacSelectedServices] = useState<string[]>([]);
  const [iacDeployFormOpen, setIacDeployFormOpen] = useState(false);
  const [iacDeployPassword, setIacDeployPassword] = useState("");
  const [iacDeployRdpSource, setIacDeployRdpSource] = useState("");
  const [iacDeployLoading, setIacDeployLoading] = useState(false);
  const [iacDeploymentId, setIacDeploymentId] = useState<number | null>(null);
  const [iacDeployment, setIacDeployment] = useState<IacDeployStatus | null>(null);
  const [iacDeployError, setIacDeployError] = useState<string | null>(null);
  const [iacCopied, setIacCopied] = useState(false);
  const [iacShowPlan, setIacShowPlan] = useState(false);
  const [caReviewChecks, setCaReviewChecks] = useState<string[]>([]);

  // Network CIDR state — keyed by environment name
  const DEFAULT_CIDRS: Record<string, string> = {
    Dev:       "10.10.1.0/24",
    "QA/UAT":  "10.10.2.0/24",
    QA:        "10.10.2.0/24",
    UAT:       "10.10.3.0/24",
    Prod:      "10.10.0.0/24",
    Staging:   "10.10.4.0/24",
  };
  const [cidrs, setCidrs] = useState<Record<string, string>>({});

  // Request-modification state (EA → requestor flow)
  const [showModificationInput, setShowModificationInput] = useState(false);
  const [modificationNotes, setModificationNotes] = useState("");
  const [resubmitNote, setResubmitNote] = useState("");

  useEffect(() => {
    const base = getApiBase();
    Promise.all([
      fetch(`${base}/api/requests/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${base}/api/requests/${id}/events`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([reqData, evtData]) => {
      const req = reqData.request;
      setRequest(req);
      setEaComments(req?.eaComments ?? "");
      setEvents(evtData.events ?? []);
      // Pre-populate CIDRs: prefer saved values, fall back to defaults per environment
      const saved = req?.cabFormData?.environmentCidrs;
      if (saved && typeof saved === "object" && Object.keys(saved).length > 0) {
        setCidrs(saved as Record<string, string>);
      } else {
        const envs: string[] = req?.targetEnvironments ?? [];
        const auto: Record<string, string> = {};
        envs.forEach((e) => {
          auto[e] = DEFAULT_CIDRS[e] ?? "10.10.10.0/24";
        });
        if (Object.keys(auto).length > 0) setCidrs(auto);
      }
      // Auto-pre-select domain architect checkboxes only if EA hasn't reviewed yet
      if (req && ["submitted", "ea_triage"].includes(req.status) && req.cabFormData) {
        const snap: FormSnapshot = {
          deploymentModel:          req.deploymentModel          ?? "",
          networkPosture:           req.cabFormData?.networkPosture           ?? "",
          securityImpact:           req.cabFormData?.securityImpact           ?? "",
          dataImpact:               req.cabFormData?.dataImpact               ?? "",
          integrationImpact:        req.cabFormData?.integrationImpact        ?? "",
          regulatoryImpact:         req.cabFormData?.regulatoryImpact         ?? "",
          aiImpact:                 req.cabFormData?.aiImpact                 ?? "",
          haEnabled:                req.cabFormData?.haEnabled                ?? false,
          drEnabled:                req.cabFormData?.drEnabled                ?? false,
          securityAssessmentRequired: req.cabFormData?.securityAssessmentRequired ?? false,
          integrationRequired:      req.cabFormData?.integrationRequired      ?? false,
          costTShirtSize:           req.cabFormData?.costTShirtSize           ?? "",
          businessCriticality:      req.cabFormData?.businessCriticality      ?? "",
          applicationType:          req.applicationType                       ?? "",
        };
        const recs = computeArchitectRecommendations(snap);
        const domainMap: Record<string, string> = {
          "Cloud Architect": "Cloud Architect",
          "Security Architect": "Security Architect",
          "Network Architect": "Network Architect",
          "Infrastructure Architect": "Infra Architect",
        };
        const suggested = recs
          .filter((r) => r.required && domainMap[r.role])
          .map((r) => domainMap[r.role]);
        if (suggested.length > 0) setDomainArchsConsulted(suggested);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  // After data loads, scroll to the section referenced in the URL hash (e.g. #devsecops-section)
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }, [loading]);

  // Load CAB content when the request is in cab_completed status (needed for Phase 3 IaC)
  useEffect(() => {
    if (!request || request.status !== "cab_completed" || !request.cabSubmissionId) return;
    setIacTddLoading(true);
    setIacTddError(null);
    fetch(`${getApiBase()}/api/cab/submissions/${request.cabSubmissionId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { submission?: { generatedContent?: string }; error?: string }) => {
        if (!d.submission) throw new Error(d.error ?? "CAB not found");
        const txt = d.submission.generatedContent ?? "";
        setIacTddContent(txt);
        const detected = detectServicesFromTdd(txt);
        if (detected.length > 0) setIacSelectedServices(detected);
      })
      .catch((err: unknown) => setIacTddError(err instanceof Error ? err.message : "Failed to load CAB"))
      .finally(() => setIacTddLoading(false));
  }, [request?.cabSubmissionId, request?.status]);

  // Poll deployment status in Phase 3
  useEffect(() => {
    if (!iacDeploymentId) return;
    const poll = setInterval(() => {
      void fetch(`${getApiBase()}/api/iac/deploy/${iacDeploymentId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d: { deployment?: IacDeployStatus }) => {
          if (d.deployment) {
            setIacDeployment(d.deployment);
            if (d.deployment.status === "succeeded" || d.deployment.status === "failed") {
              clearInterval(poll);
            }
          }
        });
    }, 5000);
    return () => clearInterval(poll);
  }, [iacDeploymentId]);

  // Compute architect team + risk panels from submitted form data
  const formSnapshot = useMemo((): FormSnapshot | null => {
    if (!request) return null;
    return {
      deploymentModel:            request.deploymentModel                        ?? "",
      networkPosture:             request.cabFormData?.networkPosture            ?? "",
      securityImpact:             request.cabFormData?.securityImpact            ?? "",
      dataImpact:                 request.cabFormData?.dataImpact                ?? "",
      integrationImpact:          request.cabFormData?.integrationImpact         ?? "",
      regulatoryImpact:           request.cabFormData?.regulatoryImpact          ?? "",
      aiImpact:                   request.cabFormData?.aiImpact                  ?? "",
      haEnabled:                  request.cabFormData?.haEnabled                 ?? false,
      drEnabled:                  request.cabFormData?.drEnabled                 ?? false,
      securityAssessmentRequired: request.cabFormData?.securityAssessmentRequired ?? false,
      integrationRequired:        request.cabFormData?.integrationRequired        ?? false,
      costTShirtSize:             request.cabFormData?.costTShirtSize             ?? "",
      businessCriticality:        request.cabFormData?.businessCriticality        ?? "",
      applicationType:            request.applicationType                         ?? "",
    };
  }, [request]);

  const architectRecs     = useMemo(() => formSnapshot ? computeArchitectRecommendations(formSnapshot) : [], [formSnapshot]);
  const riskInsights      = useMemo(() => formSnapshot ? computeRisksAndInsights(formSnapshot)         : [], [formSnapshot]);
  const architecturePattern = useMemo(() => formSnapshot ? computeArchitecturePattern(formSnapshot)    : null,  [formSnapshot]);

  // Minimal FormDraft for Terraform generation in Phase 3
  const iacFormDraft = useMemo((): FormDraft => ({
    applicationName: request?.applicationName ?? "mccain-app",
    azureRegions: request?.azureRegions ?? ["canadacentral"],
    lineOfBusiness: request?.lineOfBusiness ?? "",
    organization: request?.businessUnit ?? "",
  }), [request]);

  const doAction = async (action: string, body: Record<string, unknown> = {}) => {
    setActionLoading(action);
    setError("");
    try {
      const res = await fetch(`${getApiBase()}/api/requests/${id}/${action}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Action failed");
      }
      const d = await res.json();
      setRequest(d.request);
      const evtRes = await fetch(`${getApiBase()}/api/requests/${id}/events`, { credentials: "include" });
      const evtData = await evtRes.json();
      setEvents(evtData.events ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleIacDeploy = async () => {
    if (!request || !iacDeployPassword) return;
    setIacDeployLoading(true);
    setIacDeployError(null);
    try {
      const r = await fetch(`${getApiBase()}/api/iac/deploy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: request.applicationName ?? "mccain-app",
          region: (request.azureRegions?.[0] ?? "canadacentral").toLowerCase().replace(/\s+/g, ""),
          adminPassword: iacDeployPassword,
          allowedRdpSource: iacDeployRdpSource || undefined,
          selectedServices: iacSelectedServices,
        }),
      });
      const d = await r.json() as { deploymentId?: number; error?: string };
      if (!r.ok || !d.deploymentId) {
        setIacDeployError(d.error ?? "Failed to start deployment");
        return;
      }
      setIacDeploymentId(d.deploymentId);
      setIacDeployFormOpen(false);
    } catch {
      setIacDeployError("Could not reach the portal API. Please try again.");
    } finally {
      setIacDeployLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await fetch(`${getApiBase()}/api/requests/${id}`, { method: "DELETE", credentials: "include" });
      setLocation("/requests");
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`${getApiBase()}/api/requests/${id}/comment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: commentText.trim() }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      setCommentText("");
      const evtRes = await fetch(`${getApiBase()}/api/requests/${id}/events`, { credentials: "include" });
      const evtData = await evtRes.json();
      setEvents(evtData.events ?? []);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDownloadAuditReport = async () => {
    if (!request) return;
    const res = await fetch(`${getApiBase()}/api/requests/${request.id}/audit-report`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mccain-architecture-request-${request.id}-audit-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClone = async () => {
    if (!request) return;
    setCloningRequest(true);
    try {
      const res = await fetch(`${getApiBase()}/api/requests/${id}/clone`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to clone request");
      const d = await res.json();
      setLocation(`/requests/${d.request.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloningRequest(false);
    }
  };

  const handleGenerateCAB = async () => {
    if (!request) return;
    setError("");

    // Validate — at least one CIDR must be provided
    const environments = request.targetEnvironments as string[];
    const missingCidrs = environments.filter((e) => !cidrs[e]?.trim());
    if (missingCidrs.length > 0) {
      setError(`Please enter a Network CIDR for: ${missingCidrs.join(", ")}`);
      return;
    }

    const stored = request.cabFormData ?? {};
    const VALID_ENVS = ["Dev", "QA", "UAT", "Prod"] as const;
    type ValidEnv = typeof VALID_ENVS[number];
    // "QA/UAT" means a single combined testing environment — treated as "QA"
    const normalizedEnvs = environments.flatMap((e): ValidEnv[] => {
      if (e === "QA/UAT") return ["QA"];
      if ((VALID_ENVS as readonly string[]).includes(e)) return [e as ValidEnv];
      return [];
    });

    // Normalize CIDR keys: "QA/UAT" → "QA" (one environment, one CIDR)
    const normalizedCidrs: Record<string, string> = {};
    for (const [key, val] of Object.entries(cidrs)) {
      if (key === "QA/UAT") {
        normalizedCidrs["QA"] = val;
      } else {
        normalizedCidrs[key] = val;
      }
    }

    const regionMap: Record<string, string> = {
      canadacentral: "canadacentral", canadaeast: "canadaeast",
      "Canada Central": "canadacentral", "Canada East": "canadaeast",
    };
    const normalizedRegions = (request.azureRegions as string[])
      .map((r) => regionMap[r] ?? r)
      .filter((r) => ["canadacentral", "canadaeast"].includes(r));

    const firstCidr = Object.values(normalizedCidrs).find(Boolean) ?? Object.values(cidrs).find(Boolean) ?? "";

    const reqEmail = request.requestorEmail ?? "";
    const appName  = request.applicationName;
    const buName   = request.businessUnit ?? "";

    const fullFormData: FormDraft = {
      // Core — always populated from the request
      applicationName:     appName,
      applicationType:     (request.applicationType ?? "Greenfield") as FormDraft["applicationType"],
      applicationOverview: request.description || appName,
      organization:        stored.organization     || buName,
      lineOfBusiness:      stored.lineOfBusiness   || request.lineOfBusiness || buName,
      requestorEmail:      stored.requestorEmail   || reqEmail,
      solution:            stored.solution         || appName,
      networkPosture:      normalizeNetworkPosture(stored.networkPosture),
      // Environments & regions
      environmentsRequired: normalizedEnvs.length ? normalizedEnvs : ["Dev", "QA", "Prod"],
      azureRegions:         normalizedRegions.length ? normalizedRegions : ["canadacentral"],
      workloadTier:         ((stored.workloadTier ?? "Tier 2") as FormDraft["workloadTier"]),
      haEnabled:            stored.haEnabled ?? false,
      drEnabled:            stored.drEnabled ?? false,
      // Personnel — use only what was captured in the form; empty = left blank in CAB
      businessOwner:                stored.businessOwner              ?? "",
      businessOwnerEmail:           stored.businessOwnerEmail         ?? "",
      itOwner:                      stored.itOwner                    ?? "",
      technologyOwnerEmail:         stored.technologyOwnerEmail       ?? "",
      applicationSupportManager:    stored.applicationSupportManager  ?? "",
      infrastructureSupportManager: stored.infrastructureSupportManager ?? "",
      glAccountOwnerEmail:          stored.glAccountOwnerEmail        ?? "",
      categoryOwner:                stored.categoryOwner              ?? "",
      // Billing — use only what was captured; empty = left blank in CAB
      billingCompanyCode:     stored.billingCompanyCode     ?? "",
      billingPlant:           stored.billingPlant           ?? "",
      billingCostObject:      stored.billingCostObject      ?? "",
      billingGlAccount:       stored.billingGlAccount       ?? "",
      budgetTrackerReference: stored.budgetTrackerReference ?? "",
      // Technical — empty if not captured; LLM uses applicationOverview as context
      applicationArchitecture: stored.applicationArchitecture ?? "",
      applicationFlow:         stored.applicationFlow         ?? "",
      frontendStack:           stored.frontendStack           ?? "",
      backendStack:            stored.backendStack            ?? "",
      databaseStack:           stored.databaseStack           ?? "",
      scalabilityRequirements: stored.scalabilityRequirements ?? "",
      availabilityTarget:      stored.availabilityTarget      ?? "",
      rto:                     stored.rto                     ?? "",
      rpo:                     stored.rpo                     ?? "",
      // Network CIDRs — keyed by normalized env names (QA/UAT split into QA + UAT)
      environmentCidrs: normalizedCidrs,
      networkCidr:      firstCidr,
    };

    // Push full form data into app context so Preview.tsx can generate
    setFormData(fullFormData);
    localStorage.setItem("activeRequestId", String(request.id));

    // Mark CAB as in-progress and persist CIDRs
    await doAction("start-cab", { environmentCidrs: cidrs });

    setLocation("/preview");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading request…
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Request not found.</p>
        <Button variant="ghost" onClick={() => setLocation("/requests")} className="mt-4">Back to requests</Button>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const isEA = user?.role === "enterprise_architect" || isAdmin;
  const isCA = user?.role === "cloud_architect" || isAdmin;
  const isRequestor = !isEA && !isCA;

  // Derive workflow type
  const THIRD_PARTY_MODELS = [
    "SaaS Solution",
    "Vendor Cloud Tenant (Azure/AWS/GCP/Others)",
    "On-Premises (McCain Data Center)",
    "Hybrid Solution (McCain Data Center & McCain Cloud)",
    "Any other 3rd party Solution",
  ];
  const isCloudTenant  = request.deploymentModel === "Azure Cloud (McCain Tenant)";
  const isThirdParty   = THIRD_PARTY_MODELS.includes(request.deploymentModel ?? "");
  const isSandbox      = request.cabFormData?.workflowType === "sandbox";
  const isDevelopment  = request.cabFormData?.workflowType === "development";

  // Simple app fast-track detection — AI classification takes precedence; fall back to legacy cabFormData field
  const isSimpleFastTrack = isCloudTenant && !isSandbox && !isDevelopment && (
    request.aiClassification === "simple" ||
    (request.cabFormData as Record<string, unknown> | null)?.appComplexity === "Simple"
  );

  const canEAReview    = isEA && ["submitted", "ea_triage"].includes(request.status) && !isSimpleFastTrack && !isSandbox && !isDevelopment;
  const canEATriage    = isEA && request.status === "submitted" && !isSimpleFastTrack && !isSandbox && !isDevelopment;
  // CAB generation: sandbox skips CAB entirely
  const canGenerateCAB = isCA && ["ea_approved", "cab_in_progress"].includes(request.status) && isCloudTenant && !isSandbox;
  // Only show View CAB when an actual CAB document exists
  const canViewCAB     = request.status === "cab_completed" && isCA && !!request.cabSubmissionId;
  const canDevSecOps   = isCA && request.status === "cab_completed";
  // Sandbox and Development skip Observability and FinOps
  const canObservability = isCA && isCloudTenant && request.status === "devsecops_approved" && !isSandbox && !isDevelopment;
  const canFinOps      = isEA && !isSandbox && !isDevelopment && (
    (isCloudTenant && request.status === "observability_approved") ||
    (isThirdParty  && request.status === "ea_approved")
  );
  // True when ea_approved but no next action available for the current user/model
  const noActionAfterApproval = request.status === "ea_approved" && !canGenerateCAB && !canFinOps;
  // Requestor can view their completed CAB in read-only mode
  const canRequestorViewCAB = isRequestor &&
    ["cab_completed", "devsecops_approved", "devsecops_rejected", "observability_approved", "finops_active"].includes(request.status) &&
    !!request.cabSubmissionId;

  // Phase progress steps — dynamic based on workflow type
  const PHASE_STEPS_CLOUD: { label: string; statuses: string[]; doneStatuses: string[] }[] = [
    { label: "Architecture Review", statuses: ["submitted", "ea_triage", "modification_requested"], doneStatuses: ["ea_approved", "ea_rejected", "cab_in_progress", "cab_completed", "devsecops_approved", "devsecops_rejected", "observability_approved", "finops_active"] },
    { label: "Technical Design",    statuses: ["ea_approved", "cab_in_progress"], doneStatuses: ["cab_completed", "devsecops_approved", "devsecops_rejected", "observability_approved", "finops_active"] },
    { label: "Infrastructure",      statuses: ["cab_completed"], doneStatuses: ["devsecops_approved", "devsecops_rejected", "observability_approved", "finops_active"] },
    { label: "Observability",       statuses: ["devsecops_approved"], doneStatuses: ["observability_approved", "finops_active"] },
    { label: "Cost Management",     statuses: ["observability_approved"], doneStatuses: ["finops_active"] },
  ];
  const PHASE_STEPS_3P: { label: string; statuses: string[]; doneStatuses: string[] }[] = [
    { label: "Architecture Review", statuses: ["submitted", "ea_triage", "modification_requested"], doneStatuses: ["ea_approved", "ea_rejected", "finops_active"] },
    { label: "Cost Management",     statuses: ["ea_approved"], doneStatuses: ["finops_active"] },
  ];
  const PHASE_STEPS_DEV: { label: string; statuses: string[]; doneStatuses: string[] }[] = [
    { label: "Technical Design", statuses: ["ea_approved", "cab_in_progress"], doneStatuses: ["cab_completed", "devsecops_approved", "devsecops_rejected"] },
    { label: "Infrastructure",   statuses: ["cab_completed"], doneStatuses: ["devsecops_approved", "devsecops_rejected"] },
  ];
  const PHASE_STEPS_SANDBOX: { label: string; statuses: string[]; doneStatuses: string[] }[] = [
    { label: "Deployment", statuses: ["cab_completed"], doneStatuses: ["devsecops_approved", "devsecops_rejected"] },
  ];
  const PHASE_STEPS = isSandbox ? PHASE_STEPS_SANDBOX
    : isDevelopment ? PHASE_STEPS_DEV
    : isThirdParty ? PHASE_STEPS_3P
    : PHASE_STEPS_CLOUD;

  const isRejected = ["ea_rejected", "devsecops_rejected"].includes(request.status);

  const environments = request.targetEnvironments as string[];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/requests")} className="text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-1" />
          All Requests
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold text-slate-400 tracking-widest bg-slate-100 px-2 py-0.5 rounded">
              {toRequestNumber(request.id, request.createdAt)}
            </span>
          </div>
          <h1 className="text-2xl font-bold leading-tight">{request.title}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <StatusBadge status={request.status} />
            {isSimpleFastTrack && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 text-[#1a1a2e]" style={{ background: "#FFCD00" }}>
                <Rocket className="w-3 h-3" /> Fast-Track
              </span>
            )}
            <span className={`text-sm font-medium ${PRIORITY_COLORS[request.priority] ?? "text-slate-500"}`}>
              {request.priority} Priority
            </span>
            {/* SLA staleness indicator */}
            {(() => {
              const terminal = ["finops_active", "cancelled", "ea_rejected", "devsecops_rejected"];
              if (terminal.includes(request.status)) return null;
              const days = Math.floor((Date.now() - new Date(request.updatedAt).getTime()) / 86400000);
              if (days < 3) return null;
              const isAlert = days >= 5;
              return (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isAlert ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
                  title={`No activity for ${days} days`}>
                  <AlertTriangle className="w-3 h-3" /> {days}d idle
                </span>
              );
            })()}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Cancel button — requestor/admin on early statuses only */}
          {(user?.role === "requestor" || user?.role === "admin") &&
            ["submitted", "modification_requested", "ea_triage"].includes(request.status) && (
            <Button
              variant="outline"
              size="sm"
              className="text-slate-500 hover:text-red-600 hover:border-red-300 shrink-0"
              disabled={!!actionLoading}
              onClick={() => doAction("cancel")}
            >
              {actionLoading === "cancel" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <XCircle className="w-4 h-4 mr-1.5" />}
              Cancel Request
            </Button>
          )}
          {(user?.role === "requestor" || user?.role === "admin") && (
            <Button
              variant="outline"
              size="sm"
              className="text-slate-500 hover:text-slate-800 shrink-0"
              onClick={handleClone}
              disabled={cloningRequest}
            >
              {cloningRequest ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileText className="w-4 h-4 mr-1.5" />}
              Duplicate
            </Button>
          )}
          {user?.role === "admin" && (
            confirmDelete ? (
              <div className="flex items-center gap-2 shrink-0 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-sm text-red-700 font-medium">Delete this request?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-3 text-xs"
                  disabled={deleteLoading}
                  onClick={handleDelete}
                >
                  {deleteLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, delete"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs"
                  disabled={deleteLoading}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-slate-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 shrink-0"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
            )
          )}
        </div>
      </div>

      {/* ── Sandbox Banner ── */}
      {isSandbox && (
        <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 flex items-start gap-3">
          <div className="rounded-full p-2 flex-shrink-0 bg-orange-100">
            <Rocket className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-orange-900">Sandbox Environment — Accelerated Path</p>
              <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-300 rounded-full px-2 py-0.5">No EA Review · No CAB Required</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              This is a Sandbox request. EA review, Technical Design, Observability, and FinOps phases are skipped. A Cloud Architect can proceed directly to Infrastructure Deployment below.
            </p>
          </div>
        </div>
      )}

      {/* ── Development Banner ── */}
      {isDevelopment && (
        <div className="rounded-xl border-2 border-sky-300 bg-sky-50 p-4 flex items-start gap-3">
          <div className="rounded-full p-2 flex-shrink-0 bg-sky-100">
            <Code2 className="w-4 h-4 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-sky-900">Development Environment — Fast-Track Path</p>
              <span className="text-[10px] font-semibold bg-sky-100 text-sky-700 border border-sky-300 rounded-full px-2 py-0.5">EA Review Skipped</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              This is a Development request. EA review is skipped — a Cloud Architect can generate the Technical Design immediately, then proceed to Infrastructure Deployment.
            </p>
          </div>
        </div>
      )}

      {/* ── Simple App Fast-Track Banner ── */}
      {isSimpleFastTrack && (
        <div className="rounded-xl border-2 border-[#FFCD00] bg-yellow-50 p-4 flex items-start gap-3">
          <div className="rounded-full p-2 flex-shrink-0" style={{ background: "#FFCD00" }}>
            <Rocket className="w-4 h-4 text-[#1a1a2e]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-[#1a1a2e]">Simple App — Fast-Track Path</p>
              {request.status === "ea_approved" && (
                <span className="text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">EA Auto-Approved</span>
              )}
              {request.status === "cab_in_progress" && (
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">Technical Design In Progress</span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {request.status === "ea_approved"
                ? "This simple application was automatically approved by the system. Network CIDRs have been pre-filled — a Cloud Architect can click Generate Technical Design below immediately, no triage or manual Architecture Review required."
                : "This simple application bypassed the standard review queue and was fast-tracked straight to Technical Design generation."}
            </p>
          </div>
        </div>
      )}

      {/* Phase Progress Tracker — EA / CA only; admins get the full phase cards below so skip the compact tracker for them */}
      {!isRequestor && !isAdmin && <Card className="border-slate-200">
        <CardContent className="px-4 py-3">
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-2">Onboarding Progress</p>
          <div className="flex items-center gap-0">
            {PHASE_STEPS.map((step, idx) => {
              const isDone = step.doneStatuses.includes(request.status);
              const isActive = step.statuses.includes(request.status) && !isDone;
              const isLast = idx === PHASE_STEPS.length - 1;
              return (
                <div key={step.label} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 shrink-0 ${
                      isDone
                        ? "bg-green-500 border-green-500 text-white"
                        : isActive
                          ? isRejected
                            ? "bg-red-100 border-red-400 text-red-700"
                            : "border-yellow-400 bg-yellow-50 text-yellow-800"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}>
                      {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : idx + 1}
                    </div>
                    <p className={`text-[9px] font-mono mt-1 text-center leading-tight ${
                      isDone ? "text-green-600" : isActive ? "text-slate-700 font-semibold" : "text-slate-400"
                    }`}>{step.label}</p>
                  </div>
                  {!isLast && (
                    <div className={`h-0.5 w-4 shrink-0 mx-0.5 rounded ${isDone ? "bg-green-400" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>}

      {/* ─── Admin Action Banner — clearly shows what's pending and links directly to the action section ─── */}
      {isAdmin && (() => {
        const s = request.status;
        type ActionConfig = { color: string; icon: React.ReactNode; heading: string; detail: string; anchor: string; label: string } | null;
        const cfg: ActionConfig =
          ["submitted", "ea_triage"].includes(s) ? {
            color: "border-yellow-400 bg-yellow-50",
            icon: <ShieldCheck className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />,
            heading: "Architecture Review Required — Awaiting Enterprise Architecture Approval",
            detail: "This request has been submitted and is pending Architecture Review. As admin you can review the application details, consult the AI-suggested architecture pattern, and approve or request changes below.",
            anchor: "#ea-review-section",
            label: "Go to Architecture Review ↓",
          } : s === "modification_requested" ? {
            color: "border-orange-400 bg-orange-50",
            icon: <PenLine className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />,
            heading: "Changes Requested — Waiting for Requestor to Resubmit",
            detail: "The EA has requested modifications. The requestor must address the feedback and resubmit. No action is required from you at this time.",
            anchor: "#ea-review-section",
            label: "View EA Comments ↓",
          } : ["ea_approved"].includes(s) ? {
            color: "border-blue-400 bg-blue-50",
            icon: <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />,
            heading: "Technical Design Required — Awaiting Cloud Architect",
            detail: "Architecture Review is approved. A Cloud Architect must generate the Cloud Architecture Blueprint. As admin you can trigger Technical Design generation directly.",
            anchor: "#cab-action-section",
            label: "Go to Technical Design ↓",
          } : s === "cab_in_progress" ? {
            color: "border-blue-300 bg-blue-50",
            icon: <Loader2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />,
            heading: "Technical Design In Progress — Cloud Architect is Generating the Document",
            detail: "A Cloud Architect has started the Technical Design. You can re-generate it if needed.",
            anchor: "#cab-action-section",
            label: "View Technical Design Section ↓",
          } : s === "cab_completed" ? {
            color: "border-indigo-400 bg-indigo-50",
            icon: <Code2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />,
            heading: "Infrastructure Deployment Approval Required — Awaiting Cloud Architect Sign-off",
            detail: "The Technical Design is complete. A Cloud Architect must review the Terraform IaC, complete the sign-off checklist, and approve the Infrastructure pipeline gates before Observability setup.",
            anchor: "#devsecops-section",
            label: "Go to Infrastructure Sign-off ↓",
          } : s === "devsecops_approved" ? {
            color: "border-cyan-400 bg-cyan-50",
            icon: <Activity className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />,
            heading: "Observability Setup Required — Next Step",
            detail: "Infrastructure has been approved. A Cloud Architect must confirm monitoring, alerting, dashboards, and on-call runbooks are configured before Cost Management can be activated.",
            anchor: "#observability-section",
            label: "Go to Observability ↓",
          } : s === "finops_active" ? {
            color: "border-green-400 bg-green-50",
            icon: <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />,
            heading: "Fully Onboarded — No Action Required",
            detail: "This request has completed all phases. The workload is active and enrolled in Cost Management governance.",
            anchor: "",
            label: "",
          } : s === "ea_rejected" ? {
            color: "border-red-400 bg-red-50",
            icon: <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />,
            heading: "Request Rejected at EA Stage",
            detail: "The Enterprise Architect rejected this request. See the reviewer comments below for the reason. The requestor can be asked to revise and resubmit.",
            anchor: "#ea-review-section",
            label: "View EA Decision ↓",
          } : s === "devsecops_rejected" ? {
            color: "border-red-400 bg-red-50",
            icon: <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />,
            heading: "Infrastructure Deployment Rejected — Cloud Architect Review Needed",
            detail: "The Infrastructure Deployment approval was rejected. The Cloud Architect team must address the issues before re-submitting for approval.",
            anchor: "#devsecops-section",
            label: "View Infrastructure Decision ↓",
          } : null;

        if (!cfg) return null;
        return (
          <div className={`rounded-xl border-2 p-4 flex items-start gap-3 ${cfg.color}`}>
            {cfg.icon}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{cfg.heading}</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{cfg.detail}</p>
            </div>
            {cfg.anchor && (
              <button
                onClick={() => {
                  const el = document.getElementById(cfg.anchor.replace("#", ""));
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: "#FFCD00", color: "#1a1a2e" }}
              >
                {cfg.label}
              </button>
            )}
          </div>
        );
      })()}

      {/* ─── Phase Status View (requestors + admins) ─────────────────── */}
      {(isRequestor || isAdmin) && (() => {
        const s = request.status;

        type PhaseStatus = "pending" | "active" | "done" | "rejected" | "revision" | "skipped";

        // For sandbox/development: skip EA review phase card
        const p1Status: PhaseStatus = isSandbox || isDevelopment ? "skipped"
          : ["ea_approved", "cab_in_progress", "cab_completed", "devsecops_approved", "devsecops_rejected", "observability_approved", "finops_active"].includes(s) ? "done"
          : s === "ea_rejected" ? "rejected"
          : s === "modification_requested" ? "revision"
          : "active";

        const p2Status: PhaseStatus = (!isCloudTenant || isSandbox) ? "skipped"
          : ["cab_completed", "devsecops_approved", "devsecops_rejected", "observability_approved", "finops_active"].includes(s) ? "done"
          : ["ea_approved", "cab_in_progress"].includes(s) ? "active"
          : "pending";

        const p3Status: PhaseStatus = !isCloudTenant ? "skipped"
          : ["devsecops_approved", "observability_approved", "finops_active"].includes(s) ? "done"
          : s === "devsecops_rejected" ? "rejected"
          : s === "cab_completed" ? "active"
          : "pending";

        // Observability is skipped for sandbox and development
        const p4ObsStatus: PhaseStatus = (!isCloudTenant || isSandbox || isDevelopment) ? "skipped"
          : s === "observability_approved" || s === "finops_active" ? "done"
          : s === "devsecops_approved" ? "active"
          : "pending";

        // FinOps is skipped for sandbox and development
        const p4Status: PhaseStatus = (isSandbox || isDevelopment) ? "skipped"
          : s === "finops_active" ? "done"
          : (isCloudTenant && s === "observability_approved") || (isThirdParty && s === "ea_approved") ? "active"
          : "pending";

        const PhaseCard = ({
          phase, title, desc, status, eaName, eaComment, adminContinuePath, adminContinueLabel,
        }: {
          phase: number; title: string; desc: string; status: PhaseStatus;
          eaName?: string; eaComment?: string;
          adminContinuePath?: string; adminContinueLabel?: string;
        }) => {
          if (status === "skipped") return null;
          const cfg = {
            pending:  { icon: <Clock className="w-4 h-4 text-slate-400" />, bar: "bg-slate-200", label: "Not yet started", labelCls: "text-slate-500", border: "border-slate-200 bg-white" },
            active:   { icon: <Clock className="w-4 h-4 text-amber-500" />, bar: "bg-amber-400", label: "In Progress", labelCls: "text-amber-600 font-semibold", border: "border-amber-200 bg-amber-50" },
            done:     { icon: <CheckCircle className="w-4 h-4 text-green-500" />, bar: "bg-green-500", label: "Complete", labelCls: "text-green-600 font-semibold", border: "border-green-200 bg-green-50" },
            rejected: { icon: <XCircle className="w-4 h-4 text-red-500" />, bar: "bg-red-400", label: "Rejected", labelCls: "text-red-600 font-semibold", border: "border-red-200 bg-red-50" },
            revision: { icon: <PenLine className="w-4 h-4 text-amber-600" />, bar: "bg-amber-400", label: "Changes Requested", labelCls: "text-amber-700 font-semibold", border: "border-amber-300 bg-amber-50" },
            skipped:  { icon: null, bar: "", label: "", labelCls: "", border: "" },
          }[status];
          const showAdminAction = isAdmin && adminContinuePath && (status === "active" || status === "revision");
          const handleAdminAction = () => {
            if (!adminContinuePath) return;
            if (adminContinuePath.startsWith("#")) {
              const el = document.getElementById(adminContinuePath.slice(1));
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
              setLocation(adminContinuePath);
            }
          };
          return (
            <div className={`rounded-lg border p-4 ${cfg.border}`}>
              <div className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-[#1a1a2e]`}
                  style={{ background: status === "done" ? "#22c55e22" : status === "active" ? "#fbbf2422" : status === "rejected" ? "#fca5a522" : "#e2e8f0" }}>
                  {phase}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <span className={`text-xs flex items-center gap-1 ${cfg.labelCls}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  {eaName && status === "done" && (
                    <p className="text-xs text-slate-500 mt-1">Reviewed by: <span className="font-medium text-slate-700">{eaName}</span></p>
                  )}
                  {eaComment && (
                    <div className="mt-2 rounded bg-white border border-slate-200 px-3 py-2 text-xs text-slate-600 italic">
                      "{eaComment}"
                    </div>
                  )}
                  {showAdminAction && (
                    <div className="mt-2">
                      <button
                        onClick={handleAdminAction}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#1a1a2e] bg-[#FFCD00] hover:bg-[#e6b800] px-3 py-1 rounded-md transition-colors"
                      >
                        {adminContinueLabel ?? "Continue"} →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
              {isAdmin ? "Phase Progress" : "Your Request Progress"}
            </p>

            {/* Horizontal phase stepper — shown for all users */}
            {(() => {
              const phases = isSandbox
                ? ["Submitted", "Deployment"]
                : isDevelopment
                ? ["Submitted", "Technical Design", "Deployment"]
                : isCloudTenant
                ? ["Submitted", "Architecture Review", "Technical Design", "Infrastructure", "Observability", "Cost Management"]
                : ["Submitted", "Architecture Review", "Cost Management"];
              const phaseForStatus: Record<string, number> = isSandbox
                ? { submitted: 0, cab_completed: 1, devsecops_approved: 1, devsecops_rejected: 1 }
                : isDevelopment
                ? { submitted: 0, ea_approved: 1, cab_in_progress: 1, cab_completed: 2, devsecops_approved: 2, devsecops_rejected: 2 }
                : isCloudTenant
                ? { submitted: 0, ea_triage: 0, modification_requested: 0, ea_rejected: 0, ea_approved: 1, cab_in_progress: 2, cab_completed: 3, devsecops_approved: 4, devsecops_rejected: 3, observability_approved: 5, finops_active: 5 }
                : { submitted: 0, ea_triage: 0, modification_requested: 0, ea_rejected: 0, ea_approved: 1, finops_active: 2 };
              const phaseIdx = phaseForStatus[s] ?? 0;
              const daysSince = Math.floor((Date.now() - new Date(request.createdAt).getTime()) / 86400000);
              const responsibleNow = isSandbox || isDevelopment
                ? (["devsecops_approved", "devsecops_rejected"].includes(s) ? "Completed" : "Cloud Architecture")
                : s === "modification_requested" ? "You — Action Required"
                : ["submitted", "ea_triage"].includes(s) ? "Enterprise Architecture"
                : ["ea_approved", "cab_in_progress", "cab_completed", "devsecops_approved"].includes(s) ? "Cloud Architecture"
                : s === "observability_approved" ? "Enterprise Architecture"
                : s === "finops_active" ? "Completed"
                : s === "ea_rejected" ? "Rejected" : "—";
              return (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Submitted <span className="font-semibold text-slate-700">{daysSince}d ago</span></span>
                    <span className="flex items-center gap-1.5">
                      <User className="w-3 h-3" />
                      <span className="font-semibold text-slate-700">{responsibleNow}</span>
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute top-3.5 inset-x-0 h-1 bg-slate-100 rounded-full" />
                    <div
                      className="absolute top-3.5 left-0 h-1 bg-green-400 rounded-full transition-all duration-700"
                      style={{ width: `${phases.length > 1 ? (Math.min(phaseIdx, phases.length - 1) / (phases.length - 1)) * 100 : 0}%` }}
                    />
                    <div className="relative flex justify-between">
                      {phases.map((phase, idx) => {
                        const done = idx < phaseIdx || s === "finops_active";
                        const active = idx === phaseIdx && !["finops_active", "ea_rejected", "devsecops_rejected"].includes(s);
                        const rejected = ["ea_rejected", "devsecops_rejected"].includes(s) && idx === phaseIdx;
                        return (
                          <div key={phase} className="flex flex-col items-center gap-1.5">
                            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold z-10 ${
                              rejected ? "border-red-400 bg-red-50 text-red-600"
                              : done ? "border-green-500 bg-green-500 text-white"
                              : active ? "border-[#FFCD00] bg-yellow-50 text-yellow-900"
                              : "border-slate-200 bg-white text-slate-300"
                            }`}>
                              {done ? <CheckCircle className="w-3.5 h-3.5" /> : <span>{idx + 1}</span>}
                            </div>
                            <p className={`text-[9px] text-center leading-tight max-w-[52px] ${
                              rejected ? "text-red-600 font-semibold"
                              : done ? "text-green-600"
                              : active ? "text-slate-700 font-semibold"
                              : "text-slate-300"
                            }`}>{phase}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Current phase card — shows the first incomplete phase */}
            {p4Status === "done" ? null
              : p4ObsStatus === "active" ? (
                <PhaseCard
                  phase={isCloudTenant ? 5 : 4}
                  title="Observability"
                  desc={isAdmin ? "Infrastructure approved. Cloud Architect to confirm monitoring setup before Cost Management." : "The Cloud Architecture team is configuring monitoring, alerts, and logging for your workload."}
                  status={p4ObsStatus}
                  adminContinuePath="#observability-section"
                  adminContinueLabel="Go to Observability ↓"
                />
              ) : p1Status !== "done" ? (
                <PhaseCard
                  phase={1}
                  title="Architecture Review"
                  desc={
                    isAdmin
                      ? (p1Status === "active"   ? "Pending Architecture Review. Use the action button to go to the review section." :
                         p1Status === "revision" ? "Changes requested by Enterprise Architect. Awaiting requestor resubmission." :
                         "Rejected at Architecture Review stage. See reviewer comments in the approval section below.")
                      : (p1Status === "active"   ? "Your submission is currently being reviewed by the Enterprise Architecture team." :
                         p1Status === "revision" ? "The Enterprise Architect has reviewed your submission and is requesting changes before proceeding." :
                         "Your request was not approved at this stage. See the reviewer comments below.")
                  }
                  status={p1Status}
                  eaName={request.eaReviewerName ?? undefined}
                  eaComment={!isAdmin ? (request.eaComments ?? undefined) : undefined}
                  adminContinuePath="#ea-review-section"
                  adminContinueLabel="Go to Architecture Review ↓"
                />
              ) : isCloudTenant && p2Status !== "done" ? (
                <PhaseCard
                  phase={2}
                  title="Technical Design"
                  desc={p2Status === "active"
                    ? (isAdmin ? "Architecture Review is approved. Generate the Cloud Architecture Blueprint to proceed." : "The Cloud Architect is currently preparing the Cloud Architecture Blueprint.")
                    : (isAdmin ? "Architecture Review complete — Technical Design can now be started." : "Architecture Review is complete. The Cloud Architect team will begin the Technical Design.")}
                  status={p2Status}
                  adminContinuePath="#cab-action-section"
                  adminContinueLabel="Generate / Continue Technical Design"
                />
              ) : isCloudTenant && p3Status !== "done" && p3Status !== "skipped" ? (
                <PhaseCard
                  phase={3}
                  title="Infrastructure Deployment"
                  desc={p3Status === "active"
                    ? (isAdmin ? "Technical Design is complete. Review and approve for deployment." : "The completed Technical Design is under Infrastructure review for pipeline and security gate approval.")
                    : p3Status === "rejected" ? "Infrastructure Deployment review was not approved. The Cloud Architect team will be in contact."
                    : "Awaiting Technical Design completion before Infrastructure Deployment can begin."}
                  status={p3Status}
                  adminContinuePath="#devsecops-section"
                  adminContinueLabel="Review & Approve"
                />
              ) : (
                <PhaseCard
                  phase={isCloudTenant ? 6 : 2}
                  title="Cost Management"
                  desc={p4Status === "active"
                    ? (isAdmin ? "Observability confirmed. Activate Cost Management to complete onboarding." : "Your workload is in the final Cost Management stage. Cost allocation and budget controls are being configured.")
                    : (isAdmin ? "Cost Management begins once Observability is confirmed." : "Cost Management begins once all prior phases are approved.")}
                  status={p4Status}
                  adminContinuePath="#finops-section"
                  adminContinueLabel="Go to Cost Management ↓"
                />
              )
            }

            {/* ── Resubmit panel — requestors only (not admins) ── */}
            {!isAdmin && s === "modification_requested" && (
              <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <PenLine className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm font-semibold text-amber-800">Action Required — Resubmit with Changes</p>
                </div>
                <p className="text-xs text-amber-700">
                  The Enterprise Architect has reviewed your request and needs you to address the feedback above before it can proceed. Please add any clarifications or updates, then resubmit.
                </p>
                <Textarea
                  value={resubmitNote}
                  onChange={(e) => setResubmitNote(e.target.value)}
                  placeholder="Describe the changes you've made or provide additional context for the EA…"
                  rows={3}
                  className="bg-white text-sm"
                />
                <div className="flex justify-end">
                  <Button
                    className="text-white"
                    style={{ background: "#1a1a2e" }}
                    disabled={!!actionLoading}
                    onClick={() => doAction("resubmit", { note: resubmitNote })}
                  >
                    {actionLoading === "resubmit"
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <RefreshCw className="w-4 h-4 mr-2" />}
                    Resubmit Request
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })()}


      {/* CAB document available to requestor (view-only) once CAB is completed */}
      {canRequestorViewCAB && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-purple-800 text-sm">Cloud Architecture Blueprint is ready</p>
                <p className="text-xs text-purple-600 mt-0.5">
                  The Cloud Architect has completed the Cloud Architecture Blueprint for your application. You can view it in read-only mode.
                </p>
              </div>
            </div>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
              onClick={() => setLocation(`/cab-view/${request.id}`)}
            >
              <FileText className="w-4 h-4 mr-2" />
              View Design Document
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Submitted Request Details — admins / EA / CA only ───────── */}
      {!isRequestor && <Card className="border-slate-200">
        <CardHeader className="pb-2 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            Submitted Request Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Section: Application Overview */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-3">Application Overview</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Application Name</p>
                <p className="text-sm font-medium text-slate-800">{request.applicationName}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Request Type</p>
                <p className="text-sm font-medium text-slate-800">{request.applicationType}</p>
              </div>
              {request.cabFormData?.businessCriticality && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Business Criticality</p>
                  <p className="text-sm font-medium text-slate-800">{request.cabFormData.businessCriticality}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Business Unit</p>
                <p className="text-sm font-medium text-slate-800">{request.businessUnit}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Line of Business</p>
                <p className="text-sm font-medium text-slate-800">{request.lineOfBusiness}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Priority</p>
                <p className={`text-sm font-semibold ${PRIORITY_COLORS[request.priority] ?? "text-slate-500"}`}>{request.priority}</p>
              </div>
              {request.cabFormData?.solutionArchitecture && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Solution Architecture</p>
                  <p className="text-sm text-slate-800">{request.cabFormData.solutionArchitecture}</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 mx-5" />

          {/* Section: Description & Justification */}
          <div className="px-5 py-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-3">Description & Business Justification</p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Description</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{request.description}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Business Justification</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{request.businessJustification}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 mx-5" />

          {/* Section: Infrastructure */}
          <div className="px-5 py-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-3">Environments & Infrastructure</p>
            <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Target Environments</p>
                <div className="flex flex-wrap gap-1.5">
                  {(request.targetEnvironments as string[]).map((e) => (
                    <span key={e} className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">{e}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Azure Regions</p>
                <div className="flex flex-wrap gap-1.5">
                  {(request.azureRegions as string[]).map((r) => (
                    <span key={r} className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{r}</span>
                  ))}
                </div>
              </div>
              {request.deploymentModel && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Deployment Model</p>
                  <p className="text-sm font-medium text-slate-800">{request.deploymentModel}</p>
                </div>
              )}
              {request.cabFormData?.networkPosture && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Network Posture</p>
                  <p className="text-sm font-medium text-slate-800">{request.cabFormData.networkPosture}</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 mx-5" />

          {/* Section: Project Info */}
          <div className="px-5 py-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-3">Project Details</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Submitted By</p>
                <p className="text-sm font-medium text-slate-800">{request.requestorName}</p>
                <p className="text-xs text-slate-400">{request.requestorEmail}</p>
              </div>
              {request.dtsltLeader && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">DTSLT Leader</p>
                  <p className="text-sm font-medium text-slate-800">{request.dtsltLeader}</p>
                </div>
              )}
              {request.expectedUserBase && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Expected User Base</p>
                  <p className="text-sm font-medium text-slate-800">{request.expectedUserBase}</p>
                </div>
              )}
              {request.targetGoLiveDate && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Target Go-Live</p>
                  <p className="text-sm font-medium text-slate-800">
                    {new Date(request.targetGoLiveDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Submitted On</p>
                <p className="text-sm font-medium text-slate-800">
                  {new Date(request.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>}


      {/* ─── AI Architecture Pattern Suggestion (admin / EA / CA) ─── */}
      {!isRequestor && architecturePattern && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              AI-Suggested Architecture Pattern
              <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border ${
                architecturePattern.confidence === "high"
                  ? "bg-green-100 text-green-700 border-green-300"
                  : "bg-amber-100 text-amber-700 border-amber-300"
              }`}>
                {architecturePattern.confidence === "high" ? "High Confidence" : "Medium Confidence"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-blue-900">{architecturePattern.name}</span>
                  <span className="text-[10px] font-mono text-blue-600 border border-blue-200 bg-white px-2 py-0.5 rounded">{architecturePattern.category}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{architecturePattern.summary}</p>
              </div>
            </div>

            <div className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600 leading-relaxed">
              <span className="font-medium text-blue-800">Why this pattern:</span> {architecturePattern.rationale}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Key Azure Components</p>
                <ul className="space-y-1">
                  {architecturePattern.keyComponents.map((c) => (
                    <li key={c} className="text-[11px] text-slate-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">WAF Pillars</p>
                  <div className="flex flex-wrap gap-1">
                    {architecturePattern.wafPillars.map((p) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">{p}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">CAF Alignment</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{architecturePattern.cafAlignment}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Phase 1 — ARR / EA Review Panel */}
      {canEAReview && (
        <Card id="ea-review-section" className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: "#b49000" }} />
              Phase 1 — Architecture Review
              <span className="ml-auto text-[10px] font-mono text-yellow-700 border border-yellow-300 bg-yellow-50 px-2 py-0.5 rounded">
                {isCloudTenant ? "Architecture Review → Technical Design → Infrastructure → Cost Management" : "Architecture Review → Cost Management"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isCloudTenant && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <strong>{isThirdParty ? "Non-Cloud workflow:" : "Non-Cloud workflow:"}</strong> Approving this request ({request.deploymentModel ?? "unknown model"}) will route directly to Cost Management — no Technical Design or Infrastructure phases required.
              </div>
            )}
            {/* Recommended Architect Team + Risk Insights */}
            {architectRecs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Architect Team Panel */}
                <div className="rounded-lg border border-yellow-200 bg-yellow-50/60 p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-yellow-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Recommended Architect Team
                  </p>
                  <div className="space-y-1.5">
                    {architectRecs.map((rec) => {
                      const Icon = rec.Icon;
                      return (
                        <div key={rec.role} className={`flex gap-2 items-start rounded-md border px-2.5 py-1.5 text-xs ${rec.required ? "border-yellow-300 bg-white" : "border-slate-200 bg-white/60"}`}>
                          <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${rec.required ? "text-yellow-700" : "text-slate-400"}`} />
                          <div>
                            <span className={`font-semibold ${rec.required ? "text-yellow-900" : "text-slate-600"}`}>{rec.role}</span>
                            {rec.required && <span className="ml-1 text-[10px] font-medium text-yellow-700 bg-yellow-100 border border-yellow-200 px-1 rounded">Required</span>}
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{rec.reason}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Risk, Remediation & Best Practices Panel */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Risk, Remediation &amp; Best Practices
                  </p>
                  {riskInsights.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No risk flags for this workload.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {riskInsights.map((risk, i) => {
                        const RiskIcon = risk.severity === "info" ? Info : AlertTriangle;
                        return (
                          <div key={`${risk.category}-${risk.title}-${i}`} className={`flex gap-2 items-start rounded-md border px-2.5 py-2 text-xs ${getRiskSeverityClass(risk.severity)}`}>
                            <RiskIcon className={`w-3 h-3 mt-0.5 shrink-0 ${getRiskIconClass(risk.severity)}`} />
                            <div>
                              <span className="font-semibold text-slate-800">{risk.title}</span>
                              <span className="ml-1 text-[10px] font-medium uppercase tracking-wide opacity-70">[{risk.category}]</span>
                              <p className="text-[10px] text-slate-600 mt-0.5 leading-snug line-clamp-2">{risk.detail}</p>
                              <div className="mt-1.5 grid gap-1">
                                <p className="text-[10px] text-slate-700 leading-snug">
                                  <span className="font-semibold">Remediation:</span> {risk.remediation}
                                </p>
                                <p className="text-[10px] text-slate-600 leading-snug">
                                  <span className="font-semibold">Best practice:</span> {risk.bestPractice}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Domain Architects Consulted */}
            <div>
              <Label className="text-sm font-medium text-slate-700 mb-2 block">Domain Architects Consulted</Label>
              <div className="grid grid-cols-2 gap-2">
                {["Cloud Architect", "Security Architect", "Network Architect", "Infra Architect"].map((arch) => {
                  const checked = domainArchsConsulted.includes(arch);
                  return (
                    <label key={arch} className={`flex items-center gap-2.5 rounded-md border px-3 py-2 cursor-pointer text-sm select-none transition-colors ${checked ? "border-yellow-400 bg-yellow-50 text-yellow-900" : "border-slate-200 bg-white text-slate-600 hover:border-yellow-300"}`}>
                      <input
                        type="checkbox"
                        className="accent-yellow-500 w-3.5 h-3.5"
                        checked={checked}
                        onChange={() =>
                          setDomainArchsConsulted((prev) =>
                            checked ? prev.filter((a) => a !== arch) : [...prev, arch]
                          )
                        }
                      />
                      {arch}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Review Comments (optional)</Label>
              <Textarea
                value={eaComments}
                onChange={(e) => setEaComments(e.target.value)}
                placeholder="Add feedback, conditions, or risk notes…"
                rows={3}
              />
            </div>
            <div className="flex gap-3 flex-wrap">
              {canEATriage && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!actionLoading}
                  onClick={() => doAction("triage")}
                >
                  {actionLoading === "triage" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
                  Move to Triage
                </Button>
              )}
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={!!actionLoading}
                onClick={() => doAction("review", {
                  action: "approve",
                  comments: [
                    domainArchsConsulted.length > 0 ? `Architects consulted: ${domainArchsConsulted.join(", ")}.` : "",
                    buildApprovalRiskSummary(riskInsights),
                    eaComments,
                  ].filter(Boolean).join(" "),
                })}
              >
                {actionLoading === "review" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Approve Request
              </Button>
              <div className="flex flex-col items-start gap-1">
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40"
                  disabled={!!actionLoading || !eaComments.trim()}
                  onClick={() => doAction("review", { action: "reject", comments: eaComments })}
                  title={!eaComments.trim() ? "Add a comment explaining the rejection before rejecting" : undefined}
                >
                  {actionLoading === "review" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Reject Request
                </Button>
                {!eaComments.trim() && (
                  <p className="text-[10px] text-red-500 pl-1">Comments required to reject</p>
                )}
              </div>
              <Button
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-50 ml-auto"
                disabled={!!actionLoading}
                onClick={() => setShowModificationInput((v) => !v)}
              >
                <PenLine className="w-4 h-4 mr-2" />
                Request Changes
              </Button>
            </div>

            {/* ── Inline modification-request form ─────────────────────────── */}
            {showModificationInput && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3 mt-2">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <PenLine className="w-3.5 h-3.5" />
                  Describe the changes required from the requestor
                </p>
                <Textarea
                  value={modificationNotes}
                  onChange={(e) => setModificationNotes(e.target.value)}
                  placeholder="e.g. Please clarify the expected user base and add a DR strategy section…"
                  rows={3}
                  className="bg-white text-sm"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowModificationInput(false); setModificationNotes(""); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={!modificationNotes.trim() || !!actionLoading}
                    onClick={() => {
                      doAction("request-modification", { notes: modificationNotes });
                      setShowModificationInput(false);
                      setModificationNotes("");
                    }}
                  >
                    {actionLoading === "request-modification"
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Send className="w-4 h-4 mr-2" />}
                    Send to Requestor
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Phase 2 — Network CIDR + Generate CAB (Cloud Tenant only) */}
      {canGenerateCAB && (
        <Card id="cab-action-section" className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="w-4 h-4" style={{ color: "#b49000" }} />
              Phase 2 — Network Configuration &amp; CAB Generation
              <span className="ml-auto text-[10px] font-mono text-yellow-700 border border-yellow-300 bg-yellow-50 px-2 py-0.5 rounded">Cloud Architect · 1–2 Hours</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-700">
              {request.status === "cab_in_progress"
                ? "A CAB generation was started but not confirmed. Adjust CIDRs if needed, then click Re-generate CAB to create a new draft."
                : "This request has been approved. Network CIDRs have been pre-filled with standard McCain address ranges — adjust if needed, then click Generate CAB."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {environments.map((env) => (
                <div key={env} className="space-y-1">
                  <Label htmlFor={`cidr-${env}`} className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    {env} CIDR
                    {cidrs[env] && (
                      <span className="text-[10px] font-normal text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-px">auto-filled</span>
                    )}
                  </Label>
                  <Input
                    id={`cidr-${env}`}
                    placeholder="e.g. 10.10.1.0/24"
                    value={cidrs[env] ?? ""}
                    onChange={(e) => setCidrs((prev) => ({ ...prev, [env]: e.target.value }))}
                    className="bg-white text-sm font-mono"
                  />
                </div>
              ))}
            </div>
            <Button
              className="font-semibold"
              style={{ background: "#FFCD00", color: "#1a1a2e" }}
              disabled={!!actionLoading}
              onClick={handleGenerateCAB}
            >
              {actionLoading === "start-cab" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
              ) : request.status === "cab_in_progress" ? (
                <><FileText className="w-4 h-4 mr-2" />Re-generate CAB</>
              ) : (
                <><FileText className="w-4 h-4 mr-2" />Generate CAB</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Fallback — ea_approved but no next action available for this user/model */}
      {noActionAfterApproval && (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700">Request Approved — Next Steps</p>
              <p className="text-xs text-slate-500">
                {isCA && !isCloudTenant
                  ? `Technical Design generation is only available for Azure Cloud (McCain Tenant) requests. This request uses "${request.deploymentModel ?? "unknown"}" — a Cloud Architect action is not required. The Enterprise Architect will proceed to Cost Management activation.`
                  : isEA && !isThirdParty && !isCloudTenant
                    ? `Deployment model "${request.deploymentModel ?? "unknown"}" is not mapped to a workflow action. Please contact an admin to update the request or proceed manually.`
                    : "The request is approved. The next action will be available to the appropriate team."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View / Continue CAB */}
      {canViewCAB && (
        <Card id="cab-action-section" className="border-purple-200 bg-purple-50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-purple-800 text-sm">
                {request.status === "cab_completed" ? "Cloud Architecture Blueprint is complete — Awaiting Infrastructure sign-off" : "CAB is in progress"}
              </p>
              <p className="text-xs text-purple-600">
                {request.status === "cab_completed"
                  ? "Review the completed Cloud Architecture Blueprint, then proceed to Infrastructure Deployment approval below"
                  : "Continue working on the Cloud Architecture Blueprint"}
              </p>
            </div>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => setLocation(`/cab-view/${request.id}`)}
            >
              <FileText className="w-4 h-4 mr-2" />
              View Design Document
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Phase 3 — DevSecOps / IaC Approval (Cloud Tenant only) */}
      {canDevSecOps && (
        <Card id="devsecops-section" className="border-indigo-200 bg-indigo-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-700" />
              Phase 3 — Infrastructure Deployment
              <span className="ml-auto text-[10px] font-mono text-indigo-600 border border-indigo-300 bg-indigo-100 px-2 py-0.5 rounded">Cloud Architect · 2 Weeks</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-slate-700">
              {isSandbox
                ? "Sandbox request — no CAB required. Select the Azure services to provision, generate the Terraform IaC, then approve the Infrastructure pipeline."
                : "Technical Design is complete and reviewed. Select the Azure services detected from the Cloud Architecture Blueprint, generate the Terraform IaC, then approve the Infrastructure pipeline."}
            </p>

            {/* IaC Service Selection */}
            <div className="rounded-lg border border-indigo-200 bg-white p-4 space-y-4">
              <h4 className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                <Rocket className="w-4 h-4" />
                Infrastructure as Code — Service Selection
              </h4>

              {iacCabLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Detecting Azure services from Technical Design…
                </div>
              )}
              {iacCabError && (
                <p className="text-sm text-red-600">{iacCabError}</p>
              )}
              {!iacCabLoading && !iacCabError && (
                <>
                  <AzureServiceSelector
                    cabContent={iacCabContent}
                    selectedIds={iacSelectedServices}
                    onChange={setIacSelectedServices}
                  />

                  {/* Terraform Code */}
                  {iacSelectedServices.length > 0 && (
                    <div className="rounded-lg overflow-hidden border border-slate-200">
                      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e]">
                        <span className="text-xs text-slate-400 font-mono">main.tf</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Terraform</span>
                          <button
                            className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded flex items-center gap-1"
                            onClick={() => {
                              void navigator.clipboard.writeText(generateMultiServiceTerraform(iacFormDraft, iacSelectedServices)).then(() => {
                                setIacCopied(true);
                                setTimeout(() => setIacCopied(false), 2000);
                              });
                            }}
                          >
                            {iacCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {iacCopied ? "Copied" : "Copy"}
                          </button>
                          <button
                            className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded flex items-center gap-1"
                            onClick={() => {
                              const blob = new Blob([generateMultiServiceTerraform(iacFormDraft, iacSelectedServices)], { type: "text/plain" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url; a.download = "main.tf"; a.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </button>
                        </div>
                      </div>
                      <pre className="overflow-x-auto text-xs leading-relaxed p-4 bg-[#1e1e1e] text-[#d4d4d4] max-h-[400px] font-mono">
                        <code>{generateMultiServiceTerraform(iacFormDraft, iacSelectedServices)}</code>
                      </pre>
                    </div>
                  )}

                  {/* Feature 5 — Terraform Plan Preview */}
                  {iacSelectedServices.length > 0 && !iacDeploymentId && (
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-slate-600"
                        onClick={() => setIacShowPlan((v) => !v)}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {iacShowPlan ? "Hide Plan" : "Preview Plan"}
                      </Button>
                      {iacShowPlan && (() => {
                        const resources = parseTerraformResources(
                          generateMultiServiceTerraform(iacFormDraft, iacSelectedServices)
                        );
                        return (
                          <div className="mt-3 rounded-lg border border-slate-700 bg-[#1e1e1e] overflow-hidden text-xs font-mono">
                            <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                              <span className="text-slate-400">terraform plan · dry-run preview</span>
                              <span className="text-green-400">+{resources.length} to add · 0 to change · 0 to destroy</span>
                            </div>
                            <div className="p-3 space-y-1 max-h-48 overflow-y-auto">
                              {resources.map((r, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="text-green-400 font-bold">+</span>
                                  <span className="text-slate-400">resource</span>
                                  <span className="text-[#9cdcfe]">&quot;{r.type}&quot;</span>
                                  <span className="text-[#dcdcaa]">&quot;{r.name}&quot;</span>
                                  <span className="text-slate-600 ml-auto">create</span>
                                </div>
                              ))}
                            </div>
                            <div className="px-4 py-2 border-t border-slate-700 text-slate-400">
                              Plan: {resources.length} to add, 0 to change, 0 to destroy.
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Deploy to Azure */}
                  {iacSelectedServices.length > 0 && !iacDeploymentId && (
                    <>
                      <Button
                        size="sm"
                        className="gap-1.5 font-semibold"
                        style={{ background: "#0078d4", color: "#fff" }}
                        onClick={() => setIacDeployFormOpen(true)}
                      >
                        <Rocket className="w-4 h-4" />
                        Deploy to Azure
                      </Button>
                      <Dialog open={iacDeployFormOpen} onOpenChange={(open) => { setIacDeployFormOpen(open); if (!open) { setIacDeployPassword(""); setIacDeployRdpSource(""); } }}>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <Rocket className="w-5 h-5 text-[#0078d4]" />
                              Deploy to Azure
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            <p className="text-sm text-slate-600">
                              Deploys the selected services to the McCain Azure subscription via Container App service principal.
                            </p>
                            <div className="space-y-1.5">
                              <Label>Admin Password <span className="text-red-500">*</span></Label>
                              <Input
                                type="password"
                                value={iacDeployPassword}
                                onChange={(e) => setIacDeployPassword(e.target.value)}
                                placeholder="Min 12 chars, uppercase, number, symbol"
                              />
                            </div>
                            {iacSelectedServices.includes("vm") && (
                              <div className="space-y-1.5">
                                <Label>Allowed RDP Source CIDR <span className="text-red-500">*</span></Label>
                                <Input
                                  value={iacDeployRdpSource}
                                  onChange={(e) => setIacDeployRdpSource(e.target.value)}
                                  placeholder="e.g. 203.0.113.10/32"
                                  className="font-mono text-xs"
                                />
                                <p className="text-[11px] text-slate-500">Only public IPs are accepted. Use <code>whatismyip.com</code> to find yours.</p>
                              </div>
                            )}
                            {iacDeployError && (
                              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 space-y-1">
                                <p>{iacDeployError}</p>
                                {iacDeployError.toLowerCase().includes("subscription") && (
                                  <p className="text-xs">
                                    Go to{" "}
                                    <button
                                      type="button"
                                      className="underline font-medium text-red-700 hover:text-red-900"
                                      onClick={() => { setIacDeployFormOpen(false); setLocation("/integrations"); }}
                                    >
                                      Integrations → Azure
                                    </button>{" "}
                                    to configure your Azure Service Principal credentials.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIacDeployFormOpen(false)}>Cancel</Button>
                            <Button
                              disabled={!iacDeployPassword || (iacSelectedServices.includes("vm") && !iacDeployRdpSource) || iacDeployLoading}
                              onClick={() => { void handleIacDeploy(); }}
                              style={{ background: "#0078d4", color: "#fff" }}
                            >
                              {iacDeployLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
                              Start Deployment
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}

                  {/* Deployment Status */}
                  {iacDeploymentId && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        {!iacDeployment || iacDeployment.status === "pending" || iacDeployment.status === "provisioning" ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        ) : iacDeployment.status === "succeeded" ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">
                          Deployment {iacDeployment?.status ?? "queued"} (ID {iacDeploymentId})
                        </span>
                      </div>
                      {iacDeployment?.resource_group && (
                        <p className="text-xs text-slate-600">Resource Group: <code className="font-mono">{iacDeployment.resource_group}</code></p>
                      )}
                      {iacDeployment?.status === "failed" && iacDeployment.error_message && (
                        <p className="text-xs text-red-600">{iacDeployment.error_message}</p>
                      )}
                      {(!iacDeployment || ["pending", "provisioning"].includes(iacDeployment.status)) && (
                        <p className="text-xs text-slate-500">Polling every 5s — do not close this page.</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* DevSecOps Approval */}
            <div className="space-y-3 border-t border-indigo-200 pt-4">
              <h4 className="text-sm font-semibold text-indigo-800">Infrastructure Deployment Sign-off Checklist</h4>
              <p className="text-xs text-slate-600">
                Complete all checklist items before approving. All gates must pass before proceeding to Observability.
              </p>
              <div className="rounded-lg border border-indigo-100 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-indigo-100">
                  <span className="text-xs font-medium text-indigo-700">
                    {caReviewChecks.length}/{CA_REVIEW_CHECKLIST.length} items confirmed
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                    onClick={() =>
                      setCaReviewChecks(
                        caReviewChecks.length === CA_REVIEW_CHECKLIST.length
                          ? []
                          : [...CA_REVIEW_CHECKLIST],
                      )
                    }
                  >
                    {caReviewChecks.length === CA_REVIEW_CHECKLIST.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                {CA_REVIEW_CHECKLIST.map((item) => {
                  const checked = caReviewChecks.includes(item);
                  return (
                    <label
                      key={item}
                      className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 cursor-pointer select-none transition-colors ${checked ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        className="accent-indigo-600 w-3.5 h-3.5 mt-0.5 shrink-0"
                        checked={checked}
                        onChange={() =>
                          setCaReviewChecks((prev) =>
                            prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
                          )
                        }
                      />
                      <span className={`text-xs leading-relaxed ${checked ? "text-indigo-800 line-through decoration-indigo-400" : "text-slate-700"}`}>
                        {item}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="space-y-1.5">
                <Label>Review Notes (optional)</Label>
                <Textarea
                  value={devsecopsComments}
                  onChange={(e) => setDevsecopsComments(e.target.value)}
                  placeholder="Document pipeline readiness, policy gate results, dual-approval confirmation…"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={!!actionLoading || caReviewChecks.length < CA_REVIEW_CHECKLIST.length}
                  onClick={() => doAction("devsecops-review", { action: "approve", comments: devsecopsComments })}
                  title={caReviewChecks.length < CA_REVIEW_CHECKLIST.length ? "Complete all checklist items before approving" : undefined}
                >
                  {actionLoading === "devsecops-review" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Approve — Proceed to Observability
                </Button>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  disabled={!!actionLoading}
                  onClick={() => doAction("devsecops-review", { action: "reject", comments: devsecopsComments })}
                >
                  {actionLoading === "devsecops-review" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Reject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DevSecOps decision display */}
      {(["devsecops_approved", "devsecops_rejected", "finops_active"].includes(request.status)) && request.devsecopsApproverName && (
        <Card className={request.status === "devsecops_rejected" ? "border-red-200" : "border-indigo-200"}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {request.status !== "devsecops_rejected"
                ? <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
              <div>
                <p className={`font-medium text-sm ${request.status !== "devsecops_rejected" ? "text-indigo-800" : "text-red-800"}`}>
                  Infrastructure Deployment {request.status !== "devsecops_rejected" ? "Approved" : "Rejected"} by {request.devsecopsApproverName}
                </p>
                {request.devsecopsApprovedAt && (
                  <p className="text-xs text-slate-500 mt-0.5">{new Date(request.devsecopsApprovedAt).toLocaleString()}</p>
                )}
                {request.devsecopsComments && (
                  <div className="mt-2 p-2 bg-white rounded border text-sm text-slate-700">
                    <MessageSquare className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
                    {request.devsecopsComments}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase 5 — Observability Setup (Cloud only, CA signs off after Infrastructure) */}
      {canObservability && (() => {
        const OBS_CHECKLIST = [
          { id: "monitor",   label: "Azure Monitor workspace linked to all provisioned resources" },
          { id: "insights",  label: "Application Insights configured and telemetry flowing" },
          { id: "alerts",    label: "Alert rules defined: availability, error rate, and resource thresholds" },
          { id: "logs",      label: "Log Analytics retention policy set (minimum 30 days)" },
          { id: "dashboard", label: "Monitoring dashboard created in Azure Portal" },
          { id: "oncall",    label: "On-call escalation path and runbook documented" },
        ];
        const allObsChecked = OBS_CHECKLIST.every((item) => obsChecks.includes(item.id));
        return (
          <Card id="observability-section" className="border-2 border-cyan-200 shadow-sm">
            <div className="px-6 py-4 border-b border-cyan-100 flex items-center gap-3 flex-wrap" style={{ background: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-cyan-500">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-base">Phase 4 — Observability Setup</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Confirm that monitoring, alerting, and logging are configured before activating Cost Management.
                </p>
              </div>
              <span className="text-[10px] font-mono text-cyan-700 border border-cyan-300 bg-cyan-100 px-2 py-0.5 rounded shrink-0">Cloud Architect</span>
            </div>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {OBS_CHECKLIST.map((item) => {
                  const checked = obsChecks.includes(item.id);
                  return (
                    <label key={item.id} htmlFor={`obs-${item.id}`} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none ${checked ? "bg-cyan-50 border-cyan-200" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`}>
                      <input
                        type="checkbox"
                        id={`obs-${item.id}`}
                        checked={checked}
                        onChange={() => setObsChecks((prev) => checked ? prev.filter((x) => x !== item.id) : [...prev, item.id])}
                        className="mt-0.5 shrink-0 w-4 h-4 accent-cyan-600"
                      />
                      <span className={`text-sm leading-snug ${checked ? "text-cyan-800 line-through decoration-cyan-400 decoration-1" : "text-slate-700"}`}>{item.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all duration-500 bg-cyan-500" style={{ width: `${(obsChecks.length / OBS_CHECKLIST.length) * 100}%` }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Textarea
                  placeholder="Add any observability notes, tool links, or exceptions…"
                  rows={3}
                  value={obsComments}
                  onChange={(e) => setObsComments(e.target.value)}
                  className="resize-none"
                />
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                {!allObsChecked && (
                  <p className="text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Complete all {OBS_CHECKLIST.length} items to confirm Observability
                  </p>
                )}
                <Button
                  disabled={!allObsChecked || !!actionLoading}
                  className="ml-auto font-semibold px-6"
                  style={allObsChecked ? { background: "#06b6d4", color: "#fff" } : {}}
                  onClick={() => doAction("observability-complete", { comments: obsComments.trim() || undefined })}
                >
                  {actionLoading === "observability-complete"
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                    : <><ShieldCheck className="w-4 h-4 mr-2" />Confirm Observability Setup</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Observability decision display */}
      {["observability_approved", "finops_active"].includes(request.status) && request.observabilityReviewerName && (
        <Card className="border-cyan-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-cyan-800">Observability confirmed by {request.observabilityReviewerName}</p>
                {request.observabilityReviewedAt && (
                  <p className="text-xs text-slate-500 mt-0.5">{new Date(request.observabilityReviewedAt).toLocaleString()}</p>
                )}
                {request.observabilityComments && (
                  <div className="mt-2 p-2 bg-white rounded border text-sm text-slate-700">
                    <MessageSquare className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
                    {request.observabilityComments}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase 6 — FinOps Activation (Cloud: after Observability | 3rd Party: after ARR approval) */}
      {canFinOps && (
        <Card id="finops-section" className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              Phase 4 — Cost Management Activation
              <span className="ml-auto text-[10px] font-mono text-emerald-600 border border-emerald-300 bg-emerald-100 px-2 py-0.5 rounded">Enterprise Architect · Ongoing</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isCloudTenant ? (
              <p className="text-sm text-slate-700">
                Infrastructure Deployment is approved. Activate Cost Management monitoring — this enrolls the workload in McCain's Azure Cost Management governance framework, tagging, and monthly chargeback reporting.
              </p>
            ) : (
              <p className="text-sm text-slate-700">
                This <strong>{request.deploymentModel}</strong> solution is approved. Activate Cost Management monitoring to track costs under McCain's cost governance framework and monthly chargeback reporting.
              </p>
            )}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!!actionLoading}
              onClick={() => doAction("finops-activate")}
            >
              {actionLoading === "finops-activate" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
              Activate Cost Management
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Request fully complete — prominent completion banner */}
      {request.status === "finops_active" && (
        <div className="rounded-2xl border-2 border-emerald-400 overflow-hidden shadow-md">
          <div className="px-6 py-5 text-center space-y-2" style={{ background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)" }}>
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-sm">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-emerald-900">Request Complete</h3>
            <p className="text-sm text-emerald-800 max-w-sm mx-auto">
              All phases are complete. This workload is fully onboarded into McCain's governance framework and actively monitored.
            </p>
          </div>
          {request.finopsActivatedBy && (
            <div className="bg-white px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">
                Cost Management activated by{" "}
                <span className="font-semibold text-slate-800">{request.finopsActivatedBy}</span>
              </span>
              {request.finopsActivatedAt && (
                <span className="text-xs text-slate-400">{new Date(request.finopsActivatedAt).toLocaleString()}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Discussion & Comments ── */}
      {!isRequestor && <Card className="border-slate-200">
        <CardHeader className="pb-2 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              Discussion
              {events.filter((e) => e.eventType === "comment").length > 0 && (
                <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                  {events.filter((e) => e.eventType === "comment").length}
                </span>
              )}
            </CardTitle>
            {(isEA || isAdmin) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5 text-slate-500"
                onClick={() => { void handleDownloadAuditReport(); }}
              >
                <Download className="w-3.5 h-3.5" />
                Audit Report
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Existing comments thread */}
          {events.filter((e) => e.eventType === "comment").length > 0 && (
            <div className="space-y-3">
              {events.filter((e) => e.eventType === "comment").map((ev) => (
                <div key={ev.id} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                    {ev.actorName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-slate-800">{ev.actorName}</span>
                      <span className="text-[10px] text-slate-400">{new Date(ev.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">
                      {ev.description}
                    </div>
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-100" />
            </div>
          )}
          {/* Add comment */}
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment or note for the team…"
            rows={2}
            className="text-sm"
          />
          <Button
            size="sm"
            disabled={!commentText.trim() || submittingComment}
            onClick={() => { void handleAddComment(); }}
          >
            {submittingComment
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <MessageSquare className="w-3.5 h-3.5 mr-1.5" />}
            Post Comment
          </Button>
        </CardContent>
      </Card>}

      {/* ─── Activity Timeline (EA/CA/admin) ── */}
      {!isRequestor && events.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Activity Log
              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{events.length} events</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ActivityTimeline events={events} />
          </CardContent>
        </Card>
      )}

      {/* Request Details — requestors only (admins see the full "Submitted Request Details" card above) */}
      {isRequestor && (<Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Request Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Business Unit:</span>
              <span>{request.businessUnit}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="font-medium">App Type:</span>
              <span>{request.applicationType}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <User className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Requestor:</span>
              <span>{request.requestorName}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Submitted:</span>
              <span>{new Date(request.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Description</p>
            <p className="text-sm text-slate-600 leading-relaxed">{request.description}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Business Justification</p>
            <p className="text-sm text-slate-600 leading-relaxed">{request.businessJustification}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Target Environments</p>
              <div className="flex flex-wrap gap-1.5">
                {request.targetEnvironments.map((e) => (
                  <span key={e} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{e}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Azure Regions</p>
              <div className="flex flex-wrap gap-1.5">
                {request.azureRegions.map((r) => (
                  <span key={r} className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-800 rounded-full">{r}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
            <div className="flex items-center gap-2 text-slate-600">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-medium">DTSLT Leader:</span>
              <span>{request.dtsltLeader || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-medium">Expected User Base:</span>
              <span>{request.expectedUserBase || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-medium">Target Go-Live Date:</span>
              <span>
                {request.targetGoLiveDate
                  ? (() => {
                      const [y, m, d] = request.targetGoLiveDate.split("-");
                      return `${d}/${m}/${y}`;
                    })()
                  : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Cloud className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-medium">Deployment Model:</span>
              <span>{request.deploymentModel || "—"}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}



