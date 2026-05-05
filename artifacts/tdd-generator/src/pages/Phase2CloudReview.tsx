import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PHASE_COLOR = "#FFCD00";

const WAF_PILLARS = [
  {
    id: "reliability",
    label: "Reliability",
    score: 84,
    items: [
      { name: "Multi-region failover configured", status: "pass" },
      { name: "Recovery Time Objective (RTO) ≤ 4 hours", status: "pass" },
      { name: "Recovery Point Objective (RPO) ≤ 1 hour", status: "pass" },
      { name: "Circuit breaker patterns implemented", status: "warning" },
      { name: "Chaos engineering tests executed", status: "fail" },
      { name: "Availability zones utilised (≥ 2)", status: "pass" },
    ],
  },
  {
    id: "security",
    label: "Security",
    score: 71,
    items: [
      { name: "Azure Defender for Cloud enabled", status: "pass" },
      { name: "Private endpoints configured", status: "pass" },
      { name: "Managed Identity (no service principal secrets)", status: "warning" },
      { name: "Customer Managed Keys (CMK) for encryption", status: "fail" },
      { name: "DDoS Protection Standard enabled", status: "pass" },
      { name: "Just-in-Time (JIT) VM access active", status: "warning" },
    ],
  },
  {
    id: "cost",
    label: "Cost Optimisation",
    score: 78,
    items: [
      { name: "Reserved Instances for steady-state workloads", status: "warning" },
      { name: "Azure Hybrid Benefit applied", status: "pass" },
      { name: "Auto-scaling configured for variable loads", status: "pass" },
      { name: "Cost budget alerts (80% / 100%) set", status: "pass" },
      { name: "Orphaned resource cleanup automation", status: "fail" },
      { name: "Tag policy for cost allocation enforced", status: "warning" },
    ],
  },
  {
    id: "operations",
    label: "Operational Excellence",
    score: 89,
    items: [
      { name: "Infrastructure as Code (Terraform) for all resources", status: "pass" },
      { name: "Azure Monitor + Log Analytics workspace", status: "pass" },
      { name: "Runbooks documented in Azure Automation", status: "pass" },
      { name: "Deployment pipeline (DEV→QA→STG→PRD)", status: "pass" },
      { name: "Change management process integrated", status: "warning" },
      { name: "Incident response playbooks defined", status: "pass" },
    ],
  },
  {
    id: "performance",
    label: "Performance Efficiency",
    score: 76,
    items: [
      { name: "CDN / Azure Front Door for global distribution", status: "pass" },
      { name: "Redis Cache for hot data paths", status: "pass" },
      { name: "Database indexing strategy reviewed", status: "warning" },
      { name: "Load testing executed at 2× expected peak", status: "fail" },
      { name: "Performance budgets defined and monitored", status: "warning" },
      { name: "Right-sized SKUs validated", status: "pass" },
    ],
  },
];

const LANDING_ZONE_ITEMS = [
  { label: "Hub-Spoke VNet Topology", status: "active" },
  { label: "Azure Policy — Deny Public IPs", status: "active" },
  { label: "Management Group Hierarchy", status: "active" },
  { label: "Azure Defender for Cloud (P2)", status: "active" },
  { label: "Budget Alerts — All Subscriptions", status: "warning" },
  { label: "Privileged Identity Management (PIM)", status: "active" },
  { label: "Diagnostic Settings — All Resources", status: "warning" },
  { label: "Private DNS Zones Configured", status: "active" },
  { label: "Canadia Central Hub Connectivity", status: "active" },
  { label: "Express Route / VPN Gateway", status: "pending" },
];

function StatusIcon({ status }: { status: string }) {
  if (status === "pass" || status === "active") return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
  if (status === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
  if (status === "fail") return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
  return <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />;
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 65 ? "#f59e0b" : "#ef4444";
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#f1f5f9" strokeWidth="6" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 34 34)" />
      <text x="34" y="38" textAnchor="middle" fontSize="14" fontWeight="800" fill="#1e293b">{score}</text>
    </svg>
  );
}

export default function Phase2CloudReview() {
  const [expanded, setExpanded] = useState<string | null>("reliability");

  const overallWaf = Math.round(WAF_PILLARS.reduce((s, p) => s + p.score, 0) / WAF_PILLARS.length);
  const passCount = WAF_PILLARS.flatMap((p) => p.items).filter((i) => i.status === "pass").length;
  const failCount = WAF_PILLARS.flatMap((p) => p.items).filter((i) => i.status === "fail").length;
  const warnCount = WAF_PILLARS.flatMap((p) => p.items).filter((i) => i.status === "warning").length;

  const actionItems = WAF_PILLARS.flatMap((p) =>
    p.items.filter((i) => i.status !== "pass").map((i) => ({ pillar: p.label, item: i.name, status: i.status }))
  );

  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-white" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">Phase 02 · Azure Design & WAF Assessment</p>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Cloud Architecture Review</h1>
            <p className="text-sm opacity-80 max-w-xl">
              Design Azure-native architecture aligned with the Microsoft Well-Architected Framework across all 5 pillars. Validate against McCain Azure Landing Zone and CCoE standards.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["Azure WAF", "Landing Zone", "Hub-Spoke VNet", "CCoE Standards"].map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/30 bg-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-4xl font-black mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>{overallWaf}%</div>
            <div className="text-xs opacity-70 font-mono">WAF Score</div>
            <div className={cn("mt-2 px-3 py-1 rounded-full text-xs font-mono", overallWaf >= 80 ? "bg-green-500/30" : "bg-yellow-500/30")}>
              {overallWaf >= 80 ? "Gate: PASS" : "Below Threshold"}
            </div>
          </div>
        </div>
      </div>

      {/* WAF score summary pills */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
          <div><p className="text-2xl font-bold text-green-700">{passCount}</p><p className="text-xs text-green-600">Passing Controls</p></div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-yellow-500" />
          <div><p className="text-2xl font-bold text-yellow-700">{warnCount}</p><p className="text-xs text-yellow-600">Warnings</p></div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-8 h-8 text-red-500" />
          <div><p className="text-2xl font-bold text-red-700">{failCount}</p><p className="text-xs text-red-600">Failing Controls</p></div>
        </div>
      </div>

      {/* WAF Assessment Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Well-Architected Framework Assessment — All 5 Pillars</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3">
          {WAF_PILLARS.map((pillar) => {
            const isOpen = expanded === pillar.id;
            const scoreColor = pillar.score >= 80 ? "#22c55e" : pillar.score >= 65 ? "#f59e0b" : "#ef4444";
            return (
              <div key={pillar.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : pillar.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <ScoreGauge score={pillar.score} />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-slate-800">{pillar.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-green-600">{pillar.items.filter((i) => i.status === "pass").length} pass</span>
                        <span className="text-[10px] text-yellow-600">{pillar.items.filter((i) => i.status === "warning").length} warn</span>
                        <span className="text-[10px] text-red-600">{pillar.items.filter((i) => i.status === "fail").length} fail</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pillar.score}%`, background: scoreColor }} />
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    <div className="space-y-2">
                      {pillar.items.map((item) => (
                        <div key={item.name} className="flex items-center gap-3">
                          <StatusIcon status={item.status} />
                          <span className="text-xs text-slate-700">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Landing Zone Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">McCain Azure Landing Zone — Configuration Status</CardTitle>
            <p className="text-xs text-slate-500">Canada Central · Hub-Spoke Topology · CCoE v2.4</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {LANDING_ZONE_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-xs py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={item.status} />
                    <span className="text-slate-700">{item.label}</span>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium",
                    item.status === "active" ? "bg-green-100 text-green-700" :
                    item.status === "warning" ? "bg-yellow-100 text-yellow-700" :
                    "bg-slate-100 text-slate-500"
                  )}>
                    {item.status === "active" ? "Active" : item.status === "warning" ? "Review" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Action Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">WAF Action Items</CardTitle>
            <p className="text-xs text-slate-500">{actionItems.length} items require attention before gate approval.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {actionItems.map((ai, idx) => (
                <div key={idx} className={cn("p-3 rounded-xl text-xs border",
                  ai.status === "fail" ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
                )}>
                  <div className="flex items-start gap-2">
                    <StatusIcon status={ai.status} />
                    <div>
                      <p className="font-medium text-slate-700">{ai.item}</p>
                      <p className={cn("text-[10px] font-mono mt-0.5", ai.status === "fail" ? "text-red-600" : "text-yellow-600")}>
                        Pillar: {ai.pillar} · {ai.status === "fail" ? "Remediation Required" : "Improvement Recommended"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
