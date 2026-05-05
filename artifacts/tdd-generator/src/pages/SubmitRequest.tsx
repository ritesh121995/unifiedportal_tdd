import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle, CalendarIcon,
  Users, AlertTriangle, Info, CheckCircle2, ChevronRight, Upload, X,
  HelpCircle, CheckSquare, ClipboardList, Eye, Save, Rocket,
} from "lucide-react";
import { computeArchitectRecommendations, computeRisksAndInsights } from "@/lib/architect-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getApiBase } from "@/lib/api-base";
import { useAuth } from "@/store/auth-context";

const DRAFT_KEY = "mccain_arr_draft_v1";

// Reusable help tooltip
function FieldHelp({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex items-center text-slate-400 hover:text-slate-600 transition-colors ml-1 align-middle">
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[280px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatDDMMYYYY(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function parseDateStr(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? undefined : dt;
}

const APP_TYPES: { value: string; label: string; desc: string; workflow: string; icon: string }[] = [
  {
    value: "New Application",
    label: "New Application",
    desc: "Building something brand new — no existing system to replace or enhance.",
    workflow: "Routed based on complexity: Simple → TDD directly, Complex → full EA review",
    icon: "🆕",
  },
  {
    value: "Enhancement / New Capability",
    label: "Enhancement / New Capability",
    desc: "Adding significant new features or capabilities to an existing application.",
    workflow: "EA review required — existing application details will be requested",
    icon: "✏️",
  },
  {
    value: "Cloud Migration",
    label: "Cloud Migration",
    desc: "Moving an existing on-premises or hosted application to Microsoft Azure.",
    workflow: "Fast-tracked to TDD — EA review not required for migrations",
    icon: "☁️",
  },
  {
    value: "Application Replacement",
    label: "Application Replacement",
    desc: "Replacing one system with another (new vendor, platform, or architecture).",
    workflow: "Full review: EA approval → TDD → DevSecOps → FinOps",
    icon: "🔄",
  },
  {
    value: "Application Decommissioning",
    label: "Application Decommissioning",
    desc: "Retiring and shutting down an existing application and its infrastructure.",
    workflow: "Lightweight review — dependency check, data disposal, cost sign-off. No TDD required.",
    icon: "🗄️",
  },
  {
    value: "Proof of Concept / Technology Evaluation",
    label: "Proof of Concept / Technology Evaluation",
    desc: "Evaluating a new technology, vendor, or architecture pattern before full commitment.",
    workflow: "Simplified review — scope-limited, no production deployment",
    icon: "🔬",
  },
];
const BUSINESS_CRITICALITY_OPTIONS = [
  { value: "Mission Critical",        label: "Mission Critical",        desc: "Must be available 24/7 — any outage causes major financial or safety impact" },
  { value: "Business Critical",       label: "Business Critical",       desc: "Core business operations depend on this — significant impact if down" },
  { value: "Business Operational",    label: "Business Operational",    desc: "Important but a short disruption is manageable" },
  { value: "Administrative Service",  label: "Administrative Service",  desc: "Internal / back-office tool — limited impact if temporarily unavailable" },
];
const ORGANIZATIONS = ["McCain Foods Limited", "Day & Ross"];
const LINE_OF_BUSINESS_OPTIONS = [
  "Digital Technology",
  "Digital Agriculture",
  "Digital Manufacturing",
  "Global Data and Analytics",
  "Digital Growth",
  "Security",
];
const SLT_LEADERS = ["Vipul Soni", "Prashant Jain", "Jay Agarwal"];
const ENVIRONMENTS = ["QA/UAT", "Prod"];
const REGIONS = [
  { id: "canadacentral", label: "Canada Central (Toronto)" },
  { id: "canadaeast", label: "Canada East (Quebec City)" },
];
const DEPLOYMENT_MODELS_CLOUD = ["Cloud (McCain Tenant)"];
const DEPLOYMENT_MODELS_THIRD_PARTY = [
  "SaaS Solution",
  "Vendor Tenant",
  "Other 3rd Party Solution",
];
const DEPLOYMENT_MODELS_OTHER = [
  "On-Premises (McCain Data Center)",
  "Hybrid",
];
const ALL_DEPLOYMENT_MODELS = [
  ...DEPLOYMENT_MODELS_CLOUD,
  ...DEPLOYMENT_MODELS_THIRD_PARTY,
  ...DEPLOYMENT_MODELS_OTHER,
];
const NETWORK_POSTURE_OPTIONS = ["Internal", "External", "Hybrid (Internal & External)"];
const COMMERCIAL_MODELS = ["Subscription", "Perpetual License", "Consumption-based", "Pay-per-use", "Other"];
const DATA_RESIDENCY_OPTIONS = ["Canada", "USA", "Europe", "Asia-Pacific", "Global / Multi-region", "Other"];
const SUPPORT_MODELS = ["Vendor-managed", "Shared (Vendor + McCain)", "McCain-managed"];
const HOSTING_PLATFORMS = [
  "Microsoft Azure (Vendor-hosted)",
  "AWS",
  "Google Cloud (GCP)",
  "Oracle Cloud",
  "IBM Cloud",
  "On-Premises (Vendor Data Center)",
  "On-Premises (McCain Data Center)",
  "Hybrid",
  "Other / Unknown",
];
const PROJECT_BUDGET_OPTIONS = [
  { value: "Under $100K CAD",        label: "Under $100K CAD",        desc: "Small initiative or pilot project" },
  { value: "$100K – $500K CAD",      label: "$100K – $500K CAD",      desc: "Medium-scale project or enhancement" },
  { value: "$500K – $1M CAD",        label: "$500K – $1M CAD",        desc: "Large project with significant scope" },
  { value: "Over $1M CAD",           label: "Over $1M CAD",           desc: "Enterprise-wide or multi-year program" },
];
const BUSINESS_VALUE_HYPOTHESIS_OPTIONS = [
  "Increased Revenue",
  "Reduced Costs",
  "Reduced Risk",
  "Improved Experience",
];
type ImpactOption = { value: string; label: string; desc: string; badge: string; info: string };

const IMPACT_NONE_STYLE = { badge: "bg-green-100 text-green-800", info: "bg-green-50 border-green-200 text-green-800" };
const IMPACT_LOW_STYLE = { badge: "bg-blue-100 text-blue-800", info: "bg-blue-50 border-blue-200 text-blue-800" };
const IMPACT_MED_STYLE = { badge: "bg-amber-100 text-amber-800", info: "bg-amber-50 border-amber-200 text-amber-800" };
const IMPACT_HIGH_STYLE = { badge: "bg-red-100 text-red-800", info: "bg-red-50 border-red-200 text-red-800" };
const IMPACT_TBD_STYLE = { badge: "bg-slate-100 text-slate-600", info: "bg-slate-50 border-slate-200 text-slate-600" };

const SECURITY_IMPACT_OPTIONS: ImpactOption[] = [
  { value: "None", label: "None", desc: "Solution is for internal use only, employs approved enterprise authentication, handles no sensitive or regulated data, and introduces no new network exposure.", ...IMPACT_NONE_STYLE },
  { value: "Low", label: "Low", desc: "Integrates with standard enterprise identity, has limited external connectivity, and does not introduce new security architecture patterns.", ...IMPACT_LOW_STYLE },
  { value: "Medium", label: "Medium", desc: "Introduces new external interfaces, processes sensitive internal data, employs new identity or access patterns, or expands privilege or access models.", ...IMPACT_MED_STYLE },
  { value: "High", label: "High", desc: "Requires internet-facing or external access, processes regulated or sensitive data (such as PII or financial data), involves OT/IT boundary integration, or introduces new enterprise security architecture.", ...IMPACT_HIGH_STYLE },
  { value: "To be Identified", label: "To be Identified", desc: "", ...IMPACT_TBD_STYLE },
];

const DATA_IMPACT_OPTIONS: ImpactOption[] = [
  { value: "None", label: "None", desc: "Only publicly available data is in scope, with no impact on systems of record, analytics, or data sharing.", ...IMPACT_NONE_STYLE },
  { value: "Low", label: "Low", desc: "Handles internal operational data, has limited reporting impact, and does not involve changes in data ownership.", ...IMPACT_LOW_STYLE },
  { value: "Medium", label: "Medium", desc: "Involves business-critical or cross-domain data, introduces new data domains or analytics solutions, enables data sharing across business functions, or results in master data creation or modification.", ...IMPACT_MED_STYLE },
  { value: "High", label: "High", desc: "Involves personal or regulated data, supports financial or compliance reporting, includes cross-border or regulated data movement, or introduces enterprise system of record.", ...IMPACT_HIGH_STYLE },
  { value: "To be Identified", label: "To be Identified", desc: "", ...IMPACT_TBD_STYLE },
];

const INTEGRATION_IMPACT_OPTIONS: ImpactOption[] = [
  { value: "None", label: "None", desc: "No integrations are involved, or only existing integrations/interfaces are used.", ...IMPACT_NONE_STYLE },
  { value: "Low", label: "Low", desc: "Includes a low number of integrations (2–3 systems) and utilizes standard enterprise integration patterns.", ...IMPACT_LOW_STYLE },
  { value: "Medium", label: "Medium", desc: "Requires integration with multiple systems, requires real-time or event-driven integrations, or involves cross-domain integrations.", ...IMPACT_MED_STYLE },
  { value: "High", label: "High", desc: "Requires external partner integrations, OT/IT convergence, or the introduction of new middleware or integration patterns.", ...IMPACT_HIGH_STYLE },
  { value: "To be Identified", label: "To be Identified", desc: "", ...IMPACT_TBD_STYLE },
];

const REGULATORY_IMPACT_OPTIONS: ImpactOption[] = [
  { value: "None", label: "None", desc: "No regulatory or compliance implications are present.", ...IMPACT_NONE_STYLE },
  { value: "Low", label: "Low", desc: "Only internal policy compliance is necessary.", ...IMPACT_LOW_STYLE },
  { value: "Medium", label: "Medium", desc: "Relevant to industry compliance or external audits (such as ISO, SOX, etc.), or quality or manufacturing compliance.", ...IMPACT_MED_STYLE },
  { value: "High", label: "High", desc: "Involves legal or safety regulations, financial reporting compliance, food safety compliance, or privacy regulations (such as GDPR).", ...IMPACT_HIGH_STYLE },
  { value: "To be Identified", label: "To be Identified", desc: "", ...IMPACT_TBD_STYLE },
];

const AI_IMPACT_OPTIONS: ImpactOption[] = [
  {
    value: "None",
    label: "None",
    desc: "No AI Usage — that includes:\n• No machine learning models (custom or SaaS)\n• No GenAI/LLM usage (OpenAI, Azure OpenAI, Copilot, etc.)\n• No AI APIs (vision, speech, NLP, OCR, recommendation engines)\n• No third-party product with embedded AI features being activated\n• No model training, inference, or prompt-based automation",
    ...IMPACT_NONE_STYLE,
  },
  {
    value: "Low",
    label: "Low",
    desc: "• Prebuilt AI capability (SaaS feature toggle)\n• No custom model training\n• No sensitive data used for model improvement\n• Human-in-the-loop required for final decision\n• AI output is non-binding or advisory",
    ...IMPACT_LOW_STYLE,
  },
  {
    value: "Medium",
    label: "Medium",
    desc: "• AI impacts workflow routing or prioritization\n• External users interact with AI capability\n• Sensitive internal data used for inference\n• Fine-tuned models or prompt engineering logic\n• Partial automation with human oversight",
    ...IMPACT_MED_STYLE,
  },
  {
    value: "High",
    label: "High",
    desc: "• AI makes or automates decisions with financial or legal implications\n• Used in regulated domains (finance, HR, legal, compliance)\n• Customer-facing AI with dynamic responses\n• Personal/sensitive data used in model training\n• Custom model training pipelines\n• Agentic workflows with tool access\n• AI influencing contractual or financial transactions",
    ...IMPACT_HIGH_STYLE,
  },
  { value: "To be Identified", label: "To be Identified", desc: "", ...IMPACT_TBD_STYLE },
];

const EMPTY_FORM = {
  title: "",
  applicationName: "",
  applicationType: "New Application",
  businessCriticality: "",
  solutionArchitecture: "",
  organization: "",
  lineOfBusiness: "",
  priority: "Medium",
  description: "",
  businessJustification: "",
  targetEnvironments: ["QA/UAT", "Prod"] as string[],
  azureRegions: ["canadacentral"] as string[],
  workloadTier: "Tier 2",
  haEnabled: false as boolean,
  drEnabled: false as boolean,
  sltLeader: "",
  expectedUserBase: "",
  targetGoLiveDate: "",
  deploymentModel: "",
  appComplexity: "",
  // Existing application details (for Enhancement / New Capability, Cloud Migration, Application Replacement, Decommissioning)
  existingAppName: "",
  existingAppId: "",
  existingAppPlatform: "",
  existingAppCurrentHost: "",
  existingAppUsers: "",
  existingAppOwner: "",
  existingAppDescription: "",
  // Personnel & Stakeholders
  businessOwner: "",
  businessOwnerEmail: "",
  itOwner: "",
  technologyOwnerEmail: "",
  applicationSupportManager: "",
  infrastructureSupportManager: "",
  requestorEmail: "",
  glAccountOwnerEmail: "",
  // Billing
  billingCompanyCode: "",
  billingPlant: "",
  billingCostObject: "",
  billingGlAccount: "",
  budgetTrackerReference: "",
  categoryOwner: "",
  // Cloud Tenant — Technical Architecture
  networkPosture: "Internal-Only",
  solution: "",
  applicationArchitecture: "",
  applicationFlow: "",
  frontendStack: "",
  backendStack: "",
  databaseStack: "",
  scalabilityRequirements: "",
  availabilityTarget: "99.9%",
  rto: "",
  rpo: "",
  // 3rd Party — Solution & Vendor Details
  vendorName: "",
  appTechStack: "",
  hostingPlatform: "",
  vendorContactName: "",
  vendorContactEmail: "",
  commercialModel: "",
  contractStartDate: "",
  contractEndDate: "",
  dataResidency: "",
  supportModel: "",
  integrationRequired: false as boolean,
  integrationDescription: "",
  securityAssessmentRequired: false as boolean,
  // 3rd Party — Ownership & Billing
  thirdPartyBusinessOwner: "",
  thirdPartyItOwner: "",
  thirdPartyBillingCode: "",
  thirdPartyGlAccount: "",
  // Project Overview — new fields
  costTShirtSize: "",
  businessValueHypothesis: [] as string[],
  inScopeRegions: [] as string[],
  securityImpact: "",
  securityImpactDetails: "",
  dataImpact: "",
  dataImpactDetails: "",
  integrationImpact: "",
  integrationImpactDetails: "",
  regulatoryImpact: "",
  regulatoryImpactDetails: "",
  aiImpact: "",
  aiImpactDetails: "",
};


export default function SubmitRequest() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState<number | null>(null);
  const [fastTracked, setFastTracked] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [regionInput, setRegionInput] = useState("");
  const [architectureDiagramFile, setArchitectureDiagramFile] = useState<File | null>(null);
  const [showPrepChecklist, setShowPrepChecklist] = useState(true);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const diagramInputRef = useRef<HTMLInputElement>(null);
  const isPrivileged = ["admin", "enterprise_architect", "cloud_architect"].includes(user?.role ?? "");

  const [form, setForm] = useState({ ...EMPTY_FORM });

  // ── 1. Auto-fill requestor email from session ──────────────────────────────
  useEffect(() => {
    if (user?.email) {
      setForm((prev) => prev.requestorEmail ? prev : { ...prev, requestorEmail: user.email ?? "" });
    }
  }, [user?.email]);

  // ── 7. Draft auto-save ─────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const { data, savedAt } = JSON.parse(saved);
        if (data && savedAt) { setShowDraftBanner(true); setDraftSavedAt(savedAt); }
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const hasContent = form.title || form.applicationName || form.description;
    if (!hasContent) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: form, savedAt: new Date().toLocaleTimeString() }));
      setDraftSavedAt(new Date().toLocaleTimeString());
    }, 1500);
    return () => clearTimeout(timer);
  }, [form]);

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) { const { data } = JSON.parse(saved); setForm({ ...EMPTY_FORM, ...data }); }
    } catch { /* ignore */ }
    setShowDraftBanner(false);
  };
  const discardDraft = () => { localStorage.removeItem(DRAFT_KEY); setShowDraftBanner(false); };

  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const update = (field: keyof typeof form, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.businessCriticality) { setError("Please select a Business Criticality."); return; }
    if (!form.targetGoLiveDate) { setError("Please pick a Target Go-Live Date."); return; }
    if (!form.deploymentModel) { setError("Please choose a Deployment Model."); return; }
    const isCloudSubmit = form.deploymentModel === "Cloud (McCain Tenant)";
    if (isCloudSubmit) {
      if (form.targetEnvironments.length === 0) { setError("Select at least one environment."); return; }
      if (form.azureRegions.length === 0) { setError("Select at least one Azure region."); return; }
      if (!form.applicationArchitecture.trim()) { setError("Please describe the application architecture."); return; }
      if (!form.applicationFlow.trim()) { setError("Please describe the application flow."); return; }
    } else {
      if (!form.vendorName.trim()) { setError("Please enter the Vendor / Solution Name."); return; }
      if (!form.appTechStack.trim()) { setError("Please describe the Tech Stack / Framework."); return; }
      if (!form.hostingPlatform) { setError("Please select a Hosting Platform."); return; }
      if (!form.commercialModel) { setError("Please select a Commercial Model."); return; }
      if (!form.dataResidency) { setError("Please select a Data Residency location."); return; }
      if (!form.supportModel) { setError("Please select a Support Model."); return; }
      if (!form.vendorContactName.trim()) { setError("Please enter the Vendor Contact Name."); return; }
      if (!form.vendorContactEmail.trim()) { setError("Please enter the Vendor Contact Email."); return; }
      if (!form.thirdPartyBusinessOwner.trim()) { setError("Please enter the Business Owner."); return; }
      if (!form.thirdPartyItOwner.trim()) { setError("Please enter the IT Owner."); return; }
    }
    if (!form.securityImpact) { setError("Please select a Security Impact level. This is mandatory for all requests."); return; }
    if (!form.dataImpact) { setError("Please select a Data Impact level. This is mandatory for all requests."); return; }
    const picked = parseDateStr(form.targetGoLiveDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (picked && picked < today) {
      setError("Target Go-Live Date must be a future date. Please pick a date from today onward.");
      return;
    }
    // Validations pass — show review screen instead of submitting directly
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmAndSubmit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to submit request");
      }
      const d = await res.json();
      localStorage.removeItem(DRAFT_KEY);
      setSubmittedRequestId(d.request?.id ?? null);
      setFastTracked(d.fastTrack === true);
      setSubmitted(true);
      setReviewing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setReviewing(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    const architects = computeArchitectRecommendations(form);
    const risks = computeRisksAndInsights(form);
    const requiredArchitects = architects.filter((a) => a.required);
    const recommendedArchitects = architects.filter((a) => !a.required);
    const highRisks = risks.filter((r) => r.severity === "high");
    const medRisks = risks.filter((r) => r.severity === "medium");
    const infoItems = risks.filter((r) => r.severity === "info");

    const SeverityBadge = ({ severity }: { severity: "high" | "medium" | "info" }) => {
      if (severity === "high") return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-medium">High Risk</Badge>;
      if (severity === "medium") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs font-medium">Medium Risk</Badge>;
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs font-medium">Advisory</Badge>;
    };

    const SeverityIcon = ({ severity }: { severity: "high" | "medium" | "info" }) => {
      if (severity === "high") return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
      if (severity === "medium") return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
      return <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />;
    };

    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 flex items-start gap-4">
          <div className="bg-green-100 p-3 rounded-full flex-shrink-0">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-green-900 mb-1">Request Submitted Successfully</h2>
            <p className="text-green-800 text-sm">
              Your Architecture Review Request for <span className="font-semibold">{form.applicationName || form.title}</span> has been submitted.
              The EA team will review it and coordinate with the relevant domain architects. You will be notified of next steps.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1 text-xs bg-white border border-green-200 text-green-800 rounded-full px-3 py-0.5 font-medium">
                <CheckCircle2 className="w-3 h-3" /> {form.deploymentModel}
              </span>
              <span className="inline-flex items-center gap-1 text-xs bg-white border border-green-200 text-green-800 rounded-full px-3 py-0.5 font-medium">
                <CheckCircle2 className="w-3 h-3" /> {form.businessCriticality}
              </span>
              {form.costTShirtSize && (
                <span className="inline-flex items-center gap-1 text-xs bg-white border border-green-200 text-green-800 rounded-full px-3 py-0.5 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> {form.costTShirtSize}
                </span>
              )}
            </div>
          </div>
        </div>

        {isPrivileged && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Architect Recommendations */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#1a1a2e]" />
              <h3 className="font-semibold text-[#1a1a2e] text-base">Architect Team Required</h3>
              <span className="ml-auto text-xs text-slate-500">{architects.length} role{architects.length !== 1 ? "s" : ""} identified</span>
            </div>

            {requiredArchitects.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Mandatory</p>
                {requiredArchitects.map((a) => (
                  <div key={a.role} className="rounded-lg border border-[#1a1a2e]/20 bg-white p-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FFCD00" }}>
                      <a.Icon className="w-4 h-4 text-[#1a1a2e]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-[#1a1a2e]">{a.role}</p>
                        <Badge className="bg-[#1a1a2e] text-white text-[10px] px-1.5 py-0">Required</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{a.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {recommendedArchitects.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Recommended</p>
                {recommendedArchitects.map((a) => (
                  <div key={a.role} className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-200">
                      <a.Icon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-700">{a.role}</p>
                        <Badge className="bg-slate-200 text-slate-600 text-[10px] px-1.5 py-0">Recommended</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{a.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Risks & Insights */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#1a1a2e]" />
              <h3 className="font-semibold text-[#1a1a2e] text-base">Risk & Hosting Insights</h3>
              <span className="ml-auto text-xs text-slate-500">{risks.length} item{risks.length !== 1 ? "s" : ""} identified</span>
            </div>

            {risks.length === 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                No significant risks or advisories identified based on your submission.
              </div>
            )}

            {highRisks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-red-600 uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> High Priority
                </p>
                {highRisks.map((r, i) => (
                  <div key={i} className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="flex items-start gap-2 mb-1">
                      <SeverityIcon severity="high" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-semibold text-red-900">{r.title}</p>
                          <SeverityBadge severity="high" />
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{r.category}</p>
                      </div>
                    </div>
                    <p className="text-xs text-red-800 leading-relaxed pl-6">{r.detail}</p>
                  </div>
                ))}
              </div>
            )}

            {medRisks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Medium Priority
                </p>
                {medRisks.map((r, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start gap-2 mb-1">
                      <SeverityIcon severity="medium" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-semibold text-amber-900">{r.title}</p>
                          <SeverityBadge severity="medium" />
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{r.category}</p>
                      </div>
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed pl-6">{r.detail}</p>
                  </div>
                ))}
              </div>
            )}

            {infoItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide flex items-center gap-1">
                  <Info className="w-3 h-3" /> Advisories
                </p>
                {infoItems.map((r, i) => (
                  <div key={i} className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-start gap-2 mb-1">
                      <SeverityIcon severity="info" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-semibold text-blue-900">{r.title}</p>
                          <SeverityBadge severity="info" />
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{r.category}</p>
                      </div>
                    </div>
                    <p className="text-xs text-blue-800 leading-relaxed pl-6">{r.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>}

        {/* Privileged — What Happens Next (with architect detail) */}
        {isPrivileged && (
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-[#1a1a2e] mb-3 flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> What Happens Next
              </p>
              <ol className="space-y-1.5 text-xs text-slate-600">
                <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-[#FFCD00] text-[#1a1a2e] flex items-center justify-center font-bold flex-shrink-0 text-[10px]">1</span>The Enterprise Architect reviews the submission and assigns the relevant domain architects identified above.</li>
                <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-[#FFCD00] text-[#1a1a2e] flex items-center justify-center font-bold flex-shrink-0 text-[10px]">2</span>Domain architects perform their respective reviews. Address all high-risk items before the review meeting.</li>
                <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-[#FFCD00] text-[#1a1a2e] flex items-center justify-center font-bold flex-shrink-0 text-[10px]">3</span>Architecture review meeting is scheduled. All stakeholders receive a calendar invitation with the agenda and required documentation.</li>
                <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-[#FFCD00] text-[#1a1a2e] flex items-center justify-center font-bold flex-shrink-0 text-[10px]">4</span>TDD is produced and approved. DevSecOps and FinOps gates are cleared for provisioning.</li>
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Requestor — simple next steps */}
        {!isPrivileged && (
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-[#1a1a2e] mb-4 flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> What Happens Next
              </p>
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[11px] text-[#1a1a2e]" style={{ background: "#FFCD00" }}>1</span>
                  <span>Your request is now under review by the CCoE Enterprise Architecture team. You will be notified once the initial review is complete.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[11px] text-[#1a1a2e]" style={{ background: "#FFCD00" }}>2</span>
                  <span>If additional information is required, an architect will reach out to you directly via email or through the portal comments.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[11px] text-[#1a1a2e]" style={{ background: "#FFCD00" }}>3</span>
                  <span>You can track the progress of your request at any time by visiting <strong>My Requests</strong> in the portal. Each phase will be updated as it is completed.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[11px] text-[#1a1a2e]" style={{ background: "#FFCD00" }}>4</span>
                  <span>Once all phases are approved, you will receive confirmation of your workload's readiness for provisioning.</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Fast-Track banner — privileged users (EA / CA / admin) see full pipeline detail */}
        {fastTracked && submittedRequestId && isPrivileged && (
          <div className="rounded-xl border-2 border-[#FFCD00] bg-yellow-50 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-full p-2.5 flex-shrink-0" style={{ background: "#FFCD00" }}>
                <Rocket className="w-5 h-5 text-[#1a1a2e]" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[#1a1a2e] text-base">Simple App Fast-Track Active</h3>
                <p className="text-sm text-slate-700 mt-1 leading-relaxed">
                  Because this is a <strong>Simple application</strong>, EA review has been automatically approved. Your request has skipped the triage queue and is ready for TDD generation immediately.
                </p>
                <div className="mt-3 space-y-1.5">
                  {[
                    { done: true,  label: "ARR Submitted" },
                    { done: true,  label: "EA Auto-Approved" },
                    { done: false, label: "Network CIDRs Pre-filled → Generate TDD" },
                    { done: false, label: "DevSecOps Review" },
                    { done: false, label: "FinOps Activation" },
                  ].map(({ done, label }) => (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      {done
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                      }
                      <span className={done ? "text-green-800 font-medium" : "text-slate-600"}>{label}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-4 text-[#1a1a2e] font-semibold"
                  style={{ background: "#FFCD00" }}
                  onClick={() => setLocation(`/requests/${submittedRequestId}`)}
                >
                  <Rocket className="w-4 h-4 mr-2" /> Open Request & Start TDD
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Fast-Track banner — requestors see a simple, non-technical confirmation */}
        {fastTracked && submittedRequestId && !isPrivileged && (
          <div className="rounded-xl border-2 border-[#FFCD00] bg-yellow-50 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-full p-2.5 flex-shrink-0" style={{ background: "#FFCD00" }}>
                <CheckCircle2 className="w-5 h-5 text-[#1a1a2e]" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[#1a1a2e] text-base">Request Approved & In Progress</h3>
                <p className="text-sm text-slate-700 mt-1 leading-relaxed">
                  Your request has been reviewed and approved by the CCoE Enterprise Architecture team. The technical design process is now underway — no further action is required from you at this stage.
                </p>
                <div className="mt-3 space-y-1.5">
                  {[
                    { done: true,  label: "Request submitted successfully" },
                    { done: true,  label: "CCoE Architecture review complete" },
                    { done: false, label: "Technical design in progress" },
                    { done: false, label: "Provisioning & go-live confirmation" },
                  ].map(({ done, label }) => (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      {done
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                      }
                      <span className={done ? "text-green-800 font-medium" : "text-slate-600"}>{label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  You can track progress at any time under <strong>My Requests</strong>. The CCoE team will contact you if any additional information is needed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 justify-end pt-2">
          <Button variant="outline" onClick={() => setLocation("/requests")}>
            View My Requests
          </Button>
          {submittedRequestId && !fastTracked && (
            <Button variant="outline" onClick={() => setLocation(`/requests/${submittedRequestId}`)}>
              View This Request
            </Button>
          )}
          <Button
            className="text-[#1a1a2e] font-semibold"
            style={{ background: "#FFCD00" }}
            onClick={() => { setSubmitted(false); setFastTracked(false); setSubmittedRequestId(null); setForm({ ...EMPTY_FORM }); setArchitectureDiagramFile(null); localStorage.removeItem(DRAFT_KEY); setDraftSavedAt(null); }}
          >
            Submit Another Request
          </Button>
        </div>
      </div>
    );
  }

  const isCloudTenant = form.deploymentModel === "Cloud (McCain Tenant)";
  const isThirdParty = DEPLOYMENT_MODELS_THIRD_PARTY.includes(form.deploymentModel);

  // Request-type routing helpers
  const isEnhancement    = form.applicationType === "Enhancement / New Capability";
  const isCloudMigration = form.applicationType === "Cloud Migration";
  const isDecommission   = form.applicationType === "Application Decommissioning";
  const isPoC            = form.applicationType === "Proof of Concept / Technology Evaluation";
  const needsExistingApp = isEnhancement || isCloudMigration || form.applicationType === "Application Replacement" || isDecommission;
  const skipTDD          = isDecommission;
  const fastTrackTDD     = isCloudMigration || (form.applicationType === "New Application" && form.appComplexity === "Simple");

  // ── 4. Section completion ──────────────────────────────────────────────────
  const sec1Done = !!(form.title && form.applicationName && form.applicationType && form.businessCriticality && form.organization && form.lineOfBusiness && form.sltLeader && form.targetGoLiveDate && form.deploymentModel);
  const sec2Done = !!(form.description && form.businessJustification);
  const sec3Done = needsExistingApp ? !!form.existingAppName : true;
  const sec4aDone = isCloudTenant ? (form.targetEnvironments.length > 0 && form.azureRegions.length > 0) : true;
  const sec4bDone = !isCloudTenant && form.deploymentModel ? !!(form.vendorName && form.commercialModel && form.hostingPlatform && form.dataResidency && form.supportModel) : true;
  const sec5Done = isCloudTenant ? !!(form.businessOwner && form.businessOwnerEmail && form.itOwner && form.technologyOwnerEmail) : true;
  const sec6Done = isCloudTenant ? !!(form.billingCompanyCode && form.billingCostObject && form.billingGlAccount) : true;
  const sec7Done = isCloudTenant && !skipTDD ? !!(form.applicationArchitecture && form.applicationFlow) : true;

  const SectionTitle = ({ step, title, desc, complete }: { step: number; title: string; desc?: string; complete?: boolean }) => (
    <div className="flex items-start gap-3">
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#1a1a2e] transition-colors ${complete ? "bg-green-400" : ""}`} style={complete ? {} : { background: "#FFCD00" }}>
        {complete ? <CheckCircle2 className="w-4 h-4 text-white" /> : step}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {complete && <span className="text-[10px] font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Complete</span>}
        </div>
        {desc && <CardDescription className="mt-0.5">{desc}</CardDescription>}
      </div>
    </div>
  );

  // ── 6. Review screen ───────────────────────────────────────────────────────
  if (reviewing) {
    const ReviewRow = ({ label, value }: { label: string; value?: string | string[] | boolean | null }) => {
      if (!value && value !== false) return null;
      const display = Array.isArray(value) ? value.join(", ") : value === true ? "Yes" : value === false ? "No" : String(value);
      if (!display) return null;
      return (
        <div className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
          <span className="text-xs text-slate-500 w-40 flex-shrink-0 pt-0.5">{label}</span>
          <span className="text-sm text-slate-800 font-medium flex-1">{display}</span>
        </div>
      );
    };
    const ReviewSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 pt-2 pb-1">{title}</p>
        {children}
      </div>
    );
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setReviewing(false); setError(""); }} className="text-slate-500">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Form
          </Button>
        </div>
        <div className="rounded-xl border border-[#FFCD00] bg-yellow-50 p-5 flex items-start gap-4">
          <Eye className="w-6 h-6 text-[#1a1a2e] flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold text-[#1a1a2e]">Review Your Request</h2>
            <p className="text-sm text-slate-600 mt-0.5">Please review all details below before submitting. Click <strong>Back to Form</strong> to make any changes.</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-4 space-y-1">
            <ReviewSection title="Project Overview">
              <ReviewRow label="Request Title" value={form.title} />
              <ReviewRow label="Application Name" value={form.applicationName} />
              <ReviewRow label="Request Type" value={form.applicationType} />
              <ReviewRow label="Organization" value={form.organization} />
              <ReviewRow label="Line of Business" value={form.lineOfBusiness} />
              <ReviewRow label="Business Criticality" value={form.businessCriticality} />
              <ReviewRow label="SLT Leader" value={form.sltLeader} />
              <ReviewRow label="Deployment Model" value={form.deploymentModel} />
              <ReviewRow label="Target Go-Live" value={form.targetGoLiveDate ? formatDDMMYYYY(form.targetGoLiveDate) : ""} />
              <ReviewRow label="Estimated Budget" value={form.costTShirtSize} />
              <ReviewRow label="App Complexity" value={form.appComplexity} />
              <ReviewRow label="Expected Users" value={form.expectedUserBase} />
              <ReviewRow label="In-Scope Regions" value={form.inScopeRegions} />
              <ReviewRow label="Business Value" value={form.businessValueHypothesis} />
            </ReviewSection>
            <ReviewSection title="Business Case">
              <ReviewRow label="Project Description" value={form.description} />
              <ReviewRow label="Business Justification" value={form.businessJustification} />
            </ReviewSection>
            {needsExistingApp && (
              <ReviewSection title="Existing Application">
                <ReviewRow label="App Name" value={form.existingAppName} />
                <ReviewRow label="App ID / LeanIX" value={form.existingAppId} />
                <ReviewRow label="Current Platform" value={form.existingAppPlatform} />
                <ReviewRow label="Current Host" value={form.existingAppCurrentHost} />
                <ReviewRow label="App Owner" value={form.existingAppOwner} />
                <ReviewRow label="Current Users" value={form.existingAppUsers} />
              </ReviewSection>
            )}
            {isCloudTenant && (
              <ReviewSection title="Deployment Scope">
                <ReviewRow label="Environments" value={form.targetEnvironments} />
                <ReviewRow label="Azure Regions" value={form.azureRegions} />
                <ReviewRow label="Workload Tier" value={form.workloadTier} />
                <ReviewRow label="High Availability" value={form.haEnabled} />
                <ReviewRow label="DR Plan Required" value={form.drEnabled} />
              </ReviewSection>
            )}
            <ReviewSection title="Impact Assessment">
              <ReviewRow label="Security Impact" value={form.securityImpact} />
              <ReviewRow label="Data Impact" value={form.dataImpact} />
              <ReviewRow label="Integration Impact" value={form.integrationImpact} />
              <ReviewRow label="Regulatory Impact" value={form.regulatoryImpact} />
              <ReviewRow label="AI Impact" value={form.aiImpact} />
            </ReviewSection>
            {isCloudTenant && (
              <ReviewSection title="Key Personnel">
                <ReviewRow label="Business Owner" value={`${form.businessOwner} (${form.businessOwnerEmail})`} />
                <ReviewRow label="IT Owner" value={`${form.itOwner} (${form.technologyOwnerEmail})`} />
                <ReviewRow label="App Support Manager" value={form.applicationSupportManager} />
                <ReviewRow label="Infra Support Manager" value={form.infrastructureSupportManager} />
                <ReviewRow label="Requestor Email" value={form.requestorEmail} />
              </ReviewSection>
            )}
            {isCloudTenant && !skipTDD && (
              <ReviewSection title="Technical Architecture">
                <ReviewRow label="Network Posture" value={form.networkPosture} />
                <ReviewRow label="Frontend Stack" value={form.frontendStack} />
                <ReviewRow label="Backend Stack" value={form.backendStack} />
                <ReviewRow label="Database Stack" value={form.databaseStack} />
                <ReviewRow label="Availability Target" value={form.availabilityTarget} />
                <ReviewRow label="Architecture Diagram" value={architectureDiagramFile?.name} />
              </ReviewSection>
            )}
          </CardContent>
        </Card>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" onClick={() => { setReviewing(false); setError(""); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Edit
          </Button>
          <Button onClick={confirmAndSubmit} className="bg-[#0078d4] hover:bg-[#106ebe]" disabled={submitting}>
            {submitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
              : <>Confirm & Submit <ArrowRight className="w-4 h-4 ml-2" /></>
            }
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} className="text-slate-500">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Dashboard
        </Button>
        {draftSavedAt && !showDraftBanner && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
            <Save className="w-3 h-3" /> Draft saved at {draftSavedAt}
          </span>
        )}
      </div>

      {/* ── Draft restore banner ── */}
      {showDraftBanner && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Save className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <p className="text-sm text-blue-800 flex-1">
            You have a saved draft from <strong>{draftSavedAt}</strong>. Would you like to continue where you left off?
          </p>
          <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0" onClick={restoreDraft}>Restore</Button>
          <button type="button" onClick={discardDraft} className="text-blue-400 hover:text-blue-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">Submit a Request</h1>
        <p className="text-slate-500 text-sm mt-1">
          Complete the sections below to submit your request for review by the CCoE Enterprise Architecture team. Your progress is saved automatically as you type.
        </p>
      </div>

      {/* ── 2. What you'll need checklist ── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPrepChecklist((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-100 transition-colors"
        >
          <ClipboardList className="w-4 h-4 text-[#1a1a2e] flex-shrink-0" />
          <span className="text-sm font-semibold text-[#1a1a2e]">What you'll need before you start</span>
          <span className="ml-auto text-[11px] text-slate-500">{showPrepChecklist ? "Hide" : "Show"}</span>
        </button>
        {showPrepChecklist && (
          <div className="px-5 pb-4 border-t border-slate-200 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 pt-3">
              {[
                { item: "Application or project name", tip: "What is the system called?" },
                { item: "Organization & Line of Business", tip: "Which business unit does this belong to?" },
                { item: "SLT Leader sponsoring this request", tip: "Select from the dropdown" },
                { item: "Target go-live date", tip: "An approximate date is fine" },
                { item: "Deployment model", tip: "Cloud (Azure), SaaS, On-prem, etc." },
                { item: "Business Owner name & email", tip: "The business stakeholder accountable" },
                { item: "IT Owner name & email", tip: "The technology owner within your team" },
                { item: "Billing Cost Object / GL Account", tip: "For cloud spend allocation — ask Finance if unsure" },
                { item: "Brief project description", tip: "What problem does this solve?" },
                { item: "Security & Data impact level", tip: "Approximate is fine — EA team will validate" },
              ].map(({ item, tip }) => (
                <div key={item} className="flex items-start gap-2 py-1">
                  <CheckSquare className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-700">{item}</p>
                    <p className="text-[11px] text-slate-400">{tip}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ─── Section 1: Project Overview ─── */}
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle step={1} title="Project Overview" complete={sec1Done} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Request Title <span className="text-red-500">*</span></Label>
              <Input id="title" placeholder="e.g. Digital Agriculture Platform – Azure Migration" value={form.title} onChange={(e) => update("title", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appName">Application Name <span className="text-red-500">*</span></Label>
              <Input id="appName" placeholder="MyApp" value={form.applicationName} onChange={(e) => update("applicationName", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Request Type <span className="text-red-500">*</span></Label>
              <Select value={form.applicationType} onValueChange={(v) => update("applicationType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex flex-col py-0.5">
                        <span className="font-medium">{t.icon} {t.label}</span>
                        <span className="text-[11px] text-slate-500 leading-snug max-w-[440px]">{t.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.applicationType && (() => {
                const selected = APP_TYPES.find((t) => t.value === form.applicationType);
                if (!selected) return null;
                const colors: Record<string, string> = {
                  "Cloud Migration": "bg-blue-50 border-blue-200 text-blue-800",
                  "Application Decommissioning": "bg-amber-50 border-amber-200 text-amber-800",
                  "Proof of Concept / Technology Evaluation": "bg-purple-50 border-purple-200 text-purple-800",
                };
                const cls = colors[selected.value] ?? "bg-slate-50 border-slate-200 text-slate-700";
                return (
                  <div className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium mt-1 ${cls}`}>
                    <ChevronRight className="w-3 h-3 flex-shrink-0" />{selected.workflow}
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center">How critical is this application to your business? <span className="text-red-500 ml-0.5">*</span><FieldHelp text="Business Criticality determines the level of EA governance, HA requirements, and DR planning applied. If unsure, choose the closest match — the EA team will validate." /></Label>
              <Select value={form.businessCriticality} onValueChange={(v) => update("businessCriticality", v)}>
                <SelectTrigger><SelectValue placeholder="Select the impact if this app goes down" /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_CRITICALITY_OPTIONS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      <div className="flex flex-col py-0.5">
                        <span className="font-medium">{b.label}</span>
                        <span className="text-[11px] text-slate-500 leading-snug max-w-[440px]">{b.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Organization <span className="text-red-500">*</span></Label>
                <Select value={form.organization} onValueChange={(v) => update("organization", v)}>
                  <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                  <SelectContent>{ORGANIZATIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Line of Business <span className="text-red-500">*</span></Label>
                <Select value={form.lineOfBusiness} onValueChange={(v) => update("lineOfBusiness", v)}>
                  <SelectTrigger><SelectValue placeholder="Select line of business" /></SelectTrigger>
                  <SelectContent>{LINE_OF_BUSINESS_OPTIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>SLT Leader <span className="text-red-500">*</span></Label>
                <Select value={form.sltLeader} onValueChange={(v) => update("sltLeader", v)}>
                  <SelectTrigger><SelectValue placeholder="Select SLT Leader" /></SelectTrigger>
                  <SelectContent>{SLT_LEADERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expectedUserBase">Expected Number of Users <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
                <Input id="expectedUserBase" placeholder="e.g. 500, 1000–10000" value={form.expectedUserBase} onChange={(e) => update("expectedUserBase", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="solutionArchitecture">Solution Architecture <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
              <Input id="solutionArchitecture" placeholder="e.g. Microservices on AKS" value={form.solutionArchitecture} onChange={(e) => update("solutionArchitecture", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Target Go-Live Date <span className="text-red-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                      {form.targetGoLiveDate ? formatDDMMYYYY(form.targetGoLiveDate) : <span className="text-slate-400">dd/mm/yyyy</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parseDateStr(form.targetGoLiveDate)}
                      onSelect={(date) => {
                        if (!date) { update("targetGoLiveDate", ""); return; }
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, "0");
                        const d = String(date.getDate()).padStart(2, "0");
                        update("targetGoLiveDate", `${y}-${m}-${d}`);
                      }}
                      captionLayout="dropdown"
                      startMonth={new Date(new Date().getFullYear() - 5, 0)}
                      endMonth={new Date(new Date().getFullYear() + 15, 11)}
                      disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                      className="[--cell-size:2.75rem] p-4 text-base"
                      classNames={{
                        month_caption: "flex h-[--cell-size] w-full items-center justify-center gap-2 px-[calc(var(--cell-size)+1rem)]",
                        dropdowns: "flex h-[--cell-size] w-full items-center justify-center gap-2 text-sm font-medium",
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center">Deployment Model <span className="text-red-500 ml-0.5">*</span><FieldHelp text="Cloud (McCain Tenant) = hosted in McCain's Azure subscription (recommended for new apps). 3rd Party / SaaS = vendor-managed. On-Premises = hosted in a McCain data centre." /></Label>
                <Select value={form.deploymentModel} onValueChange={(v) => update("deploymentModel", v)}>
                  <SelectTrigger><SelectValue placeholder="Select a deployment model" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cloud (McCain Tenant)" className="font-medium text-blue-700">☁ Cloud (McCain Tenant)</SelectItem>
                    <div className="px-2 py-1 text-[10px] font-mono text-slate-400 uppercase tracking-widest">3rd Party / External</div>
                    {DEPLOYMENT_MODELS_THIRD_PARTY.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    <div className="px-2 py-1 text-[10px] font-mono text-slate-400 uppercase tracking-widest">Other</div>
                    {DEPLOYMENT_MODELS_OTHER.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                {isCloudTenant && (
                  <p className="text-[11px] text-blue-600 mt-1 flex items-center gap-1">
                    <span className="font-semibold">Full workflow:</span> ARR → TDD Generation → DevSecOps/IaC → FinOps
                  </p>
                )}
                {isThirdParty && (
                  <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                    <span className="font-semibold">Simplified workflow:</span> ARR → FinOps monitoring only (vendor handles deployment)
                  </p>
                )}
              </div>
            </div>
            {/* ─── Estimated Project Cost ─── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>Estimated Overall Project Cost</Label>
                <span className="text-[11px] text-slate-400 font-normal">Total budget for this initiative</span>
              </div>
              <Select value={form.costTShirtSize} onValueChange={(v) => update("costTShirtSize", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an estimated budget range" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  {PROJECT_BUDGET_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <div className="flex flex-col py-0.5">
                        <span className="font-medium">{o.label}</span>
                        <span className="text-[11px] text-slate-500 leading-snug">{o.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ─── Application Complexity (New Application only) ─── */}
            {form.applicationType === "New Application" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>Application Complexity</Label>
                <span className="text-[11px] text-slate-400 font-normal">Determines the review and design workflow</span>
              </div>
              <div className="flex gap-3">
                {[
                  { value: "Simple", label: "Simple App", desc: "Standard functionality, few integrations — will be fast-tracked to TDD", icon: "⚡" },
                  { value: "Complex", label: "Complex App", desc: "Multiple integrations, custom architecture, or high security requirements", icon: "🏗" },
                ].map((opt) => {
                  const selected = form.appComplexity === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update("appComplexity", opt.value)}
                      className={`flex-1 rounded-lg border-2 p-3 text-left transition-all ${selected ? "border-[#0078d4] bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{opt.icon}</span>
                        <span className={`text-sm font-semibold ${selected ? "text-[#0078d4]" : "text-slate-800"}`}>{opt.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
              {form.appComplexity === "Simple" && (
                <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-[12px] text-blue-800">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-600" />
                  <span><strong>Fast-track enabled:</strong> Simple applications skip the full EA triage and are routed directly to TDD generation once submitted.</span>
                </div>
              )}
            </div>
            )}

            {/* ─── Cloud Migration fast-track notice ─── */}
            {isCloudMigration && (
              <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5 text-[12px] text-blue-900">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-600" />
                <span><strong>Fast-track enabled:</strong> Cloud Migrations are routed directly to TDD generation — full EA review is not required. Please provide existing application details in the next step.</span>
              </div>
            )}

            {/* ─── Decommissioning lightweight notice ─── */}
            {isDecommission && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-[12px] text-amber-900">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                <span><strong>Lightweight review path:</strong> Application Decommissioning does not require a TDD. A dependency check, data disposal plan, and FinOps cost sign-off will be completed instead.</span>
              </div>
            )}

            {/* ─── PoC notice ─── */}
            {isPoC && (
              <div className="flex items-start gap-2 rounded-md bg-purple-50 border border-purple-200 px-3 py-2.5 text-[12px] text-purple-900">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-purple-600" />
                <span><strong>Simplified review:</strong> Proof of Concept requests are scope-limited and do not proceed to production deployment without a separate full Architecture Review.</span>
              </div>
            )}

            {/* ─── Business Value Hypothesis ─── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>Business Value Hypothesis</Label>
                <span className="text-[11px] text-slate-400 font-normal">Select all that apply</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {BUSINESS_VALUE_HYPOTHESIS_OPTIONS.map((opt) => {
                  const selected = form.businessValueHypothesis.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => update("businessValueHypothesis", toggle(form.businessValueHypothesis, opt))}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${selected ? "bg-[#0078d4] text-white border-[#0078d4]" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── In-Scope Regions / Countries ─── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>In-Scope Regions / Countries</Label>
                <span className="text-[11px] text-slate-400 font-normal">List all regions or countries within scope. Multiple entries allowed.</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Type a region or country and press Enter"
                  value={regionInput}
                  onChange={(e) => setRegionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === ",") && regionInput.trim()) {
                      e.preventDefault();
                      const val = regionInput.trim().replace(/,$/, "");
                      if (val && !form.inScopeRegions.includes(val)) {
                        update("inScopeRegions", [...form.inScopeRegions, val]);
                      }
                      setRegionInput("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    const val = regionInput.trim();
                    if (val && !form.inScopeRegions.includes(val)) {
                      update("inScopeRegions", [...form.inScopeRegions, val]);
                    }
                    setRegionInput("");
                  }}
                >
                  Add
                </Button>
              </div>
              {form.inScopeRegions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {form.inScopeRegions.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-0.5 text-sm text-slate-700 border border-slate-200">
                      {r}
                      <button
                        type="button"
                        className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                        onClick={() => update("inScopeRegions", form.inScopeRegions.filter((x) => x !== r))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Impact Assessment Group: Security / Data / Integration / Regulatory / AI ─── */}
            {(() => {
              const IMPACT_TOOLTIPS: Partial<Record<string, string>> = {
                "Security Impact": "Rate the security exposure this system introduces. High = handles PII/PCI/PHI, internet-facing, or privileged access. Medium = internal authenticated access. Low = read-only, non-sensitive internal data.",
                "Data Impact": "Classify the sensitivity of data this system stores or processes. Critical/High = confidential commercial or personal data. Medium = internal business data. Low = public or anonymised data.",
                "Integration Impact": "How many other systems does this connect to? High = 10+ integrations or core ERP/data platform. Medium = 3–9 integrations. Low = standalone or 1–2 lightweight APIs.",
                "Regulatory Impact": "Does this system need to comply with regulations like GDPR, PIPEDA, SOX, FDA 21 CFR Part 11, or other standards? Select based on the most stringent applicable requirement.",
                "AI Impact": "Does this solution use AI/ML models, generative AI, automated decision-making, or train models on McCain data? CCoE AI governance review is triggered for Medium and above.",
              };
              const renderImpact = (
                label: string,
                detailsLabel: string,
                options: ImpactOption[],
                valueField: "securityImpact" | "dataImpact" | "integrationImpact" | "regulatoryImpact" | "aiImpact",
                detailsField: "securityImpactDetails" | "dataImpactDetails" | "integrationImpactDetails" | "regulatoryImpactDetails" | "aiImpactDetails",
              ) => {
                const value = form[valueField];
                const selected = options.find((o) => o.value === value);
                const tooltip = IMPACT_TOOLTIPS[label];
                return (
                  <div className="space-y-2 pt-2 border-t border-slate-100 first:pt-0 first:border-t-0">
                    <div className="space-y-1.5">
                      <Label className="flex items-center">{label}{tooltip && <FieldHelp text={tooltip} />}</Label>
                      <Select value={value} onValueChange={(v) => update(valueField, v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={`Select ${label.toLowerCase()} level`} />
                        </SelectTrigger>
                        <SelectContent className="w-full">
                          {options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              <div className="flex flex-col py-0.5 gap-0.5">
                                <span className="font-medium">{o.label}</span>
                                {o.desc && (
                                  <span className="text-[11px] text-slate-500 whitespace-pre-line leading-snug max-w-[480px]">
                                    {o.desc}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selected && selected.desc && (
                        <div className={`rounded-md border px-3 py-2 text-[12px] leading-relaxed mt-1 whitespace-pre-line ${selected.info}`}>
                          <span className="font-semibold">{selected.label}: </span>{selected.desc}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>{detailsLabel}</Label>
                      <Textarea
                        rows={3}
                        placeholder={`Provide additional details about ${label.toLowerCase()}…`}
                        value={form[detailsField]}
                        onChange={(e) => update(detailsField, e.target.value)}
                      />
                    </div>
                  </div>
                );
              };
              return (
                <>
                  {renderImpact("Security Impact", "Security Impact Details", SECURITY_IMPACT_OPTIONS, "securityImpact", "securityImpactDetails")}
                  {renderImpact("Data Impact", "Data Impact Details", DATA_IMPACT_OPTIONS, "dataImpact", "dataImpactDetails")}
                  {renderImpact("Integration Impact", "Integration Impact Details", INTEGRATION_IMPACT_OPTIONS, "integrationImpact", "integrationImpactDetails")}
                  {renderImpact("Regulatory Impact", "Regulatory Impact Details", REGULATORY_IMPACT_OPTIONS, "regulatoryImpact", "regulatoryImpactDetails")}
                  {renderImpact("AI Impact", "AI Impact Details", AI_IMPACT_OPTIONS, "aiImpact", "aiImpactDetails")}
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* ─── Section 2: Business Case ─── */}
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle step={2} title="Business Case" complete={sec2Done} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="desc">Project Description <span className="text-red-500">*</span></Label>
              <Textarea id="desc" placeholder="Describe what this project does, the problem it solves, and its goals…" rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bj">Business Justification <span className="text-red-500">*</span></Label>
              <Textarea id="bj" placeholder="Why is this architecturally significant? What is the business value?" rows={3} value={form.businessJustification} onChange={(e) => update("businessJustification", e.target.value)} required />
            </div>
          </CardContent>
        </Card>

        {/* ─── Existing Application Details (conditional) ─── */}
        {needsExistingApp && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3">
            <SectionTitle
              step={3}
              title="Existing Application Details"
              desc={(isDecommission
                ? "Tell us about the application being decommissioned."
                : isCloudMigration
                ? "Tell us about the existing application being migrated to Azure."
                : "Tell us about the existing application being enhanced or replaced.") +
                " Future release: this will integrate with LeanIX to auto-populate from your EA repository."}
              complete={sec3Done}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="existingAppName">Application Name <span className="text-red-500">*</span></Label>
                <Input id="existingAppName" placeholder="Name of the existing application" value={form.existingAppName} onChange={(e) => update("existingAppName", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="existingAppId">Application ID / LeanIX ID <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
                <Input id="existingAppId" placeholder="e.g. APP-0042 or LeanIX UUID" value={form.existingAppId} onChange={(e) => update("existingAppId", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="existingAppPlatform">Current Technology Platform</Label>
                <Input id="existingAppPlatform" placeholder="e.g. .NET on IIS, Java Spring Boot, SAP ECC" value={form.existingAppPlatform} onChange={(e) => update("existingAppPlatform", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="existingAppCurrentHost">Current Hosting Environment</Label>
                <Input id="existingAppCurrentHost" placeholder="e.g. On-premises Saskatoon DC, AWS, Azure" value={form.existingAppCurrentHost} onChange={(e) => update("existingAppCurrentHost", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="existingAppOwner">Application Owner</Label>
                <Input id="existingAppOwner" placeholder="Full name" value={form.existingAppOwner} onChange={(e) => update("existingAppOwner", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="existingAppUsers">Current Number of Users</Label>
                <Input id="existingAppUsers" placeholder="e.g. 250, 1000–5000" value={form.existingAppUsers} onChange={(e) => update("existingAppUsers", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="existingAppDescription">
                {isDecommission ? "Reason for Decommissioning" : "Summary of Existing Application"}
              </Label>
              <Textarea
                id="existingAppDescription"
                placeholder={
                  isDecommission
                    ? "Why is this application being retired? What happens to its data, users, and dependencies?"
                    : "Briefly describe the current application — its purpose, key integrations, and known limitations."
                }
                rows={3}
                value={form.existingAppDescription}
                onChange={(e) => update("existingAppDescription", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
        )}

        {/* ─── Section 3a: Azure Deployment Scope (Cloud Tenant only) ─── */}
        {isCloudTenant && (
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle step={3} title="Deployment Scope" desc="Environments, Azure regions, and workload classification." complete={sec4aDone} />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Target Environments <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-2">
                {ENVIRONMENTS.map((env) => (
                  <button key={env} type="button"
                    onClick={() => update("targetEnvironments", toggle(form.targetEnvironments, env))}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${form.targetEnvironments.includes(env) ? "bg-[#0078d4] text-white border-[#0078d4]" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}
                  >{env}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center">Azure Regions <span className="text-red-500 ml-0.5">*</span><FieldHelp text="McCain's approved Azure regions are Canada Central (primary) and Canada East (DR/secondary). Both are required for Mission Critical workloads. Data residency restrictions apply." /></Label>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <button key={r.id} type="button"
                    onClick={() => update("azureRegions", toggle(form.azureRegions, r.id))}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${form.azureRegions.includes(r.id) ? "bg-[#0078d4] text-white border-[#0078d4]" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}
                  >{r.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center">Workload Tier <span className="text-red-500 ml-0.5">*</span><FieldHelp text="Tier 1 = Mission Critical (near-zero downtime). Tier 2 = Business Critical (limited downtime tolerated). Tier 3 = Standard (dev/test, internal tools). Drives SLA and HA architecture requirements." /></Label>
              <Select value={form.workloadTier} onValueChange={(v) => update("workloadTier", v)}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Select tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tier 0">Tier 0 — Mission Critical</SelectItem>
                  <SelectItem value="Tier 1">Tier 1 — Business Critical</SelectItem>
                  <SelectItem value="Tier 2">Tier 2 — Important</SelectItem>
                  <SelectItem value="Tier 3">Tier 3 — Standard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">High Availability</p>
                  <p className="text-xs text-slate-500">Zone-redundant deployment</p>
                </div>
                <Switch checked={form.haEnabled} onCheckedChange={(v) => update("haEnabled", v)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">DR Plan Required</p>
                  <p className="text-xs text-slate-500">Cross-region failover (Canada East)</p>
                </div>
                <Switch checked={form.drEnabled} onCheckedChange={(v) => update("drEnabled", v)} />
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* ─── Section 3: 3rd Party / External Solution Details — Step A ─── */}
        {!isCloudTenant && form.deploymentModel && (
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle step={3} title="Solution & Vendor Details" desc="Tell us about the third-party application, its tech stack, and where it's hosted." complete={sec4bDone} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="vendorName">Vendor / Solution Name <span className="text-red-500">*</span></Label>
                <Input id="vendorName" placeholder="e.g. Salesforce, SAP Ariba, ServiceNow" value={form.vendorName} onChange={(e) => update("vendorName", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Commercial Model <span className="text-red-500">*</span></Label>
                <Select value={form.commercialModel} onValueChange={(v) => update("commercialModel", v)}>
                  <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                  <SelectContent>{COMMERCIAL_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appTechStack">Tech Stack / Framework <span className="text-red-500">*</span></Label>
              <Input id="appTechStack" placeholder="e.g. React + Node.js, Salesforce Lightning, SAP NetWeaver, Java Spring Boot" value={form.appTechStack} onChange={(e) => update("appTechStack", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Hosting Platform <span className="text-red-500">*</span></Label>
              <Select value={form.hostingPlatform} onValueChange={(v) => update("hostingPlatform", v)}>
                <SelectTrigger><SelectValue placeholder="Where is this solution hosted?" /></SelectTrigger>
                <SelectContent>{HOSTING_PLATFORMS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data Residency <span className="text-red-500">*</span></Label>
                <Select value={form.dataResidency} onValueChange={(v) => update("dataResidency", v)}>
                  <SelectTrigger><SelectValue placeholder="Where is data stored?" /></SelectTrigger>
                  <SelectContent>{DATA_RESIDENCY_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Support Model <span className="text-red-500">*</span></Label>
                <Select value={form.supportModel} onValueChange={(v) => update("supportModel", v)}>
                  <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                  <SelectContent>{SUPPORT_MODELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-3">Vendor Contact & Contract</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="vendorContactName">Vendor Contact Name <span className="text-red-500">*</span></Label>
                    <Input id="vendorContactName" placeholder="Full name" value={form.vendorContactName} onChange={(e) => update("vendorContactName", e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vendorContactEmail">Vendor Contact Email <span className="text-red-500">*</span></Label>
                    <Input id="vendorContactEmail" type="email" placeholder="contact@vendor.com" value={form.vendorContactEmail} onChange={(e) => update("vendorContactEmail", e.target.value)} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="contractStartDate">Contract Start Date</Label>
                    <Input id="contractStartDate" type="date" value={form.contractStartDate} onChange={(e) => update("contractStartDate", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contractEndDate">Contract End Date</Label>
                    <Input id="contractEndDate" type="date" value={form.contractEndDate} onChange={(e) => update("contractEndDate", e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* ─── Section 4: 3rd Party — Ownership, Billing & Integration ─── */}
        {!isCloudTenant && form.deploymentModel && (
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle step={4} title="Ownership, Billing & Integration" desc="Key contacts, cost allocation, and integration requirements for this solution." complete={sec5Done && sec6Done} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpBusinessOwner">Business Owner <span className="text-red-500">*</span></Label>
                <Input id="tpBusinessOwner" placeholder="Full name" value={form.thirdPartyBusinessOwner} onChange={(e) => update("thirdPartyBusinessOwner", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpItOwner">IT Owner <span className="text-red-500">*</span></Label>
                <Input id="tpItOwner" placeholder="Full name" value={form.thirdPartyItOwner} onChange={(e) => update("thirdPartyItOwner", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpBillingCode">Billing / Cost Centre Code</Label>
                <Input id="tpBillingCode" placeholder="e.g. CC-123456" value={form.thirdPartyBillingCode} onChange={(e) => update("thirdPartyBillingCode", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpGlAccount">GL Account</Label>
                <Input id="tpGlAccount" placeholder="e.g. 6140100" value={form.thirdPartyGlAccount} onChange={(e) => update("thirdPartyGlAccount", e.target.value)} />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Integration & Security</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Integration with McCain Systems?</p>
                    <p className="text-xs text-slate-500">APIs, SSO, data exchange with internal systems</p>
                  </div>
                  <Switch checked={form.integrationRequired} onCheckedChange={(v) => update("integrationRequired", v)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Security / Privacy Assessment?</p>
                    <p className="text-xs text-slate-500">Vendor security questionnaire or PRIVACYIA required</p>
                  </div>
                  <Switch checked={form.securityAssessmentRequired} onCheckedChange={(v) => update("securityAssessmentRequired", v)} />
                </div>
              </div>
              {form.integrationRequired && (
                <div className="space-y-1.5">
                  <Label htmlFor="integrationDescription">Integration Description</Label>
                  <Textarea id="integrationDescription" placeholder="Describe which McCain systems will integrate, and the integration pattern (API, SSO, ETL, event-based…)" rows={3} value={form.integrationDescription} onChange={(e) => update("integrationDescription", e.target.value)} />
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-3">Architecture & Deployment Notes</p>
              <Textarea placeholder="Describe how this solution will be deployed, accessed, and managed — any dependencies on McCain infrastructure, SSO requirements, network access, etc." rows={4} value={form.applicationArchitecture} onChange={(e) => update("applicationArchitecture", e.target.value)} />
            </div>
          </CardContent>
        </Card>
        )}

        {/* ─── Section 4: Key Personnel & Stakeholders (Cloud Tenant only) ─── */}
        {isCloudTenant && (<>
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle step={4} title="Key Personnel & Stakeholders" desc="Contacts who will own and support this workload." complete={sec5Done} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessOwner">Business Owner <span className="text-red-500">*</span></Label>
                <Input id="businessOwner" placeholder="Full name" value={form.businessOwner} onChange={(e) => update("businessOwner", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="businessOwnerEmail">Business Owner Email <span className="text-red-500">*</span></Label>
                <Input id="businessOwnerEmail" type="email" placeholder="owner@mccain.com" value={form.businessOwnerEmail} onChange={(e) => update("businessOwnerEmail", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="itOwner">IT Owner Name <span className="text-red-500">*</span></Label>
                <Input id="itOwner" placeholder="Full name" value={form.itOwner} onChange={(e) => update("itOwner", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="technologyOwnerEmail">IT Owner Email <span className="text-red-500">*</span></Label>
                <Input id="technologyOwnerEmail" type="email" placeholder="itowner@mccain.com" value={form.technologyOwnerEmail} onChange={(e) => update("technologyOwnerEmail", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="appSupportMgr">Application Support Manager <span className="text-red-500">*</span></Label>
                <Input id="appSupportMgr" placeholder="Full name" value={form.applicationSupportManager} onChange={(e) => update("applicationSupportManager", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="infraSupportMgr">Infrastructure Support Manager <span className="text-red-500">*</span></Label>
                <Input id="infraSupportMgr" placeholder="Full name" value={form.infrastructureSupportManager} onChange={(e) => update("infrastructureSupportManager", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="requestorEmail">Requestor Email <span className="text-red-500">*</span></Label>
                <Input id="requestorEmail" type="email" placeholder="you@mccain.com" value={form.requestorEmail} onChange={(e) => update("requestorEmail", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="glAccountOwnerEmail">GL Account Owner Email <span className="text-red-500">*</span></Label>
                <Input id="glAccountOwnerEmail" type="email" placeholder="finance@mccain.com" value={form.glAccountOwnerEmail} onChange={(e) => update("glAccountOwnerEmail", e.target.value)} required />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Section 5: Financial Governance (Cloud Tenant only) ─── */}
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle step={5} title="Financial Governance" desc="Cost allocation and budget information for cloud spend tracking." complete={sec6Done} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="billingCompanyCode">Company Code <span className="text-red-500">*</span></Label>
                <Input id="billingCompanyCode" placeholder="e.g. CA01" value={form.billingCompanyCode} onChange={(e) => update("billingCompanyCode", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billingPlant">Plant Code <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
                <Input id="billingPlant" placeholder="e.g. PLT-FLO" value={form.billingPlant} onChange={(e) => update("billingPlant", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="billingCostObject" className="flex items-center">Billing Cost Object <span className="text-red-500 ml-0.5">*</span><FieldHelp text="Your SAP WBS element or Internal Order number used to allocate cloud spend. Format: WBS-XXXX or IO-XXXX. Ask your Finance Business Partner if you don't have this." /></Label>
                <Input id="billingCostObject" placeholder="e.g. CC-123456 or W-2024-001" value={form.billingCostObject} onChange={(e) => update("billingCostObject", e.target.value)} required />
                <p className="text-[11px] text-slate-400">Cost Centre or WBS Element used for billing allocation</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billingGlAccount" className="flex items-center">GL Account <span className="text-red-500 ml-0.5">*</span><FieldHelp text="General Ledger account number for cloud cost categorisation in your financial system. Typically a 6-digit code (e.g. 600000). Your Finance team can provide this." /></Label>
                <Input id="billingGlAccount" placeholder="e.g. 6140100" value={form.billingGlAccount} onChange={(e) => update("billingGlAccount", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="budgetTrackerReference">Budget Tracker Reference <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
                <Input id="budgetTrackerReference" placeholder="e.g. BTR-2026-0042" value={form.budgetTrackerReference} onChange={(e) => update("budgetTrackerReference", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="categoryOwner">Category Owner <span className="text-red-500">*</span></Label>
                <Input id="categoryOwner" placeholder="Full name" value={form.categoryOwner} onChange={(e) => update("categoryOwner", e.target.value)} required />
              </div>
            </div>
          </CardContent>
        </Card>
        </>)}

        {/* ─── Section 6: Technical Architecture (Cloud Tenant + non-Decommission only) ─── */}
        {isCloudTenant && !skipTDD && (
        <Card>
          <CardHeader className="pb-3">
            <SectionTitle step={6} title="Technical Architecture" desc="Describe the solution design. Network CIDRs will be added by the Cloud Architect after EA approval." complete={sec7Done} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="solution">Solution / TDD Name <span className="text-red-500">*</span></Label>
                <Input id="solution" placeholder="e.g. AgriData Platform" value={form.solution} onChange={(e) => update("solution", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center">Network Posture <span className="text-red-500 ml-0.5">*</span><FieldHelp text="Public: accessible from the internet (e.g. customer-facing portal). Internal: accessible only within McCain's corporate network. Hybrid: mixed access model. Affects firewall rules and security controls." /></Label>
                <Select value={form.networkPosture} onValueChange={(v) => update("networkPosture", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NETWORK_POSTURE_OPTIONS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="frontendStack">Frontend Stack</Label>
                <Input id="frontendStack" placeholder="e.g. React, Angular" value={form.frontendStack} onChange={(e) => update("frontendStack", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backendStack">Backend Stack</Label>
                <Input id="backendStack" placeholder="e.g. Node.js, .NET" value={form.backendStack} onChange={(e) => update("backendStack", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="databaseStack">Database Stack</Label>
                <Input id="databaseStack" placeholder="e.g. PostgreSQL, Cosmos" value={form.databaseStack} onChange={(e) => update("databaseStack", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="applicationArchitecture">Architecture Description <span className="text-red-500">*</span></Label>
              <Textarea id="applicationArchitecture" placeholder="Describe the proposed Azure architecture: key services, tiers, integration points, and security considerations…" rows={5} value={form.applicationArchitecture} onChange={(e) => update("applicationArchitecture", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="applicationFlow">Application Flow <span className="text-red-500">*</span></Label>
              <Textarea id="applicationFlow" placeholder="Walk through how data or requests flow through the system end-to-end (e.g. user → CDN → App Gateway → API → DB)…" rows={4} value={form.applicationFlow} onChange={(e) => update("applicationFlow", e.target.value)} required />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="scalabilityRequirements">Scalability Requirements</Label>
                <Input id="scalabilityRequirements" placeholder="e.g. Auto-scale to 10× base" value={form.scalabilityRequirements} onChange={(e) => update("scalabilityRequirements", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="availabilityTarget" className="flex items-center">Availability Target<FieldHelp text="Express as a percentage (e.g. 99.9% = ~8.7 hrs downtime/year, 99.95% = ~4.4 hrs/year, 99.99% = ~52 min/year). Drives Azure SLA selection and HA architecture design." /></Label>
                <Input id="availabilityTarget" placeholder="e.g. 99.9%" value={form.availabilityTarget} onChange={(e) => update("availabilityTarget", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rto">RTO / RPO</Label>
                <Input id="rto" placeholder="e.g. RTO 4h / RPO 1h" value={form.rto} onChange={(e) => update("rto", e.target.value)} />
              </div>
            </div>

            {/* ─── Architecture Diagram Upload ─── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>Architecture Diagram <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
                <span className="text-[11px] text-slate-400 font-normal">PNG, JPG, PDF or Visio — will be embedded in the TDD</span>
              </div>
              <input
                ref={diagramInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,.vsdx,.svg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setArchitectureDiagramFile(file);
                }}
              />
              {architectureDiagramFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <Upload className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-900 truncate">{architectureDiagramFile.name}</p>
                    <p className="text-[11px] text-blue-600">{(architectureDiagramFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setArchitectureDiagramFile(null); if (diagramInputRef.current) diagramInputRef.current.value = ""; }}
                    className="text-blue-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => diagramInputRef.current?.click()}
                  className="w-full rounded-lg border-2 border-dashed border-slate-200 px-4 py-5 text-center hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-sm text-slate-500">Click to upload your architecture diagram</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">PNG, JPG, PDF, SVG or Visio (.vsdx) — max 10 MB</p>
                </button>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        <div className="flex justify-end">
          <Button type="submit" className="bg-[#0078d4] hover:bg-[#106ebe]" disabled={submitting}>
            {submitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
              : <>Submit Request <ArrowRight className="w-4 h-4 ml-2" /></>
            }
          </Button>
        </div>
      </form>
    </div>
  );
}
