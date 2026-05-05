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
}

const THIRD_PARTY_MODELS = ["SaaS Solution", "Vendor Tenant", "Other 3rd Party Solution"];

export function computeArchitectRecommendations(f: FormSnapshot): ArchitectRec[] {
  const isCloud      = f.deploymentModel === "Cloud (McCain Tenant)";
  const isThirdParty = THIRD_PARTY_MODELS.includes(f.deploymentModel);
  const isOnPrem     = f.deploymentModel === "On-Premises (McCain Data Center)";
  const isHybrid     = f.deploymentModel === "Hybrid";
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
  const isCloud      = f.deploymentModel === "Cloud (McCain Tenant)";
  const isThirdParty = THIRD_PARTY_MODELS.includes(f.deploymentModel);
  const isHybrid     = f.deploymentModel === "Hybrid";
  const internetFacing = f.networkPosture === "Internet-Facing" || f.networkPosture === "Hybrid";
  const bigCost        = ["Large (500K–1M CAD)", "XLarge (>1M CAD)"].includes(f.costTShirtSize);

  const items: RiskInsight[] = [];

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

  return items;
}
