import { useLocation } from "wouter";
import { ArrowRight, FileText, CheckCircle2, Clock, Zap, Settings, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PHASE_COLOR = "#FFCD00";

const CAB_SECTIONS = [
  { num: "01", title: "Executive Summary", icon: FileText, status: "auto", desc: "Project overview, objectives, stakeholders, and strategic alignment with McCain enterprise goals." },
  { num: "02", title: "Architecture Design", icon: GitBranch, status: "auto", desc: "High-level and detailed Azure architecture diagrams, component inventory, and design decisions." },
  { num: "03", title: "Security Controls", icon: CheckCircle2, status: "auto", desc: "Security baseline, identity architecture, network segmentation, and CISO-approved controls." },
  { num: "04", title: "Operations & SLAs", icon: Clock, status: "pending", desc: "SLA definitions, monitoring strategy, runbooks, incident response, and BCDR procedures." },
  { num: "05", title: "Data Architecture", icon: Settings, status: "pending", desc: "Data flows, classification levels, retention policies, and sovereignty requirements." },
  { num: "06", title: "Cost & FinOps", icon: Zap, status: "pending", desc: "Total Cost of Ownership, tagging strategy, budget governance, and reserved instance plan." },
];


export default function Phase4CABGeneration() {
  const [, setLocation] = useLocation();

  const autoSections = CAB_SECTIONS.filter((s) => s.status === "auto").length;
  const pendingSections = CAB_SECTIONS.filter((s) => s.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-white" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">Phase 2 · Cloud Architecture Blueprint</p>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Cloud Architecture Blueprint</h1>
            <p className="text-sm opacity-80 max-w-xl">
              Auto-generate a comprehensive cloud architecture blueprint covering architecture decisions, security controls, data flows, and operational requirements.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["AI-Assisted", "Version Control", "Architecture Sign-off"].map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/30 bg-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-4xl font-black mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>{autoSections}/6</div>
            <div className="text-xs opacity-70 font-mono">Sections Ready</div>
            <div className="mt-2 px-3 py-1 rounded-full text-xs font-mono bg-yellow-500/30">
              {pendingSections} Needs Input
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 6-section document builder */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Document Sections</CardTitle>
              <p className="text-xs text-slate-500">Each section is generated from your submitted request details. Review before final submission.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {CAB_SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <div key={section.num} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-white hover:shadow-sm transition-all">
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <span className="text-[10px] font-mono font-bold" style={{ color: PHASE_COLOR }}>§{section.num}</span>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${PHASE_COLOR}18` }}>
                        <Icon className="w-4 h-4" style={{ color: PHASE_COLOR }} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-800">{section.title}</p>
                        {section.status === "auto"
                          ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-green-100 text-green-700 font-medium"><CheckCircle2 className="w-3 h-3" />Ready</span>
                          : <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-yellow-100 text-yellow-700 font-medium"><Clock className="w-3 h-3" />Needs Input</span>
                        }
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{section.desc}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Selectors + Generate button */}
        <div className="space-y-4">
          <Card style={{ borderColor: PHASE_COLOR, borderWidth: 2 }}>
            <CardContent className="p-5">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ background: `${PHASE_COLOR}18` }}>
                  <Zap className="w-6 h-6" style={{ color: PHASE_COLOR }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Generate Cloud Architecture Blueprint</p>
                  <p className="text-xs text-slate-500 mt-1">Auto-generates all sections using AI from your submitted request details. Review before final submission.</p>
                </div>
                <Button className="w-full font-semibold" style={{ background: PHASE_COLOR, color: "#1a1a2e" }} onClick={() => setLocation("/requests")}>
                  One-Click Generate
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-[10px] text-slate-400 font-mono">Requires an approved request</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Key Deliverables</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {["Cloud Architecture Blueprint (.docx)", "Architecture Diagrams", "Component Spec Sheets", "Data Flow Documentation", "Architecture Approval Record"].map((d) => (
                  <li key={d} className="flex items-center gap-2 text-xs text-slate-600">
                    <span style={{ color: PHASE_COLOR }}>→</span>
                    {d}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SPOC */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black text-lg" style={{ background: PHASE_COLOR, color: "#1a1a2e" }}>CA</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono uppercase tracking-widest text-yellow-700 mb-0.5">Phase 2 SPOC</p>
            <p className="text-sm font-bold text-slate-900">Cloud Architect</p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Responsible for producing and signing off the Cloud Architecture Blueprint. Translates the approved architecture into an AI-assisted, version-controlled CAB covering infrastructure design, security controls, data flows, and cost estimates.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {["CAB Generation", "Architecture Diagrams", "Security Baseline", "Cost Estimation", "CA Sign-off"].map((r) => (
                <span key={r} className="text-[10px] px-2 py-0.5 rounded border font-medium" style={{ borderColor: "#FFCD0060", color: "#92400e", background: "#FFCD0018" }}>{r}</span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Best Practices */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FFCD0020" }}>
              <span className="text-xs">🤖</span>
            </div>
            <CardTitle className="text-sm">AI-Recommended Best Practices — Cloud Architecture Blueprint</CardTitle>
          </div>
          <p className="text-xs text-slate-500 mt-1">Patterns that improve CAB quality and reduce rework in subsequent phases.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { title: "Design for Failure from the Start", body: "Define failure modes for every component before selecting SKUs. Use Azure Chaos Studio to validate resilience assumptions. A design that hasn't considered failure paths will fail in production.", tag: "Reliability" },
              { title: "Apply Zero-Trust Network Segmentation", body: "Default all network communication to denied. Explicitly allow only required flows using Private Endpoints, NSGs, and Azure Firewall. Document each allowed flow in the CAB with its business justification.", tag: "Security" },
              { title: "Right-size with Reserved Instance Analysis", body: "Run Infracost or Azure Pricing Calculator estimates during CAB generation. Flag workloads that would benefit from Reserved Instances or Savings Plans — Cost Management is significantly easier when pre-planned at design time.", tag: "FinOps" },
              { title: "Define SLAs Before Selecting SKUs", body: "SLA targets drive SKU choices, not the other way around. A 99.99% SLA requirement eliminates single-instance VMs entirely. Capture the target SLA in the CAB so every infrastructure decision can be traced back to it.", tag: "Reliability" },
              { title: "Use Managed Identities, Never Secrets", body: "Every Azure-to-Azure authentication must use Managed Identity. No connection strings, API keys, or passwords in application config. Document the identity assignment in the CAB — it's audited during DevSecOps review.", tag: "Security" },
              { title: "Version-control the CAB from Day One", body: "Tag every CAB version with the approval date and approver. When infrastructure drifts from the approved design, you need a versioned CAB to prove what was approved. Use the portal's version history, not email.", tag: "Governance" },
            ].map((bp) => (
              <div key={bp.title} className="p-3 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5" style={{ background: `${PHASE_COLOR}25`, color: "#92400e" }}>{bp.tag}</span>
                  <p className="text-xs font-semibold text-slate-800">{bp.title}</p>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{bp.body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
