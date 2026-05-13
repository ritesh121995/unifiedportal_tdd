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
  ea_triage: "Under Review",
  ea_approved: "Approved",
  ea_rejected: "Not Approved",
  tdd_in_progress: "Design In Progress",
  tdd_completed: "Design Complete",
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
  { num: 1, label: "Submit & Architecture Review", sub: "Your request is reviewed by Enterprise Architects — they assess risk, security, and technical fit.", color: "#FFCD00", icon: Building2, path: "/phase/1", duration: "≤ 1 week", gate: "EA sign-off" },
  { num: 2, label: "Technical Design Document", sub: "Cloud Architects create a detailed design for your solution — covering infrastructure, security, and costs.", color: "#FFCD00", icon: FileText, path: "/phase/3", duration: "1–2 hours (AI-assisted)", gate: "CA sign-off" },
  { num: 3, label: "Infrastructure Setup", sub: "The approved design is deployed to Azure using automated infrastructure code. Environments are provisioned and tested.", color: "#FFCD00", icon: Code2, path: "/phase/4", duration: "~2 weeks", gate: "Dual approval for Prod" },
  { num: 4, label: "Cost Management", sub: "Ongoing governance of cloud and vendor spend — budgets, tagging, and monthly cost reviews.", color: "#FFCD00", icon: DollarSign, path: "/phase/5", duration: "Ongoing", gate: "Monthly review" },
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
    { name: "Awaiting Review", value: submitted + eaTriage, fill: STATUS_COLORS.submitted },
    { name: "Approved", value: approved, fill: STATUS_COLORS.ea_approved },
    { name: "Not Approved", value: rejected, fill: STATUS_COLORS.ea_rejected },
    { name: "Design Active", value: inProgress, fill: STATUS_COLORS.tdd_in_progress },
    { name: "Complete", value: completed, fill: STATUS_COLORS.tdd_completed },
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
    requestor: "Use this portal to request review for a new application, migration, or technology project. The architecture team will guide you through each step.",
    enterprise_architect: "Review incoming architecture requests, assess risk and domain impact, and approve or route workloads for technical design.",
    cloud_architect: "Pick up approved requests, generate Technical Design Documents, and drive infrastructure deployment.",
    admin: "Full portal access — manage all phases, queues, users, and onboarding governance.",
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

      {/* Phase overview cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-1">How does the onboarding process work?</h2>
        <p className="text-xs text-slate-400 mb-3">Click any phase to learn more or take action.</p>
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
        <p className="text-xs font-semibold text-slate-500 mb-1">Typical end-to-end timeline</p>
        <p className="text-[11px] text-slate-400 mb-3">Times are approximate — complexity and approvals affect actual duration.</p>
        <div className="flex h-9 rounded-lg overflow-hidden text-[10px] font-semibold">
          {[
            { label: "Submit & Review", w: "14%", sub: "≤1 wk" },
            { label: "Risk Assessment", w: "14%", sub: "1–3 days" },
            { label: "Tech Design", w: "14%", sub: "1–2 hrs" },
            { label: "Infrastructure Setup", w: "42%", sub: "~2 weeks" },
            { label: "Cost Mgmt", w: "16%", sub: "ongoing" },
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
          {/* Next-step guidance for requestors */}
          {user.role === "requestor" && requests.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">Your requests are being reviewed</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  You'll see updates here and in the notification bell (top right) as each request moves forward.
                  Click any request below to see its current status and next steps.
                </p>
              </div>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0" onClick={() => setLocation("/requests")}>
                View my requests
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {user.role !== "cloud_architect" && (
              <StatCard label="Awaiting Review" value={submitted + eaTriage} icon={Clock} color="bg-yellow-100 text-yellow-600" />
            )}
            <StatCard label="Approved" value={approved} icon={CheckCircle} color="bg-green-100 text-green-600" />
            {user.role !== "requestor" && (
              <StatCard label="Not Approved" value={rejected} icon={XCircle} color="bg-red-100 text-red-600" />
            )}
            <StatCard label="Design In Progress" value={inProgress} icon={Cloud} color="bg-blue-100 text-blue-600" />
            <StatCard label="Design Complete" value={completed} icon={FileText} color="bg-purple-100 text-purple-600" />
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
