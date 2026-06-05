import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  FileText, CheckCircle, Clock, XCircle, PlusCircle, ArrowRight,
  Loader2, Cloud, BarChart3, Building2, ShieldCheck, Code2, DollarSign, Link2, Activity, CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/store/auth-context";
import { getApiBase } from "@/lib/api-base";
import { StatusBadge, type RequestStatus } from "@/components/RequestStatusBadge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface ArchitectureRequest {
  id: number;
  title: string;
  applicationName: string;
  businessUnit: string;
  priority: string;
  status: RequestStatus;
  requestorName: string;
  createdAt: string;
  eaReviewedAt?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  ea_triage: "Under Review",
  ea_approved: "Approved",
  ea_rejected: "Not Approved",
  cab_in_progress: "Design In Progress",
  cab_completed: "Design Complete",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "#f59e0b",
  ea_triage: "#fb923c",
  ea_approved: "#22c55e",
  ea_rejected: "#ef4444",
  cab_in_progress: "#3b82f6",
  cab_completed: "#8b5cf6",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#94a3b8",
};

const PHASES = [
  { num: 1, label: "Architecture Review", sub: "Enterprise architects assess your request for risk, compliance, and technical fit.", color: "#FFCD00", icon: Building2, path: "/phase/1", duration: "≤ 1 week", gate: "Architecture sign-off" },
  { num: 2, label: "Cloud Architecture Blueprint", sub: "Cloud architects produce an AI-assisted Cloud Architecture Blueprint for your solution.", color: "#FFCD00", icon: FileText, path: "/phase/3", duration: "1–2 hours", gate: "CA sign-off" },
  { num: 3, label: "Infrastructure Deployment", sub: "Approved design is deployed to Azure via automated, policy-enforced pipelines.", color: "#FFCD00", icon: Code2, path: "/phase/4", duration: "~2 weeks", gate: "Dual approval for Prod" },
  { num: 4, label: "Observability", sub: "Monitoring, alerting, dashboards, and on-call runbooks confirmed before cost tracking begins.", color: "#FFCD00", icon: Activity, path: "/phase/observability", duration: "~2 days", gate: "CA sign-off" },
  { num: 5, label: "Cost Management", sub: "Ongoing budget alerts, cost allocation, tagging, and monthly chargeback reporting.", color: "#FFCD00", icon: DollarSign, path: "/phase/5", duration: "Ongoing", gate: "Monthly review" },
];

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<ArchitectureRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${getApiBase()}/api/requests`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRequests(d.requests ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  const submitted = requests.filter((r) => r.status === "submitted").length;
  const eaTriage = requests.filter((r) => r.status === "ea_triage").length;
  const modificationRequested = requests.filter((r) => r.status === "modification_requested").length;
  const approved = requests.filter((r) => r.status === "ea_approved").length;
  const rejected = requests.filter((r) => r.status === "ea_rejected").length;
  const inProgress = requests.filter((r) => r.status === "cab_in_progress").length;
  const completed = requests.filter((r) => r.status === "cab_completed").length;
  const devsecopsApproved = requests.filter((r) => r.status === "devsecops_approved").length;
  const devsecopsRejected = requests.filter((r) => r.status === "devsecops_rejected").length;
  const observabilityApproved = requests.filter((r) => r.status === "observability_approved").length;
  const finopsActive = requests.filter((r) => r.status === "finops_active").length;
  const recent = requests.slice(0, 5);

  // Compute requestor banner state — most urgent status wins
  const hasActionRequired = requests.some((r) => r.status === "modification_requested");
  const hasRejected = requests.some((r) => r.status === "ea_rejected" || r.status === "devsecops_rejected");
  const allComplete = requests.length > 0 && requests.every((r) => r.status === "finops_active");
  const hasActive = requests.some((r) =>
    ["submitted", "ea_triage", "ea_approved", "cab_in_progress", "cab_completed", "devsecops_approved", "observability_approved"].includes(r.status)
  );
  const requestorBanner: { icon: string; color: string; title: string; body: string } | null =
    user.role !== "requestor" || requests.length === 0 ? null
    : hasActionRequired ? {
        icon: "⚠️",
        color: "border-red-200 bg-red-50",
        title: "Action required — changes requested",
        body: "An Enterprise Architect has reviewed your submission and is requesting changes. Open the request below to respond and resubmit.",
      }
    : hasRejected ? {
        icon: "✗",
        color: "border-red-200 bg-red-50",
        title: "One or more requests were not approved",
        body: "A request has been reviewed and could not be approved at this stage. Click the request below to see the reviewer's comments.",
      }
    : allComplete ? {
        icon: "✓",
        color: "border-emerald-200 bg-emerald-50",
        title: "All your requests are complete",
        body: "Every request has cleared all phases and is fully onboarded into McCain's governance framework. You can submit a new request at any time.",
      }
    : hasActive ? {
        icon: "⏱",
        color: "border-amber-200 bg-amber-50",
        title: "Your requests are in progress",
        body: "You'll see updates here and in the notification bell (top right) as each request moves forward. Click any request below to see its current status and next steps.",
      }
    : null;

  const statusChartData = [
    { name: "Awaiting Review", value: submitted + eaTriage + modificationRequested, fill: STATUS_COLORS.submitted },
    { name: "Arch Approved", value: approved, fill: STATUS_COLORS.ea_approved },
    { name: "Not Approved", value: rejected + devsecopsRejected, fill: STATUS_COLORS.ea_rejected },
    { name: "Design Active", value: inProgress, fill: STATUS_COLORS.cab_in_progress },
    { name: "Design Complete", value: completed, fill: STATUS_COLORS.cab_completed },
    { name: "Infra Approved", value: devsecopsApproved, fill: "#8b5cf6" },
    { name: "Observability", value: observabilityApproved, fill: "#06b6d4" },
    { name: "Complete", value: finopsActive, fill: "#16a34a" },
  ].filter((d) => d.value > 0);

  const priorityCounts: Record<string, number> = {};
  requests.forEach((r) => { priorityCounts[r.priority] = (priorityCounts[r.priority] ?? 0) + 1; });
  const priorityData = Object.entries(priorityCounts).map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] ?? "#94a3b8" }));

  const buCounts: Record<string, number> = {};
  requests.forEach((r) => { buCounts[r.businessUnit] = (buCounts[r.businessUnit] ?? 0) + 1; });
  const buData = Object.entries(buCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));

  const reviewed = requests.filter((r) => r.eaReviewedAt && ["ea_approved", "ea_rejected", "cab_in_progress", "cab_completed"].includes(r.status));
  const avgDays = reviewed.length > 0
    ? (reviewed.reduce((sum, r) => {
        const c = new Date(r.createdAt).getTime();
        const rev = new Date(r.eaReviewedAt!).getTime();
        return sum + (rev - c) / 86400000;
      }, 0) / reviewed.length).toFixed(1)
    : null;

  const roleDesc: Record<string, string> = {
    requestor:               "Submit and track your cloud workload requests. The architecture team will guide each request through review, design, deployment, and cost governance.",
    enterprise_architect:    "Review incoming architecture requests, assess risk and compliance, and approve workloads for Cloud Architecture Blueprint generation.",
    cloud_architect:         "Pick up EA-approved requests, generate AI-assisted Cloud Architecture Blueprints, and oversee infrastructure deployment pipelines.",
    devsecops_architect:     "Take approved Cloud Architecture Blueprints through the infrastructure deployment pipeline with policy-as-code gates and dual approval.",
    observability_architect: "Validate monitoring coverage, SLA tiers, alert severity frameworks, and runbook links before FinOps activation is permitted.",
    finops_architect:        "Activate budget governance, enforce tagging, configure chargeback reporting, and drive Azure Advisor savings recommendations.",
    admin:                   "Full portal access — manage all phases, queues, users, and onboarding governance across all Lines of Business.",
  };

  // Persona-specific queue config
  const personaQueue: Record<string, { label: string; statuses: string[]; emptyMsg: string; cta: string; ctaPath: string }> = {
    enterprise_architect:    { label: "Architecture Review Queue", statuses: ["submitted", "ea_triage"], emptyMsg: "No requests awaiting Architecture Review.", cta: "Go to Review Queue", ctaPath: "/ea-queue" },
    cloud_architect:         { label: "Blueprint Queue", statuses: ["ea_approved", "cab_in_progress"], emptyMsg: "No requests ready for Blueprint generation.", cta: "Go to Blueprint Queue", ctaPath: "/cab-queue" },
    devsecops_architect:     { label: "Infrastructure Deployment Queue", statuses: ["cab_completed"], emptyMsg: "No requests ready for Infrastructure Deployment.", cta: "View All Requests", ctaPath: "/requests" },
    observability_architect: { label: "Observability Setup Queue", statuses: ["devsecops_approved"], emptyMsg: "No requests awaiting Observability setup.", cta: "View All Requests", ctaPath: "/requests" },
    finops_architect:        { label: "FinOps Activation Queue", statuses: ["observability_approved"], emptyMsg: "No requests awaiting FinOps activation.", cta: "View All Requests", ctaPath: "/requests" },
  };

  const myQueue = personaQueue[user.role];
  const myQueueRequests = myQueue ? requests.filter((r) => myQueue.statuses.includes(r.status)) : [];

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10" style={{ background: "#FFCD00", transform: "translate(30%,-30%)" }} />
        <div className="relative z-10">
          <p className="text-xs font-mono tracking-widest uppercase mb-1" style={{ color: "#FFCD00" }}>McCain CCoE · Unified Onboarding Portal</p>
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Welcome back, {user.name.split(" ")[0]}</h1>
          <p className="text-sm opacity-70">{roleDesc[user.role]}</p>
          <div className="flex gap-3 mt-4 flex-wrap">
            {user.role === "requestor" && (
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setLocation("/requests/new")}>
                <PlusCircle className="w-4 h-4 mr-2" /> Submit New Request
              </Button>
            )}
            {user.role === "enterprise_architect" && (
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setLocation("/ea-queue")}>
                <CheckSquare className="w-4 h-4 mr-2" /> Go to Review Queue
              </Button>
            )}
            {user.role === "cloud_architect" && (
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setLocation("/cab-queue")}>
                <Cloud className="w-4 h-4 mr-2" /> Go to Blueprint Queue
              </Button>
            )}
            {user.role === "devsecops_architect" && (
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setLocation("/requests")}>
                <Code2 className="w-4 h-4 mr-2" /> Go to Deployment Queue
              </Button>
            )}
            {user.role === "observability_architect" && (
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setLocation("/requests")}>
                <Activity className="w-4 h-4 mr-2" /> Go to Observability Queue
              </Button>
            )}
            {user.role === "finops_architect" && (
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setLocation("/requests")}>
                <DollarSign className="w-4 h-4 mr-2" /> Go to FinOps Queue
              </Button>
            )}
            {user.role === "admin" && (
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setLocation("/requests/new")}>
                <PlusCircle className="w-4 h-4 mr-2" /> Submit New Request
              </Button>
            )}
            <Button variant="outline" className="border-white/30 text-white hover:bg-white/10" onClick={() => setLocation("/requests")}>
              View All Requests <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* Persona-specific queue */}
      {myQueue && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-bold text-slate-800">{myQueue.label}</h2>
            <Button variant="ghost" size="sm" className="text-xs text-slate-500" onClick={() => setLocation(myQueue.ctaPath)}>
              {myQueue.cta} <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : myQueueRequests.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">{myQueue.emptyMsg}</div>
          ) : (
            <div className="space-y-2">
              {myQueueRequests.slice(0, 8).map((r) => (
                <button key={r.id} onClick={() => setLocation(`/requests/${r.id}`)}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-3 flex items-center gap-4 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">{r.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{r.applicationName} · {r.requestorName}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.priority === "Critical" ? "bg-red-100 text-red-700" : r.priority === "High" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
                      {r.priority}
                    </span>
                    <StatusBadge status={r.status} />
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                  </div>
                </button>
              ))}
              {myQueueRequests.length > 8 && (
                <button onClick={() => setLocation(myQueue.ctaPath)} className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-2">
                  +{myQueueRequests.length - 8} more — {myQueue.cta}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Phase overview cards */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">Onboarding Journey</h2>
            <p className="text-xs text-slate-400 mt-0.5">Five phases from request to provisioned workload. Click any phase to explore.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {PHASES.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.num}
                onClick={() => setLocation(p.path)}
                className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-yellow-300 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: "#FFCD0020" }}>
                    <Icon className="w-5 h-5" style={{ color: "#b49000" }} />
                  </div>
                  <span className="text-[10px] font-bold font-mono tracking-widest text-slate-400 uppercase">Phase {p.num}</span>
                </div>
                <p className="text-sm font-bold text-slate-900 leading-snug mb-1.5">{p.label}</p>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">{p.sub}</p>
                <div className="flex items-end justify-between border-t border-slate-100 pt-3">
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-400">Duration: <span className="font-semibold text-slate-700">{p.duration}</span></p>
                    <p className="text-[10px] text-slate-400">Gate: <span className="font-semibold text-slate-700">{p.gate}</span></p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-yellow-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-1">Typical end-to-end timeline</p>
        <p className="text-[11px] text-slate-400 mb-3">Times are approximate — complexity and approvals affect actual duration.</p>
        <div className="flex h-9 rounded-lg overflow-hidden text-[10px] font-semibold">
          {[
            { label: "Architecture Review", w: "17%", sub: "≤1 wk" },
            { label: "Cloud Architecture Blueprint", w: "17%", sub: "1–2 hrs" },
            { label: "Infrastructure Deployment", w: "36%", sub: "~2 weeks" },
            { label: "Observability", w: "15%", sub: "~2 days" },
            { label: "Cost Management", w: "15%", sub: "ongoing" },
          ].map((seg, idx) => (
            <div
              key={seg.label}
              className="flex flex-col items-center justify-center border-r border-yellow-600/40 last:border-r-0 px-1"
              style={{ width: seg.w, background: "#FFCD00", color: "#1a1a2e", opacity: 0.65 + (idx % 2) * 0.35 }}
            >
              <span className="truncate w-full text-center leading-tight">{seg.label}</span>
              <span className="text-[9px] opacity-70 font-normal">{seg.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Request stats */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
      ) : (
        <>
          {/* Next-step guidance for requestors — dynamic based on actual status */}
          {requestorBanner && (
            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${requestorBanner.color}`}>
              <span className="text-lg shrink-0 leading-none mt-0.5">{requestorBanner.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${allComplete ? "text-emerald-800" : hasActionRequired || hasRejected ? "text-red-800" : "text-amber-800"}`}>
                  {requestorBanner.title}
                </p>
                <p className={`text-xs mt-0.5 ${allComplete ? "text-emerald-700" : hasActionRequired || hasRejected ? "text-red-700" : "text-amber-700"}`}>
                  {requestorBanner.body}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className={`shrink-0 ${allComplete ? "border-emerald-300 text-emerald-800 hover:bg-emerald-100" : hasActionRequired || hasRejected ? "border-red-300 text-red-800 hover:bg-red-100" : "border-amber-300 text-amber-800 hover:bg-amber-100"}`}
                onClick={() => setLocation("/requests")}
              >
                View my requests
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {user.role !== "cloud_architect" && (
              <StatCard label="Awaiting Review" value={submitted + eaTriage + modificationRequested} icon={Clock} color="bg-yellow-100 text-yellow-600" />
            )}
            <StatCard label="Arch Approved" value={approved} icon={CheckCircle} color="bg-green-100 text-green-600" />
            {user.role !== "requestor" && (
              <StatCard label="Not Approved" value={rejected + devsecopsRejected} icon={XCircle} color="bg-red-100 text-red-600" />
            )}
            <StatCard label="Design In Progress" value={inProgress} icon={Cloud} color="bg-blue-100 text-blue-600" />
            <StatCard label="Design Complete" value={completed} icon={FileText} color="bg-purple-100 text-purple-600" />
            {devsecopsApproved + observabilityApproved + finopsActive > 0 && (
              <StatCard label="Infra & Complete" value={devsecopsApproved + observabilityApproved + finopsActive} icon={ShieldCheck} color="bg-emerald-100 text-emerald-600" />
            )}
            {avgDays !== null && (
              <StatCard label="Avg. Review Time (days)" value={parseFloat(avgDays)} icon={BarChart3} color="bg-slate-100 text-slate-600" />
            )}
          </div>

          {requests.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Requests by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={statusChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip formatter={(value: number) => [value, "Requests"]} contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {statusChartData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">By Priority</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={priorityData} cx="50%" cy="45%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                        {priorityData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                      </Pie>
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [v, "Requests"]} contentStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              {buData.length > 1 && (
                <Card className="lg:col-span-3">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700">Requests by Business Unit</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={buData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                        <Tooltip formatter={(v: number) => [v, "Requests"]} contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#FFCD00" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* Recent requests */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Recent Requests</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/requests")} className="text-xs" style={{ color: "#b49000" }}>
            View all <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500 px-6 pb-6">No requests yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recent.map((req) => (
                <button key={req.id} onClick={() => setLocation(`/requests/${req.id}`)}
                  className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{req.title}</p>
                    <p className="text-xs text-slate-500">{req.applicationName} · {req.businessUnit}</p>
                  </div>
                  <StatusBadge status={req.status} />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
