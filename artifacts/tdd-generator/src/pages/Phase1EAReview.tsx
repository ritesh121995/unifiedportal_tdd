import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Upload, CheckCircle2, Clock, Building2, Database, Layers, Monitor, ShieldCheck, GitMerge, Cloud, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PHASE_COLOR = "#FFCD00";

const DOMAINS = [
  {
    id: "business",
    label: "Business Architecture",
    icon: Building2,
    description: "Strategy alignment, capability mapping, value stream analysis, and stakeholder impact.",
    score: 82,
    items: ["Business Capability Model", "Value Stream Mapping", "Stakeholder Register", "Business Case Validation"],
  },
  {
    id: "data",
    label: "Data Architecture",
    icon: Database,
    description: "Data flows, classification, sovereignty, master data management, and lineage mapping.",
    score: 74,
    items: ["Data Classification Matrix", "Data Flow Diagrams", "Master Data Registry", "Data Sovereignty Check"],
  },
  {
    id: "application",
    label: "Application Architecture",
    icon: Layers,
    description: "Application inventory, integration patterns, API governance, and lifecycle management.",
    score: 91,
    items: ["Application Portfolio Review", "Integration Catalogue", "API Governance Assessment", "Decommission Schedule"],
  },
  {
    id: "technology",
    label: "Technology Architecture",
    icon: Monitor,
    description: "Infrastructure standards, platform selection, technology radar, and lifecycle alignment.",
    score: 78,
    items: ["Technology Radar Alignment", "Platform Selection Rationale", "Infrastructure Standards", "Licence Review"],
  },
  {
    id: "cloud",
    label: "Cloud Architecture",
    icon: Cloud,
    description: "Azure landing zone design, WAF assessment, hub-and-spoke topology, and network segmentation.",
    score: 80,
    items: ["Azure Landing Zone Assessment", "WAF Pillar Review", "Hub-and-Spoke / VWAN Design", "Network Segmentation"],
  },
  {
    id: "cloud_security",
    label: "Cloud Security",
    icon: Lock,
    description: "Entra ID, Defender for Cloud, Key Vault, RBAC, and zero-trust controls for Azure workloads.",
    score: 76,
    items: ["Entra ID & RBAC Design", "Defender for Cloud Posture", "Key Vault & Secret Management", "Zero-Trust Alignment"],
  },
  {
    id: "security",
    label: "Enterprise Security",
    icon: ShieldCheck,
    description: "Enterprise security controls, identity architecture, threat model, and compliance posture.",
    score: 69,
    items: ["Security Controls Baseline", "Identity & Access Design", "Threat Model (STRIDE)", "Compliance Assessment"],
  },
  {
    id: "integration",
    label: "Integration Architecture",
    icon: GitMerge,
    description: "Integration patterns, ESB/event-driven design, API management, and middleware standards.",
    score: 85,
    items: ["Integration Pattern Review", "Event-Driven Architecture", "API Management Design", "Middleware Standards"],
  },
];

const SCORING_METRICS = [
  { label: "Strategic Alignment", score: 4, max: 5 },
  { label: "Completeness", score: 3.5, max: 5 },
  { label: "Risk Posture", score: 3, max: 5 },
  { label: "Innovation Readiness", score: 4.5, max: 5 },
  { label: "Technical Debt", score: 2.5, max: 5 },
  { label: "Integration Complexity", score: 3.5, max: 5 },
];

function ScoreBar({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = (score / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono text-slate-500 w-8 text-right">{score}/{max}</span>
    </div>
  );
}

function CircleScore({ score, color }: { score: number; color: string }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e293b">{score}</text>
    </svg>
  );
}

export default function Phase1EAReview() {
  const [, setLocation] = useLocation();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadedFile(file.name);
  };

  const overallScore = Math.round(DOMAINS.reduce((s, d) => s + d.score, 0) / DOMAINS.length);

  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-white" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">Phase 01 · Unified Architecture Review</p>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>CCoE Architecture Intake</h1>
            <p className="text-sm opacity-80 max-w-xl">
              Single consolidated review covering Enterprise, Cloud Architecture, and Cloud Security — completed within one week with ARB sign-off.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["TOGAF 9.2", "Cloud Architecture", "Cloud Security", "Azure WAF", "ARB Gate"].map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/30 bg-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-4xl font-black mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>{overallScore}</div>
            <div className="text-xs opacity-70 font-mono">Overall Score</div>
            <div className="flex gap-1 mt-2 justify-center">
              <span className="flex items-center gap-1 text-[10px] opacity-80"><Clock className="w-3 h-3" />≤ 1 Week</span>
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Domain Cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest mb-3">Architecture Domains</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DOMAINS.map((domain) => {
            const Icon = domain.icon;
            const isSelected = selectedDomain === domain.id;
            const scoreColor = domain.score >= 80 ? "#22c55e" : domain.score >= 65 ? "#f59e0b" : "#ef4444";
            return (
              <button
                key={domain.id}
                onClick={() => setSelectedDomain(isSelected ? null : domain.id)}
                className={cn(
                  "text-left bg-white rounded-xl border-2 p-4 transition-all hover:shadow-md",
                  isSelected ? "shadow-md" : "border-slate-200"
                )}
                style={isSelected ? { borderColor: PHASE_COLOR } : {}}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${PHASE_COLOR}18` }}>
                      <Icon className="w-4 h-4" style={{ color: PHASE_COLOR }} />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{domain.label}</p>
                  </div>
                  <CircleScore score={domain.score} color={scoreColor} />
                </div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">{domain.description}</p>
                {isSelected && (
                  <ul className="space-y-1 border-t border-slate-100 pt-3">
                    {domain.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-xs text-slate-600">
                        <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Intake Form / File Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Intake Package Upload</CardTitle>
            <p className="text-xs text-slate-500">Upload architecture documentation, business cases, and supporting artefacts.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                dragging ? "border-red-400 bg-red-50" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              {uploadedFile ? (
                <div>
                  <p className="text-sm font-medium text-green-600">{uploadedFile}</p>
                  <p className="text-xs text-slate-400 mt-1">File ready for review</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-600">Drop files here or click to browse</p>
                  <p className="text-xs text-slate-400 mt-1">Supports .pdf, .docx, .pptx, .xlsx — max 50MB</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {[
                { label: "Business Case Document", status: "uploaded", size: "2.4 MB" },
                { label: "Current Architecture Diagrams", status: "uploaded", size: "8.1 MB" },
                { label: "Integration Catalogue v3.xlsx", status: "pending", size: "—" },
                { label: "ARB Review Package Template", status: "required", size: "—" },
              ].map((doc) => (
                <div key={doc.label} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileIcon status={doc.status} />
                    <span className="text-slate-700 font-medium">{doc.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{doc.size}</span>
                    <StatusPill status={doc.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Review Scoring Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">CCoE Intake Scoring</CardTitle>
            <p className="text-xs text-slate-500">Architecture Review Board assessment across key evaluation criteria.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {SCORING_METRICS.map((metric) => (
              <div key={metric.label}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{metric.label}</span>
                </div>
                <ScoreBar score={metric.score} max={metric.max} color={PHASE_COLOR} />
              </div>
            ))}

            <div className="mt-4 p-3 rounded-xl border-2" style={{ background: `${PHASE_COLOR}08`, borderColor: `${PHASE_COLOR}30` }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">Composite EA Score</p>
                  <p className="text-2xl font-bold mt-0.5" style={{ color: PHASE_COLOR }}>3.67 / 5.00</p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#f59e0b" }}>
                    <Clock className="w-3 h-3" />
                    Pending ARB
                  </span>
                </div>
              </div>
            </div>

            <Button className="w-full font-semibold mt-2" style={{ background: PHASE_COLOR, color: "#1a1a2e" }} onClick={() => setLocation("/requests/new")}>
              Submit for ARB Review
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Deliverables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Key Deliverables · Phase 1</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {["Architecture Domain Assessment", "Capability Gap Report", "Integration Catalogue", "ARB Review Package", "Architecture Decision Records"].map((d, i) => (
              <div key={d} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                <span className="text-xs font-mono font-bold shrink-0" style={{ color: PHASE_COLOR }}>0{i + 1}</span>
                <p className="text-xs text-slate-600 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FileIcon({ status }: { status: string }) {
  if (status === "uploaded") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
  if (status === "pending") return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
  return <Upload className="w-3.5 h-3.5 text-slate-400" />;
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    uploaded: { label: "Uploaded", cls: "bg-green-100 text-green-700" },
    pending: { label: "Pending", cls: "bg-yellow-100 text-yellow-700" },
    required: { label: "Required", cls: "bg-red-100 text-red-700" },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.cls}`}>{c.label}</span>;
}
