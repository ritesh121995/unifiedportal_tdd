import { useEffect, useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Clock, MessageSquare,
  Cloud, FileText, Calendar, User, Building2, AlertTriangle, Info,
  Send, ShieldCheck, ShieldX, Play, Flag, Network,
  Code2, DollarSign, Rocket, Trash2, RefreshCw, PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/store/auth-context";
import { useAppContext, type FormDraft } from "@/store/app-context";
import { getApiBase } from "@/lib/api-base";
import { StatusBadge, type RequestStatus } from "@/components/RequestStatusBadge";
import { computeArchitectRecommendations, computeRisksAndInsights, type FormSnapshot } from "@/lib/architect-utils";

interface StoredTddFormData {
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
  // Impact assessment fields (stored in tddFormData JSON blob)
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
  tddSubmissionId: number | null;
  // Phase 4
  devsecopsApproverName: string | null;
  devsecopsApprovedAt: string | null;
  devsecopsComments: string | null;
  // Phase 5
  finopsActivatedAt: string | null;
  finopsActivatedBy: string | null;
  tddFormData: StoredTddFormData | null;
  createdAt: string;
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

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "text-red-600",
  High: "text-orange-600",
  Medium: "text-yellow-600",
  Low: "text-slate-500",
};

const EVENT_ICONS: Record<string, React.ElementType> = {
  submitted:           Send,
  ea_triage:           Clock,
  ea_approved:         ShieldCheck,
  ea_rejected:         ShieldX,
  risk_approved:       ShieldCheck,
  risk_rejected:       ShieldX,
  tdd_started:         Play,
  tdd_completed:       Flag,
  devsecops_approved:  Code2,
  devsecops_rejected:  ShieldX,
  finops_active:       DollarSign,
  comment:             MessageSquare,
};

const EVENT_COLORS: Record<string, string> = {
  submitted:           "bg-yellow-100 text-yellow-600 border-yellow-200",
  ea_triage:           "bg-orange-100 text-orange-600 border-orange-200",
  ea_approved:         "bg-green-100 text-green-600 border-green-200",
  ea_rejected:         "bg-red-100 text-red-600 border-red-200",
  risk_approved:       "bg-teal-100 text-teal-600 border-teal-200",
  risk_rejected:       "bg-red-100 text-red-600 border-red-200",
  tdd_started:         "bg-blue-100 text-blue-600 border-blue-200",
  tdd_completed:       "bg-purple-100 text-purple-600 border-purple-200",
  devsecops_approved:  "bg-indigo-100 text-indigo-600 border-indigo-200",
  devsecops_rejected:  "bg-red-100 text-red-600 border-red-200",
  finops_active:       "bg-emerald-100 text-emerald-600 border-emerald-200",
  comment:             "bg-slate-100 text-slate-500 border-slate-200",
};

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
  const [domainArchsConsulted, setDomainArchsConsulted] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [cloningRequest, setCloningRequest] = useState(false);

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
      const saved = req?.tddFormData?.environmentCidrs;
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
      if (req && ["submitted", "ea_triage"].includes(req.status) && req.tddFormData) {
        const snap: FormSnapshot = {
          deploymentModel:          req.deploymentModel          ?? "",
          networkPosture:           req.tddFormData?.networkPosture           ?? "",
          securityImpact:           req.tddFormData?.securityImpact           ?? "",
          dataImpact:               req.tddFormData?.dataImpact               ?? "",
          integrationImpact:        req.tddFormData?.integrationImpact        ?? "",
          regulatoryImpact:         req.tddFormData?.regulatoryImpact         ?? "",
          aiImpact:                 req.tddFormData?.aiImpact                 ?? "",
          haEnabled:                req.tddFormData?.haEnabled                ?? false,
          drEnabled:                req.tddFormData?.drEnabled                ?? false,
          securityAssessmentRequired: req.tddFormData?.securityAssessmentRequired ?? false,
          integrationRequired:      req.tddFormData?.integrationRequired      ?? false,
          costTShirtSize:           req.tddFormData?.costTShirtSize           ?? "",
          businessCriticality:      req.tddFormData?.businessCriticality      ?? "",
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

  // Compute architect team + risk panels from submitted form data
  const formSnapshot = useMemo((): FormSnapshot | null => {
    if (!request) return null;
    return {
      deploymentModel:            request.deploymentModel                        ?? "",
      networkPosture:             request.tddFormData?.networkPosture            ?? "",
      securityImpact:             request.tddFormData?.securityImpact            ?? "",
      dataImpact:                 request.tddFormData?.dataImpact                ?? "",
      integrationImpact:          request.tddFormData?.integrationImpact         ?? "",
      regulatoryImpact:           request.tddFormData?.regulatoryImpact          ?? "",
      aiImpact:                   request.tddFormData?.aiImpact                  ?? "",
      haEnabled:                  request.tddFormData?.haEnabled                 ?? false,
      drEnabled:                  request.tddFormData?.drEnabled                 ?? false,
      securityAssessmentRequired: request.tddFormData?.securityAssessmentRequired ?? false,
      integrationRequired:        request.tddFormData?.integrationRequired        ?? false,
      costTShirtSize:             request.tddFormData?.costTShirtSize             ?? "",
      businessCriticality:        request.tddFormData?.businessCriticality        ?? "",
      applicationType:            request.applicationType                         ?? "",
    };
  }, [request]);

  const architectRecs  = useMemo(() => formSnapshot ? computeArchitectRecommendations(formSnapshot) : [], [formSnapshot]);
  const riskInsights   = useMemo(() => formSnapshot ? computeRisksAndInsights(formSnapshot)         : [], [formSnapshot]);

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

  const handleGenerateTDD = async () => {
    if (!request) return;
    setError("");

    // Validate — at least one CIDR must be provided
    const environments = request.targetEnvironments as string[];
    const missingCidrs = environments.filter((e) => !cidrs[e]?.trim());
    if (missingCidrs.length > 0) {
      setError(`Please enter a Network CIDR for: ${missingCidrs.join(", ")}`);
      return;
    }

    const stored = request.tddFormData ?? {};
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
      // Personnel — use only what was captured in the form; empty = left blank in TDD
      businessOwner:                stored.businessOwner              ?? "",
      businessOwnerEmail:           stored.businessOwnerEmail         ?? "",
      itOwner:                      stored.itOwner                    ?? "",
      technologyOwnerEmail:         stored.technologyOwnerEmail       ?? "",
      applicationSupportManager:    stored.applicationSupportManager  ?? "",
      infrastructureSupportManager: stored.infrastructureSupportManager ?? "",
      glAccountOwnerEmail:          stored.glAccountOwnerEmail        ?? "",
      categoryOwner:                stored.categoryOwner              ?? "",
      // Billing — use only what was captured; empty = left blank in TDD
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

    // Mark TDD as in-progress and persist CIDRs
    await doAction("start-tdd", { environmentCidrs: cidrs });

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

  // Derive workflow type from deployment model
  const THIRD_PARTY_MODELS = ["SaaS Solution", "Vendor Tenant", "Other 3rd Party Solution"];
  const isCloudTenant = request.deploymentModel === "Cloud (McCain Tenant)";
  const isThirdParty  = THIRD_PARTY_MODELS.includes(request.deploymentModel ?? "");

  // Simple app fast-track detection
  const isSimpleFastTrack = isCloudTenant &&
    (request.tddFormData as Record<string, unknown> | null)?.appComplexity === "Simple";

  const canEAReview    = isEA && ["submitted", "ea_triage"].includes(request.status) && !isSimpleFastTrack;
  const canEATriage    = isEA && request.status === "submitted" && !isSimpleFastTrack;
  // TDD generation triggers directly from ea_approved (Risk Analysis removed as separate gate)
  const canGenerateTDD = isCA && request.status === "ea_approved" && isCloudTenant;
  const canViewTDD     = ["tdd_in_progress", "tdd_completed"].includes(request.status) && isCA;
  const canDevSecOps   = isCA && request.status === "tdd_completed";
  // FinOps: from devsecops_approved (Cloud) OR ea_approved (3rd Party)
  const canFinOps      = isEA && (
    (isCloudTenant  && request.status === "devsecops_approved") ||
    (isThirdParty   && request.status === "ea_approved")
  );

  // Phase progress steps — dynamic based on workflow type
  const PHASE_STEPS_CLOUD: { label: string; statuses: string[]; doneStatuses: string[] }[] = [
    { label: "ARR",       statuses: ["submitted", "ea_triage", "modification_requested"], doneStatuses: ["ea_approved", "ea_rejected", "tdd_in_progress", "tdd_completed", "devsecops_approved", "devsecops_rejected", "finops_active"] },
    { label: "TDD",       statuses: ["ea_approved", "tdd_in_progress"], doneStatuses: ["tdd_completed", "devsecops_approved", "devsecops_rejected", "finops_active"] },
    { label: "DevSecOps", statuses: ["tdd_completed"], doneStatuses: ["devsecops_approved", "devsecops_rejected", "finops_active"] },
    { label: "FinOps",    statuses: ["devsecops_approved"], doneStatuses: ["finops_active"] },
  ];
  const PHASE_STEPS_3P: { label: string; statuses: string[]; doneStatuses: string[] }[] = [
    { label: "ARR",    statuses: ["submitted", "ea_triage", "modification_requested"], doneStatuses: ["ea_approved", "ea_rejected", "finops_active"] },
    { label: "FinOps", statuses: ["ea_approved"], doneStatuses: ["finops_active"] },
  ];
  const PHASE_STEPS = isThirdParty ? PHASE_STEPS_3P : PHASE_STEPS_CLOUD;

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
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
              {request.status === "tdd_in_progress" && (
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">TDD In Progress</span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {request.status === "ea_approved"
                ? "This simple application was automatically approved by the system. Network CIDRs have been pre-filled — a Cloud Architect can click Generate TDD below immediately, no triage or manual EA review required."
                : "This simple application bypassed the standard EA triage queue and was fast-tracked straight to TDD generation."}
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

      {/* ─── Phase Status View (requestors + admins) ─────────────────── */}
      {(isRequestor || isAdmin) && (() => {
        const s = request.status;

        type PhaseStatus = "pending" | "active" | "done" | "rejected" | "revision" | "skipped";

        const p1Status: PhaseStatus =
          ["ea_approved", "tdd_in_progress", "tdd_completed", "devsecops_approved", "devsecops_rejected", "finops_active"].includes(s) ? "done"
          : s === "ea_rejected" ? "rejected"
          : s === "modification_requested" ? "revision"
          : "active";

        const p2Status: PhaseStatus = !isCloudTenant ? "skipped"
          : ["tdd_completed", "devsecops_approved", "devsecops_rejected", "finops_active"].includes(s) ? "done"
          : s === "tdd_in_progress" ? "active"
          : s === "ea_approved" ? "pending"
          : "pending";

        const p3Status: PhaseStatus = !isCloudTenant ? "skipped"
          : s === "devsecops_approved" || s === "finops_active" ? "done"
          : s === "devsecops_rejected" ? "rejected"
          : s === "tdd_completed" ? "active"
          : "pending";

        const p4Status: PhaseStatus =
          s === "finops_active" ? "done"
          : (isCloudTenant && s === "devsecops_approved") || (isThirdParty && s === "ea_approved") ? "active"
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
            <PhaseCard
              phase={1}
              title="Architecture Review Request (ARR)"
              desc={
                p1Status === "active"   ? "Your submission is currently being reviewed by the Enterprise Architecture team." :
                p1Status === "done"     ? "EA review is complete and your request has been approved to proceed." :
                p1Status === "revision" ? "The Enterprise Architect has reviewed your submission and is requesting changes before proceeding." :
                "Your request was not approved at this stage. See the EA comments below."
              }
              status={p1Status}
              eaName={request.eaReviewerName ?? undefined}
              eaComment={request.eaComments ?? undefined}
              adminContinuePath="/ea-queue"
              adminContinueLabel="Go to EA Review Queue"
            />
            {isCloudTenant && (
              <PhaseCard
                phase={2}
                title="Technical Design Document (TDD)"
                desc={p2Status === "done" ? "The Technical Design Document has been completed and approved." : p2Status === "active" ? "The Cloud Architect is currently preparing the Technical Design Document." : "Awaiting completion of Phase 1 before TDD can begin."}
                status={p2Status}
                adminContinuePath="#tdd-action-section"
                adminContinueLabel="Generate / Continue TDD"
              />
            )}
            {isCloudTenant && (
              <PhaseCard
                phase={3}
                title="DevSecOps / IaC Approval"
                desc={p3Status === "done" ? "DevSecOps and Infrastructure-as-Code pipeline has been approved." : p3Status === "active" ? "The completed TDD is under DevSecOps review for pipeline and security gate approval." : p3Status === "rejected" ? "DevSecOps review was not approved. The Cloud Architect team will be in contact." : "This phase begins after the TDD is completed and reviewed."}
                status={p3Status}
                adminContinuePath="#devsecops-section"
                adminContinueLabel="Review & Approve"
              />
            )}
            <PhaseCard
              phase={isCloudTenant ? 4 : 2}
              title="FinOps Activation"
              desc={p4Status === "done" ? "Your workload has been approved and is ready for provisioning. FinOps controls are active." : p4Status === "active" ? "Your workload is in the final FinOps activation stage. Cost allocation and budget controls are being configured." : "FinOps activation begins once all prior phases are approved."}
              status={p4Status}
              adminContinuePath="/phase/5"
              adminContinueLabel="Go to FinOps"
            />

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
              {request.tddFormData?.businessCriticality && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Business Criticality</p>
                  <p className="text-sm font-medium text-slate-800">{request.tddFormData.businessCriticality}</p>
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
              {request.tddFormData?.solutionArchitecture && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Solution Architecture</p>
                  <p className="text-sm text-slate-800">{request.tddFormData.solutionArchitecture}</p>
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
              {request.tddFormData?.networkPosture && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Network Posture</p>
                  <p className="text-sm font-medium text-slate-800">{request.tddFormData.networkPosture}</p>
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

      {/* Activity & Comments — placed here so it's accessible without scrolling past action cards */}
      {(() => {
        const visibleEvents = isRequestor
          ? events.filter((e) => e.actorRole !== "system")
          : events;
        const hasEvents = visibleEvents.length > 0;
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                {isRequestor ? "Comments" : "Activity & Comments"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasEvents && <ActivityTimeline events={visibleEvents} />}
              <>
                <div className={`flex gap-2 ${hasEvents ? "pt-2 border-t border-slate-100" : ""}`}>
                    <Textarea
                      placeholder={isRequestor ? "Add a note for the CCoE team…" : "Add a comment or note…"}
                      rows={2}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="text-sm resize-none flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAddComment();
                      }}
                    />
                    <Button
                      size="sm"
                      className="self-end h-9 px-4"
                      style={{ background: "#FFCD00", color: "#1a1a2e" }}
                      onClick={handleAddComment}
                      disabled={submittingComment || !commentText.trim()}
                    >
                      {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400">Press Ctrl+Enter to submit</p>
                </>
            </CardContent>
          </Card>
        );
      })()}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Phase 1 — ARR / EA Review Panel */}
      {canEAReview && (
        <Card className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: "#b49000" }} />
              Phase 1 — Architecture Review Request (ARR)
              <span className="ml-auto text-[10px] font-mono text-yellow-700 border border-yellow-300 bg-yellow-50 px-2 py-0.5 rounded">
                {isThirdParty ? "EA → FinOps" : "EA → TDD → DevSecOps → FinOps"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isThirdParty && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <strong>3rd Party / Vendor workflow:</strong> Approving this ARR will route directly to FinOps activation — no TDD or DevSecOps phases.
              </div>
            )}
            {/* AI-Recommended Architect Team + Risk Insights */}
            {architectRecs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Architect Team Panel */}
                <div className="rounded-lg border border-yellow-200 bg-yellow-50/60 p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-yellow-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    AI-Recommended Architect Team
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

                {/* Risk & Insights Panel */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Risk &amp; Hosting Insights
                  </p>
                  {riskInsights.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No risk flags for this workload.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {riskInsights.map((risk, i) => {
                        const severityClass =
                          risk.severity === "high"   ? "border-red-200 bg-red-50"    :
                          risk.severity === "medium" ? "border-amber-200 bg-amber-50" :
                          "border-blue-200 bg-blue-50";
                        const iconClass =
                          risk.severity === "high"   ? "text-red-500"    :
                          risk.severity === "medium" ? "text-amber-500"  :
                          "text-blue-500";
                        const RiskIcon = risk.severity === "info" ? Info : AlertTriangle;
                        return (
                          <div key={i} className={`flex gap-2 items-start rounded-md border px-2.5 py-1.5 text-xs ${severityClass}`}>
                            <RiskIcon className={`w-3 h-3 mt-0.5 shrink-0 ${iconClass}`} />
                            <div>
                              <span className="font-semibold text-slate-800">{risk.title}</span>
                              <span className="ml-1 text-[10px] font-medium uppercase tracking-wide opacity-70">[{risk.category}]</span>
                              <p className="text-[10px] text-slate-600 mt-0.5 leading-snug line-clamp-2">{risk.detail}</p>
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
                    eaComments,
                  ].filter(Boolean).join(" "),
                })}
              >
                {actionLoading === "review" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Approve ARR
              </Button>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={!!actionLoading}
                onClick={() => doAction("review", { action: "reject", comments: eaComments })}
              >
                {actionLoading === "review" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                Reject ARR
              </Button>
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

      {/* Phase 2 — Network CIDR + Generate TDD (Cloud Tenant only) */}
      {canGenerateTDD && (
        <Card id="tdd-action-section" className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="w-4 h-4" style={{ color: "#b49000" }} />
              Phase 2 — Network Configuration &amp; TDD Generation
              <span className="ml-auto text-[10px] font-mono text-yellow-700 border border-yellow-300 bg-yellow-50 px-2 py-0.5 rounded">Cloud Architect · 1–2 Hours</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-700">
              This request has been approved. Network CIDRs have been pre-filled with standard McCain address ranges — adjust if needed, then click <strong>Generate TDD</strong>.
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
              onClick={handleGenerateTDD}
            >
              {actionLoading === "start-tdd" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
              ) : (
                <><FileText className="w-4 h-4 mr-2" />Generate TDD</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* View / Continue TDD */}
      {canViewTDD && (
        <Card id="tdd-action-section" className="border-purple-200 bg-purple-50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-purple-800 text-sm">
                {request.status === "tdd_completed" ? "TDD is complete — Awaiting DevSecOps sign-off" : "TDD is in progress"}
              </p>
              <p className="text-xs text-purple-600">
                {request.status === "tdd_completed"
                  ? "Review the completed TDD, then proceed to Phase 4 DevSecOps approval below"
                  : "Continue working on the Technical Design Document"}
              </p>
            </div>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => setLocation(`/wizard/${request.id}`)}
            >
              <FileText className="w-4 h-4 mr-2" />
              {request.status === "tdd_completed" ? "View TDD" : "Continue TDD"}
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
              Phase 3 — DevSecOps / IaC Approval
              <span className="ml-auto text-[10px] font-mono text-indigo-600 border border-indigo-300 bg-indigo-100 px-2 py-0.5 rounded">Cloud Architect · 2 Weeks</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-700">
              TDD is complete and reviewed. Approve the DevSecOps / IaC deployment pipeline — this confirms the Terraform modules, pipeline gates (QA → STG → PRD), and Checkov policy scans are in order.
            </p>
            <div className="space-y-1.5">
              <Label>DevSecOps Review Notes (optional)</Label>
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
                disabled={!!actionLoading}
                onClick={() => doAction("devsecops-review", { action: "approve", comments: devsecopsComments })}
              >
                {actionLoading === "devsecops-review" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Approve — Proceed to FinOps
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
                  DevSecOps {request.status !== "devsecops_rejected" ? "Approved" : "Rejected"} by {request.devsecopsApproverName}
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

      {/* Phase 4 — FinOps Activation (Cloud: after DevSecOps | 3rd Party: after ARR approval) */}
      {canFinOps && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              Phase 4 — FinOps Activation
              <span className="ml-auto text-[10px] font-mono text-emerald-600 border border-emerald-300 bg-emerald-100 px-2 py-0.5 rounded">Enterprise Architect · Ongoing</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isCloudTenant ? (
              <p className="text-sm text-slate-700">
                DevSecOps / IaC deployment is approved. Activate FinOps monitoring — this enrolls the workload in McCain's Azure Cost Management governance framework, tagging, and monthly chargeback reporting.
              </p>
            ) : (
              <p className="text-sm text-slate-700">
                The ARR for this <strong>{request.deploymentModel}</strong> solution is approved. Activate FinOps monitoring to track vendor costs under McCain's cost governance framework and monthly chargeback reporting.
              </p>
            )}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!!actionLoading}
              onClick={() => doAction("finops-activate")}
            >
              {actionLoading === "finops-activate" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
              Activate FinOps Monitoring
            </Button>
          </CardContent>
        </Card>
      )}

      {/* FinOps active display */}
      {request.status === "finops_active" && request.finopsActivatedBy && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-emerald-800">
                  FinOps Monitoring Activated by {request.finopsActivatedBy}
                </p>
                {request.finopsActivatedAt && (
                  <p className="text-xs text-slate-500 mt-0.5">{new Date(request.finopsActivatedAt).toLocaleString()}</p>
                )}
                <p className="text-xs text-emerald-700 mt-1">Workload is fully onboarded and enrolled in cost governance.</p>
              </div>
            </div>
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
