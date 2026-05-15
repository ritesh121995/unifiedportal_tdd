import {
  Users, Cloud, ShieldAlert, Network, Server, Database,
  Link2, DollarSign, Scale, Bot, Building2,
} from "lucide-react";
import type { ElementType } from "react";

export interface FormSnapshot {
  deploymentModel: string;
  networkPosture: string;
  securityImpact: string;
  dataImpact: string;
  integrationImpact: string;
  regulatoryImpact: string;
  aiImpact: string;
  haEnabled: boolean;
  drEnabled: boolean;
  securityAssessmentRequired: boolean;
  integrationRequired: boolean;
  costTShirtSize: string;
  businessCriticality: string;
  applicationType: string;
}

export interface ArchitectRec {
  role: string;
  reason: string;
  required: boolean;
  Icon: ElementType;
}

export interface RiskInsight {
  category: string;
  severity: "high" | "medium" | "info";
  title: string;
  detail: string;
  remediation: string;
  bestPractice: string;
}

const THIRD_PARTY_MODELS = [
  "SaaS Solution",
  "Vendor Cloud Tenant (Azure/AWS/GCP/Others)",
  "On-Premises (McCain Data Center)",
  "Hybrid Solution (McCain Data Center & McCain Cloud)",
  "Any other 3rd party Solution",
];

export function computeArchitectRecommendations(f: FormSnapshot): ArchitectRec[] {
  const isCloud      = f.deploymentModel === "Azure Cloud (McCain Tenant)";
  const isThirdParty = THIRD_PARTY_MODELS.includes(f.deploymentModel);
  const isOnPrem     = f.deploymentModel === "On-Premises (McCain Data Center)";
  const isHybrid     = f.deploymentModel === "Hybrid Solution (McCain Data Center & McCain Cloud)";
  const internetFacing  = f.networkPosture === "Internet-Facing" || f.networkPosture === "Hybrid";
  const highSecurity    = ["High", "Medium"].includes(f.securityImpact);
  const highData        = ["High", "Medium"].includes(f.dataImpact);
  const highIntegration = ["High", "Medium"].includes(f.integrationImpact);
  const highRegulatory  = ["High", "Medium"].includes(f.regulatoryImpact);
  const highAI          = ["High", "Medium"].includes(f.aiImpact);
  const bigCost         = ["Large (500K–1M CAD)", "XLarge (>1M CAD)"].includes(f.costTShirtSize);

  const recs: ArchitectRec[] = [];

  recs.push({
    role: "Enterprise Architect",
    reason: "Required for all Architecture Review Requests as the primary reviewer, approver, and governance owner.",
    required: true,
    Icon: Users,
  });

  if (isCloud || f.haEnabled || f.drEnabled) {
    recs.push({
      role: "Cloud Architect",
      reason: isCloud
        ? "Required for all Cloud (McCain Tenant) workloads. Will validate Azure landing zone, CCoE guardrails, naming conventions, and region compliance (Canada Central / Canada East only)."
        : "HA/DR configuration requires cloud-native resiliency pattern validation.",
      required: isCloud,
      Icon: Cloud,
    });
  }

  if (highSecurity || internetFacing || f.securityAssessmentRequired || f.aiImpact === "High") {
    const reasons = [
      highSecurity && `Security impact rated ${f.securityImpact} — threat modelling, IAM review, and security controls assessment required.`,
      internetFacing && "Internet-facing posture requires WAF, DDoS protection, and perimeter security review.",
      f.securityAssessmentRequired && "Security assessment explicitly flagged as required for this workload.",
      f.aiImpact === "High" && "AI governance and model security review required.",
    ].filter(Boolean).join(" ");
    recs.push({ role: "Security Architect", reason: reasons, required: highSecurity || internetFacing, Icon: ShieldAlert });
  }

  if (isCloud || internetFacing || isHybrid || f.integrationRequired) {
    const reasons = [
      isCloud && "Azure VNet, NSG, Private Endpoint, and DNS zone configuration required.",
      internetFacing && "External exposure requires firewall rules, SSL/TLS architecture, and WAF routing design.",
      isHybrid && "Hybrid connectivity (ExpressRoute / Site-to-Site VPN) architecture review required.",
      f.integrationRequired && "Integration endpoint topology and API connectivity must be validated.",
    ].filter(Boolean).join(" ");
    recs.push({ role: "Network Architect", reason: reasons, required: isCloud || internetFacing, Icon: Network });
  }

  if (isOnPrem || isHybrid || f.haEnabled || f.drEnabled) {
    const reasons = [
      isOnPrem && "On-premises deployment requires compute, storage, and virtualisation infrastructure design.",
      isHybrid && "Hybrid model requires infrastructure alignment between on-premises and cloud components.",
      f.haEnabled && "High Availability requires clustering and load balancing infrastructure review.",
      f.drEnabled && "Disaster Recovery requires failover, replication, and backup infrastructure architecture.",
    ].filter(Boolean).join(" ");
    recs.push({ role: "Infrastructure Architect", reason: reasons, required: true, Icon: Server });
  }

  if (highData) {
    recs.push({
      role: "Data Architect",
      reason: `Data impact rated ${f.dataImpact}. Data governance, master data management, retention policies, and lineage review required.${f.dataImpact === "High" ? " Privacy Impact Assessment (PIA) is mandatory." : ""}`,
      required: f.dataImpact === "High",
      Icon: Database,
    });
  }

  if (f.integrationRequired || highIntegration) {
    recs.push({
      role: "Integration Architect",
      reason: `Integration with external systems required. API management strategy, middleware selection, error handling, and data contract governance must be defined. Integration impact: ${f.integrationImpact || "to be assessed"}.`,
      required: highIntegration,
      Icon: Link2,
    });
  }

  if (isCloud || bigCost) {
    const reasons = [
      isCloud && "Azure cost management, resource tagging, budget alerts, and cost allocation required for McCain Tenant workloads.",
      bigCost && `Estimated cost ${f.costTShirtSize} — formal FinOps sign-off required before provisioning.`,
    ].filter(Boolean).join(" ");
    recs.push({ role: "FinOps Specialist", reason: reasons, required: bigCost, Icon: DollarSign });
  }

  if (highRegulatory) {
    recs.push({
      role: "Compliance / Risk Officer",
      reason: `Regulatory impact rated ${f.regulatoryImpact}. Legal, privacy, and compliance review required. Engage Privacy Officer and Legal team if GDPR, PIPEDA, or food safety regulations apply.`,
      required: f.regulatoryImpact === "High",
      Icon: Scale,
    });
  }

  if (highAI) {
    recs.push({
      role: "AI Governance Lead",
      reason: `AI impact rated ${f.aiImpact}. Responsible AI review, model risk assessment, and bias testing required. Agentic or automated decision workflows require additional human oversight controls.`,
      required: f.aiImpact === "High",
      Icon: Bot,
    });
  }

  if (isThirdParty) {
    recs.push({
      role: "Vendor Risk Manager",
      reason: "Third-party / SaaS solution requires vendor risk assessment, Data Processing Agreement (DPA) review, and vendor access control evaluation via McCain's PAM tooling.",
      required: true,
      Icon: Building2,
    });
  }

  return recs;
}

export function computeRisksAndInsights(f: FormSnapshot): RiskInsight[] {
  const isCloud      = f.deploymentModel === "Azure Cloud (McCain Tenant)";
  const isThirdParty = THIRD_PARTY_MODELS.includes(f.deploymentModel);
  const isHybrid     = f.deploymentModel === "Hybrid Solution (McCain Data Center & McCain Cloud)";
  const internetFacing = f.networkPosture === "Internet-Facing" || f.networkPosture === "Hybrid";
  const bigCost        = ["Large (500K–1M CAD)", "XLarge (>1M CAD)"].includes(f.costTShirtSize);

  const items: Array<Omit<RiskInsight, "remediation" | "bestPractice">> = [];

  if (isCloud) {
    items.push({
      category: "Cloud Governance",
      severity: "info",
      title: "CCoE Guardrails Apply",
      detail: "This workload must comply with McCain's Cloud Centre of Excellence (CCoE) policies. Azure Policy compliance, resource naming conventions, and mandatory tagging (cost centre, environment, owner) must be in place before provisioning.",
    });
    items.push({
      category: "Regional Compliance",
      severity: "info",
      title: "Canada-Only Region Restriction",
      detail: "McCain restricts all deployments to Canada Central (Toronto) and Canada East (Quebec City). All data residency and compute must remain within these boundaries to satisfy Canadian privacy regulations (PIPEDA).",
    });
  }

  if (internetFacing) {
    items.push({
      category: "Security",
      severity: "high",
      title: "Internet Exposure Risk",
      detail: "The internet-facing network posture significantly increases the attack surface. WAF, Azure DDoS Standard, SSL/TLS termination, and access control policies must be reviewed by the Security Architect before go-live.",
    });
  }

  if (f.securityImpact === "High") {
    items.push({
      category: "Security",
      severity: "high",
      title: "High Security Impact — Threat Modelling Mandatory",
      detail: "A formal threat model (STRIDE or equivalent) is required. Penetration testing and vulnerability assessment must be completed and remediated before production deployment.",
    });
  } else if (f.securityImpact === "Medium") {
    items.push({
      category: "Security",
      severity: "medium",
      title: "Elevated Security Controls Required",
      detail: "IAM design, privileged access controls, and audit logging must be formally defined and reviewed by the Security Architect.",
    });
  }

  if (f.dataImpact === "High") {
    items.push({
      category: "Data & Privacy",
      severity: "high",
      title: "Regulated Data — Privacy Impact Assessment Required",
      detail: "This workload processes personal or regulated data. A Privacy Impact Assessment (PIA) must be completed. Data classification, encryption at rest and in transit, and data retention/deletion policies are mandatory.",
    });
  } else if (f.dataImpact === "Medium") {
    items.push({
      category: "Data & Privacy",
      severity: "medium",
      title: "Cross-Domain Data Governance Required",
      detail: "Business-critical or cross-domain data requires data governance controls, lineage documentation, and master data management alignment.",
    });
  }

  if (!f.haEnabled && f.businessCriticality && f.businessCriticality !== "Administrative Service") {
    items.push({
      category: "Availability",
      severity: f.businessCriticality === "Mission Critical" ? "high" : "medium",
      title: "No High Availability Configured",
      detail: `For a ${f.businessCriticality} workload without HA, a single point of failure exists. Evaluate redundancy (active-active or active-passive) and define RTO/RPO targets before go-live.`,
    });
  }

  if (f.haEnabled && !f.drEnabled) {
    items.push({
      category: "Availability",
      severity: "medium",
      title: "HA Enabled — Disaster Recovery Not Configured",
      detail: "High Availability protects against instance-level failures but does not cover regional outages. Consider enabling Disaster Recovery for mission-critical or business-critical workloads.",
    });
  }

  if (f.haEnabled && f.drEnabled) {
    items.push({
      category: "Availability",
      severity: "info",
      title: "HA + DR — Validate RTO/RPO Targets",
      detail: "Ensure RTO/RPO targets are formally defined, tested through a DR drill, and aligned with business continuity requirements before go-live.",
    });
  }

  if (f.aiImpact === "High") {
    items.push({
      category: "AI Risk",
      severity: "high",
      title: "High AI Impact — Governance Mandatory",
      detail: "Automated or agentic AI workflows with financial/legal implications require mandatory Responsible AI review, explainability documentation, bias testing, and human oversight controls.",
    });
  } else if (f.aiImpact === "Medium") {
    items.push({
      category: "AI Risk",
      severity: "medium",
      title: "AI Capability — Ethics & Governance Review Needed",
      detail: "Sensitive data inference or external-facing AI features require ethics review and transparency controls per McCain's AI governance policy.",
    });
  }

  if (f.regulatoryImpact === "High") {
    items.push({
      category: "Regulatory",
      severity: "high",
      title: "High Regulatory Exposure",
      detail: "Legal, safety, or financial reporting regulations apply. Engage the Privacy Officer, Legal team, and Compliance team. Audit trails, data residency proof, and regulatory reporting capabilities may be required.",
    });
  } else if (f.regulatoryImpact === "Medium") {
    items.push({
      category: "Regulatory",
      severity: "medium",
      title: "Compliance Review Recommended",
      detail: "Industry compliance or external audits (ISO, SOX, etc.) may apply. Engage the Compliance team to confirm scope and requirements.",
    });
  }

  if (f.integrationRequired && ["High", "Medium"].includes(f.integrationImpact)) {
    items.push({
      category: "Integration",
      severity: f.integrationImpact === "High" ? "high" : "medium",
      title: "Complex Integration Risk",
      detail: "Multiple or partner integrations introduce dependency and availability risk. Define SLAs per integration point, implement circuit breakers, retry policies, and consider an API gateway for centralised governance.",
    });
  }

  if (bigCost) {
    items.push({
      category: "FinOps",
      severity: "medium",
      title: `Cost Estimate ${f.costTShirtSize} — Budget Approval Required`,
      detail: "Large or extra-large cost requires formal FinOps sign-off, budget owner approval, and cost allocation tags before provisioning. Consider phased delivery to manage expenditure.",
    });
  }

  if (isThirdParty) {
    items.push({
      category: "Vendor Risk",
      severity: "medium",
      title: "Third-Party / SaaS Vendor Risk",
      detail: "Vendor risk assessment required. Review Data Processing Agreements (DPA), SLAs, exit strategy, and ensure vendor access is controlled through McCain's Privileged Access Management (PAM) tooling.",
    });
  }

  if (isHybrid) {
    items.push({
      category: "Connectivity",
      severity: "medium",
      title: "Hybrid Connectivity Complexity",
      detail: "Hybrid deployments require validated ExpressRoute or VPN configuration, latency budgeting, and failover testing between on-premises and cloud segments.",
    });
  }

  if (f.applicationType === "Cloud Migration") {
    items.push({
      category: "Migration Risk",
      severity: "medium",
      title: "Cloud Migration — Cutover & Rollback Planning",
      detail: "Migration projects carry data integrity and availability risk during cutover. Define a rollback plan, migration validation checklist, and run a pilot migration before full cutover.",
    });
  }

  return items.map(enrichRiskInsight);
}

export interface ArchitecturePattern {
  name: string;
  category: string;
  confidence: "high" | "medium" | "low";
  summary: string;
  rationale: string;
  keyComponents: string[];
  wafPillars: string[];
  cafAlignment: string;
}

export function computeArchitecturePattern(f: FormSnapshot): ArchitecturePattern {
  const isCloud      = f.deploymentModel === "Azure Cloud (McCain Tenant)";
  const isThirdParty = THIRD_PARTY_MODELS.includes(f.deploymentModel);
  const isOnPrem     = f.deploymentModel === "On-Premises (McCain Data Center)";
  const isHybrid     = f.deploymentModel === "Hybrid Solution (McCain Data Center & McCain Cloud)";
  const internetFacing  = f.networkPosture === "Internet-Facing" || f.networkPosture === "Hybrid";
  const highIntegration = ["High", "Medium"].includes(f.integrationImpact);
  const highSecurity    = ["High", "Medium"].includes(f.securityImpact);
  const highAI          = ["High", "Medium"].includes(f.aiImpact);
  const missionCritical = ["Tier 0", "Tier 1"].includes(f.businessCriticality);
  const isMigration     = f.applicationType === "Cloud Migration";

  if (highAI && isCloud) {
    return {
      name: "AI-Augmented Application Pattern",
      category: "Intelligent Workload",
      confidence: "high",
      summary: "Integrates Azure OpenAI / Cognitive Services within a secure, private-network PaaS architecture governed by McCain's Responsible AI framework.",
      rationale: `AI impact rated ${f.aiImpact} on a Cloud (McCain Tenant) workload. Azure WAF recommends isolating AI inference endpoints in a dedicated subnet with Private Endpoints and prompt/output logging for governance.`,
      keyComponents: [
        "Azure OpenAI (Private Endpoint)",
        "Azure API Management (AI gateway & rate limiting)",
        "Azure App Service / Container Apps",
        "Azure Key Vault (secrets & model config)",
        "Azure Monitor + Log Analytics (prompt audit logging)",
        "Azure Content Safety",
      ],
      wafPillars: ["Security", "Operational Excellence", "Cost Optimization"],
      cafAlignment: "Innovate — AI-driven digital transformation aligned to McCain's digital strategy with Responsible AI guardrails.",
    };
  }

  if (isCloud && internetFacing && highIntegration) {
    return {
      name: "API-Led Integration Architecture",
      category: "Integration Hub",
      confidence: "high",
      summary: "Centralised API gateway pattern using Azure API Management to broker all external and internal integrations with built-in WAF, throttling, and observability.",
      rationale: `Internet-facing posture combined with ${f.integrationImpact} integration complexity. Azure CAF recommends API Management as the integration frontier with Azure Front Door for global routing and DDoS protection.`,
      keyComponents: [
        "Azure API Management (integration gateway)",
        "Azure Front Door + WAF (global edge & DDoS)",
        "Azure Service Bus / Event Grid (async messaging)",
        "Azure Functions (lightweight processors)",
        "Azure Private Endpoints (backend connectivity)",
        "Azure Monitor + Application Insights",
      ],
      wafPillars: ["Security", "Reliability", "Performance Efficiency"],
      cafAlignment: "Migrate/Modernise — adopts cloud-native integration patterns aligned to CAF integration design area.",
    };
  }

  if (isMigration && isCloud) {
    return {
      name: "Lift-and-Shift Landing Zone Migration",
      category: "Cloud Migration",
      confidence: "high",
      summary: "Azure CAF-aligned migration using a dedicated landing zone subscription with Azure Migrate tooling, followed by optional modernisation of compute to PaaS.",
      rationale: "Cloud Migration request type maps directly to Azure CAF Migrate methodology. A landing zone is provisioned first, then workloads are assessed, replicated, and cut over with tested rollback procedures.",
      keyComponents: [
        "Azure Migrate (discovery & replication)",
        "Azure Landing Zone (dedicated subscription)",
        "Azure Site Recovery (DR & failback)",
        "Azure Virtual Network (hub-spoke connectivity)",
        "Azure Bastion (secure admin access)",
        "Azure Policy (guardrail enforcement post-migration)",
      ],
      wafPillars: ["Reliability", "Operational Excellence", "Cost Optimization"],
      cafAlignment: "Migrate — follows CAF Migrate phase: Assess → Replicate → Optimize → Secure & Manage.",
    };
  }

  if (isCloud && highSecurity && !internetFacing) {
    return {
      name: "Zero-Trust Hub-and-Spoke Landing Zone",
      category: "Secure Workload",
      confidence: "high",
      summary: "Private, Zero-Trust architecture deployed within McCain's hub-spoke topology. All traffic traverses central Azure Firewall; no public endpoints.",
      rationale: `Security impact rated ${f.securityImpact} with private network posture. Azure WAF Reliability and Security pillars prescribe hub-spoke with centralised egress, Private Endpoints, and PIM-based just-in-time access.`,
      keyComponents: [
        "Hub VNet + Azure Firewall Premium (centralised egress)",
        "Spoke VNet (dedicated workload network)",
        "Azure Private DNS Zones",
        "Private Endpoints for all PaaS services",
        "Microsoft Entra ID PIM (just-in-time privileged access)",
        "Microsoft Defender for Cloud (CSPM)",
      ],
      wafPillars: ["Security", "Reliability", "Operational Excellence"],
      cafAlignment: "Ready — implements CAF enterprise-scale landing zone with Zero Trust network design principles.",
    };
  }

  if (isCloud && missionCritical && (f.haEnabled || f.drEnabled)) {
    return {
      name: "Resilient Active-Active Multi-Region Pattern",
      category: "Mission-Critical Workload",
      confidence: "high",
      summary: "Active-active or active-passive multi-region deployment across Canada Central and Canada East for maximum availability aligned to Tier 0/1 RTO/RPO.",
      rationale: `Business criticality ${f.businessCriticality} with HA/DR requirements. Azure WAF Reliability pillar requires geo-redundant, zone-redundant PaaS services with automated failover and tested recovery runbooks.`,
      keyComponents: [
        "Azure Traffic Manager / Front Door (global load balancing)",
        "Zone-redundant PaaS (App Service, Azure SQL, Storage)",
        "Azure SQL Geo-Replication (Canada Central ↔ Canada East)",
        "Azure Site Recovery (compute failover)",
        "Azure Monitor + Alerts (health probes & runbooks)",
        "Azure Backup (policy-enforced, tested restores)",
      ],
      wafPillars: ["Reliability", "Operational Excellence", "Security"],
      cafAlignment: "Manage — CAF operational compliance with business continuity management and SLA governance.",
    };
  }

  if (isThirdParty) {
    return {
      name: "SaaS Governance & Identity Federation Pattern",
      category: "Third-Party / SaaS",
      confidence: "medium",
      summary: "Secure SSO federation via Microsoft Entra ID with vendor access governed through McCain's PAM tooling, and data flows monitored via Microsoft Defender for Cloud Apps.",
      rationale: "Third-party/SaaS deployment model. CAF guidance requires identity governance, vendor risk review, and data egress monitoring rather than infrastructure provisioning.",
      keyComponents: [
        "Microsoft Entra ID (SAML/OIDC federation)",
        "Conditional Access Policies (MFA, device compliance)",
        "Microsoft Defender for Cloud Apps (CASB)",
        "Microsoft Entra PIM (vendor privileged access)",
        "Azure Monitor (activity log forwarding)",
        "Data Loss Prevention (DLP) policies",
      ],
      wafPillars: ["Security", "Operational Excellence"],
      cafAlignment: "Govern — enforces CAF identity & access management and vendor risk compliance controls.",
    };
  }

  if (isOnPrem) {
    return {
      name: "Hardened On-Premises Deployment Pattern",
      category: "On-Premises",
      confidence: "medium",
      summary: "Secure on-premises deployment within McCain data centres with network segmentation, privileged access management, and hybrid connectivity to Azure Monitor.",
      rationale: "On-premises deployment model. Azure CAF hybrid guidance applies for log forwarding to central SIEM and Azure Arc management plane for unified governance.",
      keyComponents: [
        "Dedicated VLAN / network segment (micro-segmentation)",
        "Active Directory integration (Kerberos/LDAP)",
        "Azure Arc (unified management & policy)",
        "Azure Monitor Agent (log forwarding to Log Analytics)",
        "HashiCorp Vault or Azure Key Vault (secrets via hybrid)",
        "CyberArk PAM (privileged session management)",
      ],
      wafPillars: ["Security", "Operational Excellence", "Reliability"],
      cafAlignment: "Hybrid — CAF hybrid and multi-cloud design area with Arc-enabled servers for governance parity.",
    };
  }

  if (isHybrid) {
    return {
      name: "Hybrid Cloud Bridge Architecture",
      category: "Hybrid Workload",
      confidence: "medium",
      summary: "Extends McCain on-premises workloads to Azure via ExpressRoute or VPN, using Azure Arc for unified governance and Azure Monitor for end-to-end observability.",
      rationale: "Hybrid deployment model with both on-premises and cloud components. CAF prescribes a well-defined network topology, consistent identity plane, and unified policy management via Azure Arc.",
      keyComponents: [
        "Azure ExpressRoute / Site-to-Site VPN",
        "Hub VNet (connectivity hub)",
        "Azure Arc (on-premises server governance)",
        "Azure Active Directory Connect (identity sync)",
        "Private DNS Resolver",
        "Azure Monitor (unified observability)",
      ],
      wafPillars: ["Reliability", "Security", "Operational Excellence"],
      cafAlignment: "Hybrid & Multi-Cloud — CAF connectivity design area with private, non-internet-routed integration.",
    };
  }

  // Default: Standard cloud workload
  return {
    name: "Standard Cloud Application Pattern",
    category: "Cloud Workload",
    confidence: "medium",
    summary: "Azure PaaS-first deployment within McCain's Cloud (McCain Tenant) landing zone following CCoE guardrails and Azure CAF best practices.",
    rationale: "Cloud deployment with standard risk profile. CAF recommends PaaS-first approach, mandatory CCoE tagging, Canada-only region constraints, and Azure Policy compliance.",
    keyComponents: [
      "Azure App Service / Container Apps",
      "Azure SQL Database / Cosmos DB",
      "Azure Key Vault (secrets management)",
      "Azure Monitor + Application Insights",
      "Azure Policy (CCoE guardrails)",
      "Azure Managed Identity (credential-free auth)",
    ],
    wafPillars: ["Cost Optimization", "Operational Excellence", "Reliability"],
    cafAlignment: "Ready — CAF-aligned landing zone with subscription vending and required CCoE policy initiative.",
  };
}

function enrichRiskInsight(risk: Omit<RiskInsight, "remediation" | "bestPractice">): RiskInsight {
  const categoryGuidance: Record<string, Pick<RiskInsight, "remediation" | "bestPractice">> = {
    "AI Risk": {
      remediation: "Require Responsible AI review, document model purpose and data usage, define human-in-the-loop approval, and capture rollback/manual override steps before production.",
      bestPractice: "Use Azure OpenAI with private networking where available, approved content filters, prompt/output logging policy, data retention controls, and clear accountability for AI-assisted decisions.",
    },
    Availability: {
      remediation: "Confirm RTO/RPO with the business owner, add HA/DR design where the workload is business critical, and schedule failover testing before go-live.",
      bestPractice: "Use zone-redundant PaaS SKUs for production, backup policies with tested restore, health probes, autoscale rules, and documented incident runbooks.",
    },
    Connectivity: {
      remediation: "Validate ExpressRoute/VPN routing, DNS, firewall paths, and latency assumptions with Network Architecture before approval.",
      bestPractice: "Use hub-spoke network patterns, private endpoints, central DNS zones, NSG-as-code, and monitored egress through approved enterprise controls.",
    },
    "Cloud Governance": {
      remediation: "Confirm subscription, resource group, naming, tagging, policy assignment, and owner metadata before provisioning starts.",
      bestPractice: "Enforce Azure Policy initiatives, management-group inheritance, mandatory tags, budget alerts, and CCoE-approved landing zone patterns.",
    },
    "Data & Privacy": {
      remediation: "Complete data classification, privacy impact assessment where needed, encryption requirements, and retention/deletion sign-off.",
      bestPractice: "Keep data in approved Canadian regions, use customer-managed or platform-managed encryption by classification, restrict access with RBAC/PIM, and log all privileged access.",
    },
    FinOps: {
      remediation: "Obtain budget owner and FinOps approval, define cost allocation tags, and validate SKU sizing before deployment.",
      bestPractice: "Use Azure budgets, anomaly alerts, reserved capacity/savings plans where appropriate, right-sizing reviews, and chargeback/showback reporting.",
    },
    Integration: {
      remediation: "Document all integration endpoints, owners, SLAs, retry/error handling, and security controls before approval.",
      bestPractice: "Prefer API Management or approved integration middleware, managed identities, circuit breakers, idempotent operations, and contract/version governance.",
    },
    "Migration Risk": {
      remediation: "Create a migration runbook with data validation, cutover windows, rollback criteria, and pilot migration evidence.",
      bestPractice: "Use phased migration, pre-prod rehearsals, reconciliation reports, business sign-off gates, and rollback-tested release plans.",
    },
    "Regional Compliance": {
      remediation: "Validate all data stores, backups, logs, and failover targets remain in approved Canadian regions.",
      bestPractice: "Restrict deployments through Azure Policy allowed locations and document Canada Central/Canada East residency in the design record.",
    },
    Regulatory: {
      remediation: "Engage Compliance/Legal/Privacy teams, identify applicable controls, and require evidence before production approval.",
      bestPractice: "Map controls to policy obligations, maintain immutable audit logs, define evidence owners, and schedule periodic compliance reviews.",
    },
    Security: {
      remediation: "Complete threat modelling, IAM/RBAC design, secrets review, vulnerability management, and security architecture sign-off.",
      bestPractice: "Apply Zero Trust, private access by default, Key Vault for secrets, Defender for Cloud plans, WAF/DDoS controls for internet-facing workloads, and centralized logging.",
    },
    "Vendor Risk": {
      remediation: "Complete vendor risk assessment, DPA/SLA review, data exit strategy, and privileged access review before approval.",
      bestPractice: "Use vendor due diligence, contractual security clauses, SSO/MFA, least-privilege vendor access, periodic access recertification, and documented exit plans.",
    },
  };

  return {
    ...risk,
    ...(categoryGuidance[risk.category] ?? {
      remediation: "Assign an accountable owner, document acceptance criteria, and ensure evidence is captured before approval.",
      bestPractice: "Use policy-backed controls, auditable approval gates, and measurable operational readiness criteria.",
    }),
  };
}
