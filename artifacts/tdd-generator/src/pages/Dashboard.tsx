import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  FileText, CheckCircle, Clock, XCircle, PlusCircle, ArrowRight,
  Loader2, Cloud, BarChart3, Building2, ShieldCheck, Code2, DollarSign,
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
  ea_triage: "EA Triage",
  ea_approved: "Approved",
  ea_rejected: "Rejected",
  tdd_in_progress: "TDD In Progress",
  tdd_completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "#f59e0b",
  ea_triage: "#fb923c",
  ea_approved: "#22c55e",
  ea_rejected: "#ef4444",
  tdd_in_progress: "#3b82f6",
  tdd_completed: "#8b5cf6",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#94a3b8",
};

const PHASES = [
  { num: 1, label: "Architecture Review Request (ARR)", sub: "EA + Domain Architects · Cloud · Security · Network · Infra", color: "#FFCD00", icon: Building2, path: "/phase/1", duration: "≤ 1 Week", gate: "EA Sign-off" },
  { num: 2, label: "CCoE App Intake (TDD Generation)", sub: "Technical Design Document · Cloud Tenant only", color: "#FFCD00", icon: FileText, path: "/phase/3", duration: "1–2 Hours", gate: "ARB Approval" },
  { num: 3, label: "DevSecOps / IaC Deployment", sub: "Terraform via McCain Modules · Cloud Tenant only", color: "#FFCD00", icon: Code2, path: "/phase/4", duration: "2 Weeks", gate: "Dual Approval (PRD)" },
  { num: 4, label: "FinOps — Cost Management", sub: "Ongoing Azure & Vendor Cost Governance", color: "#FFCD00", icon: DollarSign, path: "/phase/5", duration: "Ongoing", gate: "Monthly Review" },
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
  const approved = requests.filter((r) => r.status === "ea_approved").length;
  const rejected = requests.filter((r) => r.status === "ea_rejected").length;
  const inProgress = requests.filter((r) => r.status === "tdd_in_progress").length;
  const completed = requests.filter((r) => r.status === "tdd_completed").length;
  const recent = requests.slice(0, 5);

  const statusChartData = [
    { name: "Submitted", value: submitted + eaTriage, fill: STATUS_COLORS.submitted },
    { name: "Approved", value: approved, fill: STATUS_COLORS.ea_approved },
    { name: "Rejected", value: rejected, fill: STATUS_COLORS.ea_rejected },
    { name: "TDD Active", value: inProgress, fill: STATUS_COLORS.tdd_in_progress },
    { name: "Completed", value: completed, fill: STATUS_COLORS.tdd_completed },
  ].filter((d) => d.value > 0);

  const priorityCounts: Record<string, number> = {};
  requests.forEach((r) => { priorityCounts[r.priority] = (priorityCounts[r.priority] ?? 0) + 1; });
  const priorityData = Object.entries(priorityCounts).map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] ?? "#94a3b8" }));

  const buCounts: Record<string, number> = {};
  requests.forEach((r) => { buCounts[r.businessUnit] = (buCounts[r.businessUnit] ?? 0) + 1; });
  const buData = Object.entries(buCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));

  const reviewed = requests.filter((r) => r.eaReviewedAt && ["ea_approved", "ea_rejected", "tdd_in_progress", "tdd_completed"].includes(r.status));
  const avgDays = reviewed.length > 0
    ? (reviewed.reduce((sum, r) => {
        const c = new Date(r.createdAt).getTime();
        const rev = new Date(r.eaReviewedAt!).getTime();
        return sum + (rev - c) / 86400000;
      }, 0) / reviewed.length).toFixed(1)
    : null;

  const roleDesc: Record<string, string> = {
    requestor: "Submit onboarding requests and track your journey through the 6-phase process.",
    enterprise_architect: "Review architecture requests, assess domains, and gate workloads for cloud readiness.",
    cloud_architect: "Design Azure solutions, assess WAF pillars, generate TDDs, and drive deployment.",
    admin: "Full portal access — manage all phases, queues, and onboarding governance.",
  };

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
            {(user.role === "requestor" || user.role === "admin") && (
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setLocation("/requests/new")}>
                <PlusCircle className="w-4 h-4 mr-2" />
                Submit New Request
              </Button>
            )}
            <Button variant="outline" className="border-white/30 text-white hover:bg-white/10" onClick={() => setLocation("/phase/1")}>
              View Phase 1 <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* 5-Phase overview cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-widest">Onboarding Framework — 5 Phases</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {PHASES.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.num}
                onClick={() => setLocation(p.path)}
                className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all group"
                style={{ borderLeftWidth: 4, borderLeftColor: p.color }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg shrink-0" style={{ background: `${p.color}18` }}>
                    <span className="text-[9px] font-mono" style={{ color: p.color }}>P{String(p.num).padStart(2, "0")}</span>
                    <Icon className="w-3.5 h-3.5" style={{ color: p.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 leading-tight">{p.label}</p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: p.color }}>{p.sub}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-slate-400">{p.duration}</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] text-slate-400">Gate: {p.gate}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">Indicative Timeline — End-to-End Engagement</p>
        <div className="flex h-8 rounded overflow-hidden text-[9px] font-mono">
          {[
            { label: "P1 · EA & Arch", w: "14%" },
            { label: "P2 · Risk", w: "14%" },
            { label: "P3 · TDD", w: "14%" },
            { label: "P4 · DevSecOps", w: "42%" },
            { label: "P5 · FinOps ∞", w: "16%" },
          ].map((seg, idx) => (
            <div
              key={seg.label}
              className="flex items-center justify-center border-r border-yellow-600/40 last:border-r-0"
              style={{ width: seg.w, background: "#FFCD00", color: "#1a1a2e", opacity: 0.7 + (idx % 2) * 0.3 }}
            >
              {seg.label}
            </div>
          ))}
        </div>
        <div className="flex mt-1.5">
          {["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 6", "Wk 10", "Wk 14", "Wk 18+"].map((w) => (
            <div key={w} className="flex-1 text-center text-[9px] font-mono text-slate-400">{w}</div>
          ))}
        </div>
      </div>

      {/* Request stats */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {user.role !== "cloud_architect" && (
              <StatCard label="Pending Review" value={submitted + eaTriage} icon={Clock} color="bg-yellow-100 text-yellow-600" />
            )}
            <StatCard label="EA Approved" value={approved} icon={CheckCircle} color="bg-green-100 text-green-600" />
            {user.role !== "requestor" && (
              <StatCard label="EA Rejected" value={rejected} icon={XCircle} color="bg-red-100 text-red-600" />
            )}
            <StatCard label="TDD In Progress" value={inProgress} icon={Cloud} color="bg-blue-100 text-blue-600" />
            <StatCard label="TDD Completed" value={completed} icon={FileText} color="bg-purple-100 text-purple-600" />
            {avgDays !== null && (
              <StatCard label="Avg CCoE Intake (days)" value={parseFloat(avgDays)} icon={BarChart3} color="bg-slate-100 text-slate-600" />
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
