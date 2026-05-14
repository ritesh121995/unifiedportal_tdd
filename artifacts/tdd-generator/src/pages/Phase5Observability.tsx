import { Activity, AlertTriangle, BarChart3, Bell, BookOpen, CheckCircle2, Eye, Layers, MonitorDot, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PHASE_COLOR = "#FFCD00";

const PILLARS = [
  {
    icon: MonitorDot,
    title: "Azure Monitor",
    sub: "Platform metrics & resource health",
    items: [
      "VM, AKS, App Service, and SQL metrics collected automatically",
      "Resource health alerts with action groups (email / Teams)",
      "Activity log alerts for security-relevant control-plane events",
      "90-day hot retention + archival to Storage Account",
    ],
    color: "#0078d4",
  },
  {
    icon: Eye,
    title: "Application Insights",
    sub: "End-to-end request tracing",
    items: [
      "Distributed tracing across all microservices via OpenTelemetry",
      "Custom KPIs: p95 latency, error rate, dependency failure rate",
      "Live Metrics stream for real-time health during deployments",
      "Smart Detection for anomaly-based alerting without threshold tuning",
    ],
    color: "#7b42bc",
  },
  {
    icon: Layers,
    title: "Log Analytics Workspace",
    sub: "Centralised log aggregation",
    items: [
      "All diagnostic logs shipped to mccain-central-laws workspace",
      "KQL-based workbooks for security, performance, and cost views",
      "Log retention: 90 days interactive, 2 years archive (compliance)",
      "Linked to Microsoft Sentinel for SIEM correlation",
    ],
    color: "#2da44e",
  },
  {
    icon: BarChart3,
    title: "Dashboards & Workbooks",
    sub: "Role-specific operational views",
    items: [
      "Executive summary: SLA attainment, request volume, error budget",
      "Ops team: infra health, alert fatigue, top failing resources",
      "Dev team: dependency map, slow transactions, exception drill-down",
      "Published to Azure Managed Grafana for shared access",
    ],
    color: "#f59e0b",
  },
  {
    icon: Bell,
    title: "Alert Strategy",
    sub: "Signal-to-noise engineered alerts",
    items: [
      "Severity-based routing: P1 → PagerDuty, P2/P3 → Teams channel",
      "Dynamic thresholds on all time-series metrics (reduces false positives)",
      "Composite alerts for correlated multi-signal incidents",
      "Alert suppression windows during planned maintenance",
    ],
    color: "#ef4444",
  },
  {
    icon: BookOpen,
    title: "On-Call Runbooks",
    sub: "Documented response procedures",
    items: [
      "Runbook per alert: trigger condition, impact, diagnosis steps, fix",
      "Stored in Confluence under the application's CCoE space",
      "Linked directly from Azure Monitor alert action groups",
      "Quarterly runbook review built into operational cadence",
    ],
    color: "#06b6d4",
  },
];

const CHECKLIST = [
  { label: "Azure Monitor metrics collection verified for all resources", owner: "Cloud Architect" },
  { label: "Application Insights connected and telemetry flowing", owner: "Dev Team" },
  { label: "Log Analytics workspace linked and diagnostic settings active", owner: "Cloud Architect" },
  { label: "Alert rules created for P1 scenarios with correct action groups", owner: "Cloud Architect" },
  { label: "Operational dashboard published and shared with stakeholders", owner: "Cloud Architect" },
  { label: "On-call runbooks written, reviewed, and linked from alerts", owner: "App Owner" },
];

const SLA_TIERS = [
  { tier: "Tier 1 — Mission Critical", sla: "99.99%", rpo: "< 15 min", rto: "< 1 hr", oncall: "24/7 PagerDuty" },
  { tier: "Tier 2 — Business Critical", sla: "99.9%", rpo: "< 1 hr", rto: "< 4 hrs", oncall: "Business hrs + on-call" },
  { tier: "Tier 3 — Standard", sla: "99.5%", rpo: "< 4 hrs", rto: "< 8 hrs", oncall: "Business hrs only" },
  { tier: "Tier 4 — Development / Test", sla: "95%", rpo: "24 hrs", rto: "Next business day", oncall: "None" },
];

export default function Phase5Observability() {
  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-white" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">Phase 4 · Observability</p>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Observability</h1>
            <p className="text-sm opacity-80 max-w-xl">
              Every workload provisioned through the portal must demonstrate full observability before cost management is activated.
              Monitoring, alerting, dashboards, and on-call runbooks are all mandatory gates.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["Azure Monitor", "Application Insights", "Log Analytics", "Managed Grafana", "On-Call Runbooks"].map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/30 bg-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {[
              { label: "Observability Pillars", val: 6 },
              { label: "Checklist Items", val: CHECKLIST.length },
              { label: "SLA Tiers Supported", val: 4 },
            ].map((s) => (
              <div key={s.label} className="text-center bg-white/10 rounded-xl px-4 py-2">
                <p className="text-xl font-black" style={{ fontFamily: "Outfit, sans-serif" }}>{s.val}</p>
                <p className="text-[10px] opacity-70 font-mono">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Six observability pillars */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Six Observability Pillars — All Required</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.title} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${p.color}18` }}>
                      <Icon className="w-4.5 h-4.5" style={{ color: p.color, width: 18, height: 18 }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{p.title}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{p.sub}</p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {p.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[11px] text-slate-600 leading-relaxed">
                        <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sign-off checklist */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Observability Sign-Off Checklist</CardTitle>
            <p className="text-xs text-slate-500">Cloud Architect confirms all items before FinOps is activated</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {CHECKLIST.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-slate-300" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 leading-relaxed">{item.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Owner: {item.owner}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* SLA tiers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Workload SLA Tiers</CardTitle>
            <p className="text-xs text-slate-500">Monitoring and on-call requirements scale with the workload tier</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {SLA_TIERS.map((t, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-800">{t.tier}</p>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: `${PHASE_COLOR}25`, color: "#b49000" }}>
                    {t.sla}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                  <div><span className="font-semibold text-slate-700">RPO</span> {t.rpo}</div>
                  <div><span className="font-semibold text-slate-700">RTO</span> {t.rto}</div>
                  <div><span className="font-semibold text-slate-700">On-call</span> {t.oncall}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Alert severity framework */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Alert Severity & Escalation Framework
          </CardTitle>
          <p className="text-xs text-slate-500">Standardised across all CCoE-provisioned workloads</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { sev: "SEV 0 — Critical", color: "#ef4444", bg: "#fef2f2", border: "#fecaca", examples: "Complete outage, data loss", response: "Immediate — wake on-call", teams: "PagerDuty → Eng lead + CCoE" },
              { sev: "SEV 1 — High", color: "#f97316", bg: "#fff7ed", border: "#fed7aa", examples: "Major feature broken, >10% error rate", response: "< 15 min during business hrs", teams: "Teams alert → On-call engineer" },
              { sev: "SEV 2 — Medium", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", examples: "Degraded performance, non-critical failure", response: "< 2 hrs during business hrs", teams: "Teams channel notification" },
              { sev: "SEV 3 — Low", color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", examples: "Minor issue, informational", response: "Next business day", teams: "Ticket created automatically" },
            ].map((s) => (
              <div key={s.sev} className="rounded-xl border p-4" style={{ background: s.bg, borderColor: s.border }}>
                <p className="text-xs font-bold mb-2" style={{ color: s.color }}>{s.sev}</p>
                <div className="space-y-1.5 text-[10px] text-slate-600">
                  <div><span className="font-semibold">Examples:</span> {s.examples}</div>
                  <div><span className="font-semibold">Response:</span> {s.response}</div>
                  <div><span className="font-semibold">Routing:</span> {s.teams}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Why observability before FinOps */}
      <Card className="border-cyan-200 bg-cyan-50">
        <CardContent className="p-5 flex items-start gap-4">
          <Activity className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cyan-800 mb-1">Why Observability is a Gate Before Cost Management</p>
            <p className="text-xs text-cyan-700 leading-relaxed">
              Cost Management tracking is only meaningful if you can correlate spend with actual workload behaviour.
              Without telemetry in place, you cannot detect cost spikes caused by runaway processes, oversized resources,
              or misconfigured autoscaling. The Observability gate ensures every workload enters FinOps with the
              instrumentation needed to act on cost anomalies before they escalate.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
