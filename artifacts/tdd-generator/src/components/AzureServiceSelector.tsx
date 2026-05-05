import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AzureService {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  keywords: string[];
  alwaysIncluded?: boolean;
}

export const AZURE_SERVICE_CATALOG: AzureService[] = [
  // ── Compute ──────────────────────────────────────────────────────────────
  // NOTE: VM keywords are intentionally narrow — generic terms like "compute", "iaas", "vm"
  // appear in every PaaS TDD ("no IaaS VMs required") and would cause false positives.
  { id: "vm", name: "Virtual Machine", category: "Compute", icon: "🖥️", description: "Windows/Linux IaaS VM — Standard_B2s for demo", keywords: ["virtual machine", "azure vm", "iaas vm", "windows vm", "linux vm", "iaasvirtualmachine"] },
  { id: "app_service", name: "App Service", category: "Compute", icon: "🌐", description: "PaaS web hosting for .NET, Node, Python, Java", keywords: ["app service", "web app", "web application", "webapp", "app service plan"] },
  { id: "function_app", name: "Function App", category: "Compute", icon: "⚡", description: "Event-driven serverless compute", keywords: ["function app", "azure functions", "serverless", "event-driven", "faas"] },
  { id: "aks", name: "Kubernetes Service (AKS)", category: "Compute", icon: "☸️", description: "Managed Kubernetes cluster", keywords: ["kubernetes", "aks", "k8s", "container orchestration", "pods"] },
  { id: "container_instance", name: "Container Instance", category: "Compute", icon: "📦", description: "On-demand container execution without orchestration", keywords: ["container instance", "aci"] },
  { id: "vmss", name: "VM Scale Set", category: "Compute", icon: "📊", description: "Auto-scaling fleet of identical VMs", keywords: ["scale set", "vmss", "vm scale set"] },

  // ── Data & Storage ────────────────────────────────────────────────────────
  { id: "sql_database", name: "Azure SQL Database", category: "Data", icon: "🗄️", description: "Fully managed relational SQL PaaS", keywords: ["sql database", "sql server", "azure sql", "relational database", "rdbms", "mssql"] },
  { id: "cosmos_db", name: "Cosmos DB", category: "Data", icon: "🌌", description: "Globally distributed NoSQL / multi-model database", keywords: ["cosmos", "cosmosdb", "nosql", "globally distributed", "document database", "mongodb api"] },
  { id: "storage_account", name: "Storage Account", category: "Data", icon: "💾", description: "Blob, File, Queue, Table and Data Lake storage", keywords: ["storage account", "blob storage", "file share", "table storage", "data lake", "adls", "object storage"] },
  { id: "redis_cache", name: "Redis Cache", category: "Data", icon: "⚡", description: "In-memory data store and cache", keywords: ["redis", "cache", "in-memory", "caching", "session store"] },
  { id: "postgresql", name: "Azure Database for PostgreSQL", category: "Data", icon: "🐘", description: "Managed open-source PostgreSQL", keywords: ["postgresql", "postgres", "open source database", "pg"] },
  { id: "mysql", name: "Azure Database for MySQL", category: "Data", icon: "🐬", description: "Managed open-source MySQL", keywords: ["mysql", "mariadb"] },
  { id: "synapse", name: "Azure Synapse Analytics", category: "Data", icon: "📊", description: "Enterprise analytics and data warehouse", keywords: ["synapse", "data warehouse", "analytics", "dwh", "sql pool", "spark pool"] },
  { id: "data_factory", name: "Azure Data Factory", category: "Data", icon: "🏭", description: "ETL / ELT data integration pipelines", keywords: ["data factory", "adf", "etl", "elt", "pipeline", "data pipeline", "data integration"] },

  // ── Networking ────────────────────────────────────────────────────────────
  { id: "vnet", name: "Virtual Network", category: "Networking", icon: "🌐", description: "Private network, subnets and NSG", keywords: ["virtual network", "vnet", "subnet", "network security group", "nsg", "private network"], alwaysIncluded: true },
  { id: "application_gateway", name: "Application Gateway", category: "Networking", icon: "🔀", description: "L7 load balancer with WAF support", keywords: ["application gateway", "waf", "web application firewall", "l7 load balancer"] },
  { id: "load_balancer", name: "Load Balancer", category: "Networking", icon: "⚖️", description: "L4 public or internal load balancer", keywords: ["load balancer", "load balancing", "l4", "tcp load balancer"] },
  { id: "front_door", name: "Azure Front Door", category: "Networking", icon: "🚪", description: "Global CDN, WAF and load balancer", keywords: ["front door", "cdn", "content delivery", "global load balancer", "edge", "afd"] },
  { id: "private_endpoint", name: "Private Endpoint", category: "Networking", icon: "🔒", description: "Private connectivity to Azure PaaS services", keywords: ["private endpoint", "private link", "private connectivity"] },
  { id: "dns_zone", name: "DNS Zone", category: "Networking", icon: "🔍", description: "Azure-managed DNS", keywords: ["dns", "domain", "dns zone", "name resolution"] },

  // ── Integration ───────────────────────────────────────────────────────────
  { id: "api_management", name: "API Management", category: "Integration", icon: "🔌", description: "API gateway, developer portal and lifecycle management", keywords: ["api management", "apim", "api gateway", "developer portal", "api lifecycle"] },
  { id: "service_bus", name: "Service Bus", category: "Messaging", icon: "📨", description: "Enterprise message broker with queues and topics", keywords: ["service bus", "messaging", "queue", "topic", "pubsub", "message broker"] },
  { id: "event_hub", name: "Event Hub", category: "Messaging", icon: "📡", description: "Big data streaming platform (Kafka-compatible)", keywords: ["event hub", "event streaming", "kafka", "streaming", "real-time", "event-driven"] },
  { id: "event_grid", name: "Event Grid", category: "Messaging", icon: "🕸️", description: "Reactive event routing across services", keywords: ["event grid", "event routing", "webhook", "event-driven architecture", "reactive"] },
  { id: "logic_apps", name: "Logic Apps", category: "Integration", icon: "🔄", description: "Low-code workflow automation and integration", keywords: ["logic apps", "workflow", "automation", "integration", "connectors"] },

  // ── Security ──────────────────────────────────────────────────────────────
  { id: "key_vault", name: "Key Vault", category: "Security", icon: "🔐", description: "Secrets, keys and certificate management", keywords: ["key vault", "secrets management", "certificates", "encryption keys", "hsm"] },
  { id: "managed_identity", name: "Managed Identity", category: "Security", icon: "🪪", description: "Azure AD identity for resources (no credentials stored)", keywords: ["managed identity", "system assigned", "user assigned", "identity", "msi"] },
  { id: "defender", name: "Microsoft Defender for Cloud", category: "Security", icon: "🛡️", description: "Cloud security posture and threat protection", keywords: ["defender", "security center", "threat protection", "cspm", "security posture"] },
  { id: "sentinel", name: "Microsoft Sentinel", category: "Security", icon: "👁️", description: "Cloud-native SIEM and SOAR", keywords: ["sentinel", "siem", "soar", "security analytics", "security monitoring"] },

  // ── Monitoring & Operations ───────────────────────────────────────────────
  { id: "application_insights", name: "Application Insights", category: "Monitoring", icon: "📈", description: "APM — traces, logs and performance monitoring", keywords: ["application insights", "apm", "monitoring", "telemetry", "traces", "performance"] },
  { id: "log_analytics", name: "Log Analytics Workspace", category: "Monitoring", icon: "📋", description: "Centralised log aggregation and KQL queries", keywords: ["log analytics", "log workspace", "kql", "logs", "diagnostics", "operational insights"] },
  { id: "azure_monitor", name: "Azure Monitor", category: "Monitoring", icon: "📉", description: "Metrics, alerts and dashboards", keywords: ["azure monitor", "metrics", "alerts", "dashboards", "alarms"] },

  // ── Containers ────────────────────────────────────────────────────────────
  { id: "acr", name: "Container Registry", category: "Containers", icon: "🐳", description: "Private Docker / OCI image registry", keywords: ["container registry", "acr", "docker", "image registry", "oci"] },
  { id: "container_apps", name: "Container Apps", category: "Containers", icon: "🚀", description: "Serverless container platform built on Kubernetes", keywords: ["container apps", "aca", "microservices", "dapr", "serverless containers"] },

  // ── AI & ML ───────────────────────────────────────────────────────────────
  { id: "cognitive_services", name: "Azure AI / Cognitive Services", category: "AI & ML", icon: "🧠", description: "Vision, Language, Speech and Decision APIs", keywords: ["cognitive services", "azure ai", "openai", "vision", "language", "speech", "ai services"] },
  { id: "ml_workspace", name: "Azure Machine Learning", category: "AI & ML", icon: "🤖", description: "End-to-end ML platform for training and deployment", keywords: ["machine learning", "aml", "ml workspace", "model training", "mlops"] },

  // ── Developer Tools ───────────────────────────────────────────────────────
  { id: "static_web_app", name: "Static Web App", category: "Developer Tools", icon: "📄", description: "Globally distributed static hosting + serverless API", keywords: ["static web app", "static site", "swa", "jamstack", "frontend"] },
  { id: "cdn", name: "Azure CDN", category: "Developer Tools", icon: "🌍", description: "Content delivery network for static assets", keywords: ["cdn", "content delivery", "content delivery network", "static assets", "edge caching"] },
];

const CATEGORIES = [...new Set(AZURE_SERVICE_CATALOG.map((s) => s.category))];

/**
 * Detect Azure services referenced in a TDD markdown document.
 *
 * Uses word-boundary regex matching to prevent false positives from
 * short substrings (e.g. "vm" inside "environment" or "VMs" in
 * "no IaaS VMs required for this workload").
 *
 * Multi-word phrases (e.g. "app service") are matched literally with
 * word boundaries at their edges only. Single short words use strict
 * \b anchors so they don't fire inside longer tokens.
 */
export function detectServicesFromTdd(markdown: string): string[] {
  return AZURE_SERVICE_CATALOG
    .filter((svc) =>
      svc.keywords.some((kw) => {
        // Build a word-boundary-anchored pattern.
        // Escape regex special chars in the keyword first.
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`\\b${escaped}\\b`, "i");
        return pattern.test(markdown);
      })
    )
    .map((svc) => svc.id);
}

interface Props {
  tddContent: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function AzureServiceSelector({ tddContent, selectedIds, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORIES));
  const [autoDetected] = useState<string[]>(() => detectServicesFromTdd(tddContent));

  useEffect(() => {
    if (selectedIds.length === 0 && autoDetected.length > 0) {
      const always = AZURE_SERVICE_CATALOG.filter((s) => s.alwaysIncluded).map((s) => s.id);
      onChange([...new Set([...autoDetected, ...always])]);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return AZURE_SERVICE_CATALOG;
    return AZURE_SERVICE_CATALOG.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.includes(q))
    );
  }, [search]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      const svc = AZURE_SERVICE_CATALOG.find((s) => s.id === id);
      if (svc?.alwaysIncluded) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange([...next]);
  };

  const toggleCategory = (cat: string) => {
    const catIds = AZURE_SERVICE_CATALOG.filter((s) => s.category === cat).map((s) => s.id);
    const allChecked = catIds.every((id) => selectedIds.includes(id));
    const next = new Set(selectedIds);
    if (allChecked) {
      catIds.forEach((id) => {
        const svc = AZURE_SERVICE_CATALOG.find((s) => s.id === id);
        if (!svc?.alwaysIncluded) next.delete(id);
      });
    } else {
      catIds.forEach((id) => next.add(id));
    }
    onChange([...next]);
  };

  const toggleExpand = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const groupedFiltered = CATEGORIES.map((cat) => ({
    cat,
    services: filtered.filter((s) => s.category === cat),
  })).filter((g) => g.services.length > 0);

  return (
    <div className="space-y-4">
      {/* Auto-detect notice */}
      {autoDetected.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Zap className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Auto-detected from your TDD:</span>{" "}
            {autoDetected
              .map((id) => AZURE_SERVICE_CATALOG.find((s) => s.id === id)?.name)
              .filter(Boolean)
              .join(", ")}
            {" "}— pre-selected below. Add or remove any service before generating IaC.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="pl-9 text-sm"
          placeholder="Search Azure services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-700">{selectedIds.length}</span> service{selectedIds.length !== 1 ? "s" : ""} selected
          {autoDetected.length > 0 && (
            <span className="ml-2 text-blue-600">({autoDetected.filter((id) => selectedIds.includes(id)).length} from TDD)</span>
          )}
        </span>
        <div className="flex gap-3">
          <button
            className="text-blue-600 hover:underline"
            onClick={() => onChange([...new Set([...AZURE_SERVICE_CATALOG.map((s) => s.id)])])}
          >
            Select all
          </button>
          <button
            className="text-slate-500 hover:underline"
            onClick={() => onChange(AZURE_SERVICE_CATALOG.filter((s) => s.alwaysIncluded).map((s) => s.id))}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Category groups */}
      <div className="space-y-3">
        {groupedFiltered.map(({ cat, services }) => {
          const catIds = services.map((s) => s.id);
          const checkedCount = catIds.filter((id) => selectedIds.includes(id)).length;
          const allChecked = checkedCount === catIds.length;
          const expanded = expandedCategories.has(cat);

          return (
            <div key={cat} className="rounded-lg border border-slate-200 overflow-hidden">
              {/* Category header */}
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
                onClick={() => toggleExpand(cat)}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => toggleCategory(cat)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded accent-yellow-400 cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-slate-700">{cat}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 font-medium">
                    {checkedCount}/{catIds.length}
                  </span>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {/* Service cards */}
              {expanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-200">
                  {services.map((svc) => {
                    const checked = selectedIds.includes(svc.id);
                    const detected = autoDetected.includes(svc.id);
                    return (
                      <button
                        key={svc.id}
                        onClick={() => toggle(svc.id)}
                        className={`flex items-start gap-3 p-3 text-left transition-colors ${
                          checked ? "bg-blue-50 hover:bg-blue-100" : "bg-white hover:bg-slate-50"
                        } ${svc.alwaysIncluded ? "cursor-default opacity-80" : "cursor-pointer"}`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          checked ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
                        }`}>
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-base leading-none">{svc.icon}</span>
                            <span className={`text-xs font-semibold ${checked ? "text-blue-800" : "text-slate-700"}`}>
                              {svc.name}
                            </span>
                            {detected && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                                TDD
                              </span>
                            )}
                            {svc.alwaysIncluded && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                Required
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{svc.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
