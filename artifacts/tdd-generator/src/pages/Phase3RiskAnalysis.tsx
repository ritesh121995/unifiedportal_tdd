import { useState } from "react";
import { ShieldCheck, CheckSquare, Square, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PHASE_COLOR = "#FFCD00";

const RISKS = [
  { id: 1, title: "Unencrypted data in transit", category: "Security", likelihood: 3, impact: 5, cvss: 8.1, owner: "CCoE / CISO", mitigation: "Enforce TLS 1.3 via Azure Policy", status: "open" },
  { id: 2, title: "Over-privileged service accounts", category: "Identity", likelihood: 4, impact: 4, cvss: 7.4, owner: "Identity Team", mitigation: "Implement Least Privilege with PIM reviews", status: "in-progress" },
  { id: 3, title: "No BCDR test executed", category: "Resilience", likelihood: 2, impact: 5, cvss: 6.8, owner: "Cloud Eng", mitigation: "Schedule quarterly failover drills", status: "open" },
  { id: 4, title: "Third-party dependency vulnerabilities", category: "Supply Chain", likelihood: 3, impact: 4, cvss: 6.3, owner: "DevSecOps", mitigation: "Integrate Dependabot + SCA scanning in pipeline", status: "in-progress" },
  { id: 5, title: "Insufficient logging and alerting", category: "Operations", likelihood: 3, impact: 3, cvss: 5.5, owner: "Operations", mitigation: "Deploy centralised Log Analytics + Sentinel SIEM", status: "closed" },
  { id: 6, title: "Data residency non-compliance (PIPEDA)", category: "Compliance", likelihood: 2, impact: 5, cvss: 7.0, owner: "GRC Team", mitigation: "Enforce Canada-only regions via Azure Policy", status: "in-progress" },
  { id: 7, title: "Weak key rotation policy", category: "Cryptography", likelihood: 2, impact: 4, cvss: 5.9, owner: "CISO", mitigation: "Automate key rotation via Azure Key Vault policies", status: "open" },
  { id: 8, title: "SQL injection surface in legacy API", category: "Application", likelihood: 2, impact: 4, cvss: 5.4, owner: "Dev Team", mitigation: "Parameterised queries + DAST scanning in CI", status: "closed" },
];

const COMPLIANCE_FRAMEWORKS = [
  {
    id: "nist",
    label: "NIST CSF 2.0",
    color: "#FFCD00",
    items: [
      { label: "GV.OC-01 — Organisational Context", checked: true },
      { label: "ID.AM-02 — Software Asset Inventory", checked: true },
      { label: "PR.AA-01 — Access Control Policy", checked: true },
      { label: "PR.DS-01 — Data in Rest Encryption", checked: false },
      { label: "DE.CM-01 — Continuous Monitoring", checked: true },
      { label: "RS.CO-02 — Incident Reporting", checked: false },
    ],
  },
  {
    id: "iso27001",
    label: "ISO 27001:2022",
    color: "#FFCD00",
    items: [
      { label: "A.5 — Information Security Policies", checked: true },
      { label: "A.6 — Organisation of Information Security", checked: true },
      { label: "A.8 — Asset Management", checked: false },
      { label: "A.12 — Operations Security", checked: true },
      { label: "A.13 — Communications Security", checked: true },
      { label: "A.18 — Compliance", checked: false },
    ],
  },
  {
    id: "soc2",
    label: "SOC 2 Type II",
    color: "#FFCD00",
    items: [
      { label: "CC1 — Control Environment", checked: true },
      { label: "CC6 — Logical Access Controls", checked: true },
      { label: "CC7 — System Operations", checked: false },
      { label: "CC8 — Change Management", checked: true },
      { label: "A1 — Availability", checked: false },
      { label: "C1 — Confidentiality", checked: true },
    ],
  },
  {
    id: "pipeda",
    label: "PIPEDA",
    color: "#FFCD00",
    items: [
      { label: "Accountability — DPA Designated", checked: true },
      { label: "Limiting Collection — Minimal Data", checked: true },
      { label: "Limiting Use — Purpose Binding", checked: true },
      { label: "Safeguards — Encryption at Rest", checked: false },
      { label: "Individual Access — Data Subject Rights", checked: false },
      { label: "Challenging Compliance — Audit Trail", checked: true },
    ],
  },
  {
    id: "pcidss",
    label: "PCI-DSS v4.0",
    color: "#FFCD00",
    items: [
      { label: "Req 1 — Network Security Controls", checked: true },
      { label: "Req 2 — Secure Configurations", checked: true },
      { label: "Req 3 — Protect Account Data", checked: false },
      { label: "Req 6 — Develop & Maintain Secure Systems", checked: true },
      { label: "Req 10 — Log & Monitor Access", checked: true },
      { label: "Req 12 — Org Info Security Policy", checked: false },
    ],
  },
];

const HEAT_LABELS_X = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const HEAT_LABELS_Y = ["Catastrophic", "Major", "Moderate", "Minor", "Negligible"];

function heatColor(likelihood: number, impact: number): string {
  const score = likelihood * impact;
  if (score >= 15) return "#ef4444";
  if (score >= 9) return "#f97316";
  if (score >= 4) return "#f59e0b";
  return "#22c55e";
}

function cvssColor(score: number): string {
  if (score >= 9) return "#ef4444";
  if (score >= 7) return "#f97316";
  if (score >= 4) return "#f59e0b";
  return "#22c55e";
}

export default function Phase3RiskAnalysis() {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    COMPLIANCE_FRAMEWORKS.forEach((fw) => {
      fw.items.forEach((item, idx) => {
        init[`${fw.id}_${idx}`] = item.checked;
      });
    });
    return init;
  });

  const toggleCheck = (key: string) => setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));

  const openRisks = RISKS.filter((r) => r.status === "open").length;
  const inProgressRisks = RISKS.filter((r) => r.status === "in-progress").length;
  const closedRisks = RISKS.filter((r) => r.status === "closed").length;

  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-white" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">Phase 02 · Threat Modelling & Compliance</p>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Risk Analysis</h1>
            <p className="text-sm opacity-80 max-w-xl">
              Comprehensive risk assessment covering CVSS-scored threat modelling, an interactive 5×5 risk heat map, and multi-framework compliance checklists.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["NIST CSF 2.0", "ISO 27001", "Risk Register", "PIPEDA"].map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/30 bg-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="flex gap-3 shrink-0">
            {[{ label: "Open", val: openRisks, color: "#ef4444" }, { label: "Active", val: inProgressRisks, color: "#f97316" }, { label: "Closed", val: closedRisks, color: "#22c55e" }].map((s) => (
              <div key={s.label} className="text-center bg-white/10 rounded-xl px-4 py-2">
                <p className="text-2xl font-black" style={{ fontFamily: "Outfit, sans-serif" }}>{s.val}</p>
                <p className="text-[10px] opacity-70 font-mono">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Risk Register */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Live Risk Register — CVSS Scoring</CardTitle>
              <p className="text-xs text-slate-500">Risks sorted by CVSS score (highest first). Owner-assigned with mitigation status.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Risk</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-slate-600">CVSS</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-slate-600">L×I</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-600">Owner</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...RISKS].sort((a, b) => b.cvss - a.cvss).map((risk) => (
                      <tr key={risk.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{risk.title}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{risk.category} · {risk.mitigation}</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="px-2 py-0.5 rounded font-bold text-white text-[11px]" style={{ background: cvssColor(risk.cvss) }}>
                            {risk.cvss.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="px-2 py-0.5 rounded font-mono text-[11px] text-slate-600 bg-slate-100">
                            {risk.likelihood}×{risk.impact}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{risk.owner}</td>
                        <td className="px-3 py-3 text-center">
                          <StatusChip status={risk.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Risk Heat Map */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Risk Heat Map — 5×5 Matrix</CardTitle>
              <p className="text-xs text-slate-500">Likelihood (X) vs Impact (Y). Dots = registered risks.</p>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="flex flex-col justify-around text-right pr-1">
                  {HEAT_LABELS_Y.map((l) => (
                    <span key={l} className="text-[9px] text-slate-400 font-mono leading-none">{l.substring(0, 5)}</span>
                  ))}
                </div>
                <div className="flex-1">
                  <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                    {Array.from({ length: 5 }, (_, rowIdx) =>
                      Array.from({ length: 5 }, (_, colIdx) => {
                        const likelihood = colIdx + 1;
                        const impact = 5 - rowIdx;
                        const risksHere = RISKS.filter((r) => r.likelihood === likelihood && r.impact === impact);
                        const bg = heatColor(likelihood, impact);
                        return (
                          <div key={`${rowIdx}-${colIdx}`} className="relative aspect-square rounded flex items-center justify-center opacity-80"
                            style={{ background: `${bg}40`, border: `1px solid ${bg}60` }}>
                            {risksHere.length > 0 && (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                style={{ background: bg }}>
                                {risksHere.length}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex justify-around mt-1">
                    {HEAT_LABELS_X.map((l) => (
                      <span key={l} className="text-[9px] text-slate-400 font-mono text-center" style={{ flex: 1 }}>{l.substring(0, 4)}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-1.5 mt-4">
                {[{ label: "Critical (≥15)", color: "#ef4444" }, { label: "High (9–14)", color: "#f97316" }, { label: "Medium (4–8)", color: "#f59e0b" }, { label: "Low (<4)", color: "#22c55e" }].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Compliance Checklists */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest mb-3">Compliance Frameworks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {COMPLIANCE_FRAMEWORKS.map((fw) => {
            const total = fw.items.length;
            const passing = fw.items.filter((_, idx) => checkedItems[`${fw.id}_${idx}`]).length;
            const pct = Math.round((passing / total) * 100);
            return (
              <Card key={fw.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" style={{ color: fw.color }} />
                      <CardTitle className="text-sm">{fw.label}</CardTitle>
                    </div>
                    <span className="text-sm font-bold" style={{ color: fw.color }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: fw.color }} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {fw.items.map((item, idx) => {
                    const key = `${fw.id}_${idx}`;
                    const isChecked = checkedItems[key];
                    return (
                      <button key={key} onClick={() => toggleCheck(key)}
                        className="w-full flex items-start gap-2 text-left group"
                      >
                        {isChecked
                          ? <CheckSquare className="w-4 h-4 shrink-0 mt-0.5" style={{ color: fw.color }} />
                          : <Square className="w-4 h-4 shrink-0 mt-0.5 text-slate-300 group-hover:text-slate-400" />
                        }
                        <span className={cn("text-xs leading-relaxed", isChecked ? "text-slate-700" : "text-slate-400 line-through")}>{item.label}</span>
                      </button>
                    );
                  })}
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-300" />
                    <span className="text-[10px] text-slate-400">{passing}/{total} controls satisfied</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    open: { label: "Open", cls: "bg-red-100 text-red-700" },
    "in-progress": { label: "In Progress", cls: "bg-yellow-100 text-yellow-700" },
    closed: { label: "Closed", cls: "bg-green-100 text-green-700" },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`px-2 py-0.5 rounded-full font-medium text-[10px] ${c.cls}`}>{c.label}</span>;
}
