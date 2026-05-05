import { useState } from "react";
import { Code2, Copy, Check, CheckCircle2, Clock, AlertTriangle, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PHASE_COLOR = "#FFCD00";

const MODULES = [
  { name: "mccain-vnet", version: "v3.4.1", category: "Networking", desc: "Hub-spoke VNet, peering, NSGs, route tables. Canada-only regions.", certified: true, lastUpdated: "2025-11-12" },
  { name: "mccain-aks", version: "v2.8.0", category: "Compute", desc: "AKS cluster with RBAC, pod identity, ACR integration, node pools.", certified: true, lastUpdated: "2025-12-01" },
  { name: "mccain-keyvault", version: "v1.9.3", category: "Security", desc: "Key Vault with CMK, soft delete, purge protection, RBAC policies.", certified: true, lastUpdated: "2025-10-28" },
  { name: "mccain-storage", version: "v2.2.0", category: "Storage", desc: "Storage account with encryption, private endpoints, lifecycle policies.", certified: true, lastUpdated: "2025-11-30" },
  { name: "mccain-apim", version: "v1.5.2", category: "Integration", desc: "API Management with internal VNet, WAF policy, named values.", certified: true, lastUpdated: "2025-09-15" },
  { name: "mccain-sqldb", version: "v3.1.0", category: "Database", desc: "Azure SQL with TDE, AAD auth, long-term retention, failover group.", certified: true, lastUpdated: "2025-12-05" },
  { name: "mccain-loganalytics", version: "v1.3.1", category: "Monitoring", desc: "Log Analytics workspace, diagnostic settings, alert rules.", certified: true, lastUpdated: "2025-10-10" },
  { name: "mccain-appservice", version: "v2.0.4", category: "Compute", desc: "App Service plan + web app with managed identity, VNet integration.", certified: false, lastUpdated: "2025-12-08" },
];

const PIPELINE_STAGES = [
  {
    stage: "01", label: "Validate", sub: "Security Scan", color: "#FFCD00",
    steps: ["terraform fmt + validate", "Checkov security scan", "OPA policy evaluation", "Cost estimation (Infracost)", "License compliance check"],
    duration: "~8 min", status: "passed",
  },
  {
    stage: "02", label: "Plan", sub: "Change Preview", color: "#FFCD00",
    steps: ["terraform plan (QA)", "Resource diff review", "Cost delta report", "Blast radius analysis", "Plan approval gate"],
    duration: "~5 min", status: "passed",
  },
  {
    stage: "03", label: "Deploy QA → STG", sub: "Non-Prod Environments", color: "#f59e0b",
    steps: ["terraform apply (QA)", "Smoke tests · QA", "Automated QA gate", "Integration tests · QA", "terraform apply (STG)", "UAT + performance tests"],
    duration: "~45 min", status: "running",
  },
  {
    stage: "04", label: "Deploy PRD", sub: "Dual Approval Required", color: "#FFCD00",
    steps: ["Approval: Lead Architect", "Approval: CISO / Change Board", "terraform apply (PRD)", "Smoke + health checks", "Drift detection (24h)", "Rollback plan validated"],
    duration: "~20 min + gate", status: "pending",
  },
];

const TERRAFORM_CODE = `# McCain Certified Module — Azure VNet
# Registry: registry.mccain.com/terraform/mccain-vnet

module "vnet" {
  source  = "registry.mccain.com/mccain/vnet/azure"
  version = "~> 3.4"

  resource_group_name = azurerm_resource_group.main.name
  location            = "canadacentral"   # Restricted: CA only
  vnet_name           = "vnet-\${var.workload}-prod-cac-001"
  address_space       = ["10.100.0.0/22"]

  subnets = {
    app     = { cidr = "10.100.0.0/24", service_endpoints = ["Microsoft.Storage"] }
    data    = { cidr = "10.100.1.0/24", delegation = "Microsoft.DBforPostgreSQL" }
    private = { cidr = "10.100.2.0/24", private_endpoint_enabled = true }
  }

  # Mandatory McCain tags
  tags = merge(local.common_tags, {
    CostCentre   = var.cost_centre
    DataClass    = "Confidential"
    CcoEApproved = "true"
    TddVersion   = var.tdd_version
  })

  # Hub peering — auto-connects to McCain Hub
  hub_vnet_id          = data.azurerm_virtual_network.hub.id
  enable_hub_peering   = true
  enable_bgp_route_table = true
}`;

const CATEGORY_COLORS: Record<string, string> = {
  Networking: "#FFCD00", Compute: "#FFCD00", Security: "#FFCD00",
  Storage: "#FFCD00", Integration: "#FFCD00", Database: "#FFCD00",
  Monitoring: "#64748b",
};

export default function Phase5DevSecOps() {
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("All");

  const categories = ["All", ...Array.from(new Set(MODULES.map((m) => m.category)))];
  const filtered = filter === "All" ? MODULES : MODULES.filter((m) => m.category === filter);

  const handleCopy = () => {
    navigator.clipboard.writeText(TERRAFORM_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Phase header */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a1a2e 0%,#2d1a35 100%)" }}>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-white" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest uppercase opacity-80 mb-1">Phase 04 · Terraform via McCain Certified Modules</p>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>DevSecOps / IaC Deployment</h1>
            <p className="text-sm opacity-80 max-w-xl">
              Deploy approved services through the McCain DevSecOps pipeline using certified Terraform modules. Enforces policy-as-code, Checkov scanning, and OPA gates across QA → STG → PRD.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["Terraform IaC", "McCain Registry", "Policy-as-Code", "Azure DevOps", "4-Stage Pipeline"].map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/30 bg-white/10">{tag}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {[{ label: "Certified Modules", val: MODULES.filter((m) => m.certified).length },
              { label: "Pipeline Stages", val: 4 },
              { label: "Avg Deploy Time", val: "~78 min" }].map((s) => (
              <div key={s.label} className="text-center bg-white/10 rounded-xl px-4 py-2">
                <p className="text-xl font-black" style={{ fontFamily: "Outfit, sans-serif" }}>{s.val}</p>
                <p className="text-[10px] opacity-70 font-mono">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4-Stage Pipeline Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">4-Stage Deployment Pipeline — QA → STG → PRD</CardTitle>
          <p className="text-xs text-slate-500">Azure DevOps · Policy-as-Code gates · Dual approval for Production</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-stretch gap-0 overflow-x-auto">
            {PIPELINE_STAGES.map((stage, idx) => (
              <div key={stage.stage} className="flex items-center flex-1 min-w-[200px]">
                <div className="flex-1 border border-slate-200 rounded-xl p-4 bg-white hover:shadow-md transition-all"
                  style={{ borderTopWidth: 3, borderTopColor: stage.color }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold" style={{ color: stage.color }}>Stage {stage.stage}</span>
                      <PipelineStatus status={stage.status} />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">{stage.duration}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">{stage.label}</p>
                  <p className="text-[10px] font-mono mb-3" style={{ color: stage.color }}>{stage.sub}</p>
                  <ul className="space-y-1">
                    {stage.steps.map((step) => (
                      <li key={step} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                        <span style={{ color: stage.color }}>›</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <div className="flex items-center px-1 shrink-0">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-6 h-0.5 bg-slate-300" />
                      <div className="w-0 h-0 border-l-4 border-y-4 border-l-slate-300 border-y-transparent" style={{ marginLeft: -1 }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module Catalog */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">McCain Certified Module Catalog</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">registry.mccain.com/terraform — CCoE approved</p>
              </div>
            </div>
            <div className="flex gap-1 flex-wrap mt-2">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setFilter(cat)}
                  className={cn("px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
                    filter === cat ? "" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                  style={filter === cat ? { background: PHASE_COLOR, color: "#1a1a2e" } : {}}
                >{cat}</button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {filtered.map((mod) => (
              <div key={mod.name} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${CATEGORY_COLORS[mod.category] ?? "#64748b"}18` }}>
                  <Package className="w-4 h-4" style={{ color: CATEGORY_COLORS[mod.category] ?? "#64748b" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono font-bold text-slate-800">{mod.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${PHASE_COLOR}18`, color: PHASE_COLOR }}>{mod.version}</span>
                    {mod.certified && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">✓ Certified</span>}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{mod.desc}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Updated: {mod.lastUpdated}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono shrink-0"
                  style={{ background: `${CATEGORY_COLORS[mod.category] ?? "#64748b"}15`, color: CATEGORY_COLORS[mod.category] ?? "#64748b" }}>
                  {mod.category}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Terraform Code Block */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Sample Terraform — mccain-vnet Module</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Canada Central deployment with CCoE tagging standard</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopy} className="flex items-center gap-1.5 text-xs h-7">
                {copied ? <><Check className="w-3 h-3 text-green-500" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-[10px] leading-relaxed overflow-x-auto rounded-xl p-4 font-mono" style={{ background: "#1a1a2e", color: "#e2e8f0" }}>
              <code>{TERRAFORM_CODE}</code>
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PipelineStatus({ status }: { status: string }) {
  if (status === "passed") return <span className="flex items-center gap-1 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-mono"><CheckCircle2 className="w-2.5 h-2.5" />Passed</span>;
  if (status === "running") return <span className="flex items-center gap-1 text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-mono"><Clock className="w-2.5 h-2.5 animate-spin" />Running</span>;
  if (status === "failed") return <span className="flex items-center gap-1 text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-mono"><AlertTriangle className="w-2.5 h-2.5" />Failed</span>;
  return <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-mono">Pending</span>;
}
