import { useLocation } from "wouter";
import { ArrowRight, FileText, CheckCircle2, Clock, Zap, Settings, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PHASE_COLOR = "#FFCD00";

const TDD_SECTIONS = [
  { num: "01", title: "Executive Summary", icon: FileText, status: "auto", desc: "Project overview, objectives, stakeholders, and strategic alignment with McCain enterprise goals." },
  { num: "02", title: "Architecture Design", icon: GitBranch, status: "auto", desc: "High-level and detailed Azure architecture diagrams, component inventory, and design decisions." },
  { num: "03", title: "Security Controls", icon: CheckCircle2, status: "auto", desc: "Security baseline, identity architecture, network segmentation, and CISO-approved controls." },
  { num: "04", title: "Operations & SLAs", icon: Clock, status: "pending", desc: "SLA definitions, monitoring strategy, runbooks, incident response, and BCDR procedures." },
  { num: "05", title: "Data Architecture", icon: Settings, status: "pending", desc: "Data flows, classification levels, retention policies, and sovereignty requirements." },
  { num: "06", title: "Cost & FinOps", icon: Zap, status: "pending", desc: "Total Cost of Ownership, tagging strategy, budget governance, and reserved instance plan." },
];


export default function Phase4TDDGeneration() {
  const [, setLocation] = useLocation();

  const autoSections = TDD_SECTIONS.filter((s) => s.status === "auto").length;
  const pendingSections = TDD_SECTIONS.filter((s) => s.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-white" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">Phase 03 · TDD Generation & Approval</p>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Technical Design Document</h1>
            <p className="text-sm opacity-80 max-w-xl">
              Auto-generate a comprehensive TDD consolidating all Phase 1–3 outputs. Architecture decisions, security controls, data flows, and operational requirements for ARB approval.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["McCain TDD v3.2", "Auto-Generated", "ARB Approval", "Version Control"].map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/30 bg-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-4xl font-black mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>{autoSections}/6</div>
            <div className="text-xs opacity-70 font-mono">Sections Ready</div>
            <div className="mt-2 px-3 py-1 rounded-full text-xs font-mono bg-yellow-500/30">
              {pendingSections} Pending Data
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 6-section document builder */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">6-Section Document Builder</CardTitle>
              <p className="text-xs text-slate-500">Auto-populate status per section. Sections sourced from Phase 1–3 outputs.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {TDD_SECTIONS.map((section) => {
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
                          ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-green-100 text-green-700 font-medium"><CheckCircle2 className="w-3 h-3" />Auto-populate</span>
                          : <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-yellow-100 text-yellow-700 font-medium"><Clock className="w-3 h-3" />Pending Data</span>
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
                  <p className="text-sm font-bold text-slate-800">Generate TDD</p>
                  <p className="text-xs text-slate-500 mt-1">Auto-generates all 6 sections using AI + Phase 1–3 inputs. Review before final ARB submission.</p>
                </div>
                <Button className="w-full font-semibold" style={{ background: PHASE_COLOR, color: "#1a1a2e" }} onClick={() => setLocation("/requests")}>
                  One-Click Generate
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-[10px] text-slate-400 font-mono">Requires EA-approved request · v3.2 template</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Key Deliverables</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {["Full TDD Document (.docx)", "Architecture Diagrams", "Component Spec Sheets", "Data Flow Documentation", "ARB Approval Record"].map((d) => (
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
    </div>
  );
}

