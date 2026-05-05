import { Router, type IRouter } from "express";
import { GenerateTddBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { getBlobStorageStatus, uploadTextBlob } from "../../lib/blob-storage";
import {
  createOpenAiClientContext,
  resolveOpenAiModel,
  toCompletionText,
  toUserFacingGenerationError,
} from "./openai-client";
import {
  buildNamingConventionLines,
  buildNamingParts,
  getLobCode,
  sanitizeNamePart,
  resolveOrgShortForm,
} from "./naming-conventions";
import { tddGenerateRateLimiter } from "../../middleware/rate-limit";
import type OpenAI from "openai";

const router: IRouter = Router();

/**
 * Build OpenAI completion parameters compatible with both Azure OpenAI and
 * standard OpenAI. Uses `max_completion_tokens` (the modern parameter)
 * which is supported by all current Azure API versions (2024-10-01-preview+)
 * and the gpt-4.1 model family.
 */
function buildCompletionParams(options: {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  maxTokens: number;
  usesAzure: boolean;
  stream: boolean;
}): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
  const base: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: options.stream,
    max_completion_tokens: options.maxTokens,
  };

  return base as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
}

/**
 * Resolve the maximum output tokens for TDD generation based on the
 * configured model / deployment. Users can override via the
 * TDD_GENERATE_MAX_TOKENS environment variable.
 *
 * Token budget guidance by model:
 * - gpt-4o (2024-08-06+): 16,384 output tokens (128k context)
 * - gpt-4o-mini:          16,384 output tokens (128k context)
 * - gpt-4.1 / gpt-4.1-mini: up to 32,768 output tokens (1M context)
 * - o1 / o3-mini:         100,000+ output tokens (200k context)
 *
 * The complete TDD document typically requires 8,000–14,000 output tokens
 * because heavy deterministic tables (networking, NSG, naming, cost) are
 * injected server-side via placeholders. We set a generous default of
 * 16,000 so the model never needs to truncate prose.
 */
function resolveMaxOutputTokens(usesAzure: boolean): number {
  const envOverride = process.env.TDD_GENERATE_MAX_TOKENS;
  if (envOverride) {
    const parsed = Number.parseInt(envOverride, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const deployment = usesAzure
    ? (process.env.AZURE_OPENAI_DEPLOYMENT ?? "").toLowerCase()
    : (process.env.AI_INTEGRATIONS_OPENAI_MODEL ?? "gpt-4o").toLowerCase();

  if (deployment.includes("o1") || deployment.includes("o3") || deployment.includes("o4")) {
    return 32_000;
  }
  if (deployment.includes("gpt-4.1") || deployment.includes("gpt-5")) {
    return 32_000;
  }

  return 16_000;
}

interface TddPersistenceContext {
  db: typeof import("@workspace/db").db;
  tddSubmissionsTable: typeof import("@workspace/db").tddSubmissionsTable;
}
const REQUIRED_TDD_HEADINGS = [
  "1. Executive Summary",
  "2. Ownership, Stakeholders & Billing Context",
  "3. Workload Context & Classification",
  "4. Current State Architecture (As-Is)",
  "5. Platform Components (Infrastructure View)",
  "6. Proposed Target State Architecture (To-Be)",
  "7. Target Solution Detailed Design Components",
  "8. Deployment Architecture",
] as const;

// Placeholders replaced by server-side injection after generation.
// These keep large deterministic tables out of the model's output token budget.
const PLATFORM_COMPONENTS_PLACEHOLDER = "[PLATFORM_COMPONENTS_TABLE]";
const NSG_RULES_PLACEHOLDER = "[NSG_RULES_TABLE]";
const NETWORKING_TABLE_PLACEHOLDER = "[NETWORKING_TABLE]";
const SECURITY_ACCESS_PLACEHOLDER = "[SECURITY_ACCESS_TABLE]";
const COMPUTE_SIZING_PLACEHOLDER = "[COMPUTE_SIZING_TABLE]";
const DATABASE_SIZING_PLACEHOLDER = "[DATABASE_SIZING_TABLE]";
const MONITORING_OPS_PLACEHOLDER = "[MONITORING_OPS_TABLE]";
const COST_BREAKDOWN_PLACEHOLDER = "[COST_BREAKDOWN_TABLE]";
const NAMING_STANDARDS_PLACEHOLDER = "[NAMING_STANDARDS_TABLE]";
const IAC_INPUTS_PLACEHOLDER = "[IAC_INPUTS_TABLE]";
const WORKLOAD_CLASSIFICATION_PLACEHOLDER = "[WORKLOAD_CLASSIFICATION_TABLE]";

/**
 * All system placeholder names (without brackets), used for normalisation.
 * When a model escapes brackets or wraps these in backticks we convert them
 * back to the canonical bare-bracket form before running table injection.
 */
const ALL_PLACEHOLDER_NAMES = [
  "PLATFORM_COMPONENTS_TABLE",
  "NSG_RULES_TABLE",
  "NETWORKING_TABLE",
  "SECURITY_ACCESS_TABLE",
  "COMPUTE_SIZING_TABLE",
  "DATABASE_SIZING_TABLE",
  "MONITORING_OPS_TABLE",
  "COST_BREAKDOWN_TABLE",
  "NAMING_STANDARDS_TABLE",
  "IAC_INPUTS_TABLE",
  "WORKLOAD_CLASSIFICATION_TABLE",
  "ARCHITECTURE_DIAGRAM_PLACEHOLDER",
] as const;

/**
 * Normalise placeholder tokens that the model may have reformatted.
 *
 * Some models (e.g. gpt-5.x) escape markdown bracket syntax or wrap tokens in
 * code spans, producing variants like:
 *   `[PLATFORM_COMPONENTS_TABLE]`   – backtick code span
 *   \[PLATFORM_COMPONENTS_TABLE\]   – escaped brackets
 *   \[PLATFORM\_COMPONENTS\_TABLE\] – escaped brackets AND underscores
 *
 * This function converts all such variants back to the canonical
 * [PLACEHOLDER_NAME] form so that String.replace() can find and substitute them.
 */
function normalizePlaceholders(markdown: string): string {
  let result = markdown;
  for (const name of ALL_PLACEHOLDER_NAMES) {
    // Build a pattern where each underscore may optionally be preceded by a
    // backslash (i.e. the model escapes `_` as `\_` in markdown).
    // "\\\\?_" as a JS string is the 4 chars  \\?_  which in a RegExp means:
    //   \\? = optional literal backslash, _ = literal underscore.
    const escapedName = name.replace(/_/g, "\\\\?_");
    const pattern = new RegExp(
      // Optional leading backtick (code-span wrapping)
      "`?" +
      // Opening bracket: literal [ or escaped \[
      "(?:\\\\\\[|\\[)" +
      escapedName +
      // Closing bracket: literal ] or escaped \]
      "(?:\\\\\\]|\\])" +
      // Optional trailing backtick
      "`?",
      "g",
    );
    result = result.replace(pattern, `[${name}]`);
  }
  return result;
}

const AUTHORING_GUARDRAILS = `
## Authoring Guardrails (Mandatory)
- Keep language concise, enterprise-ready, and directly actionable for implementation teams.
- Do not leave placeholders like "[to be defined]" unless there is no feasible assumption.
- Every architecture recommendation must include an Azure-native service and a short rationale.
- Keep assumptions explicit and separate from confirmed facts.
- Use markdown headings exactly as requested and keep numbering stable.
- Use Cloudflare WAF as the shared enterprise L7 firewall service across all environments.
- Do not propose Azure Application Gateway WAF or a new dedicated Azure Firewall for this workload.
- Present key data (networking, services, NSG rules, RBAC) in markdown tables, not bullet lists alone.

## Diagram Guardrails (Mandatory)
- Do NOT generate any Mermaid diagrams or code fences. An architecture diagram is auto-generated and injected by the system — any diagram you produce will be discarded.
- Use your token budget on prose, tables, and technical detail instead.
`;

const FEW_SHOT_SECTION_EXAMPLE = `
## Few-shot Style Example (Executive Summary)
Good example:
"This workload modernizes regional plant scheduling with Azure App Service, Azure Database for PostgreSQL, and Azure Monitor. The solution targets Dev/QA/Prod in Canada Central with DR in Canada East. Key risks are data migration cutover and network policy drift; mitigations include phased migration and IaC policy enforcement."

Bad example:
"This is a cloud app and we will use Azure services. It should be scalable and secure."

Always follow the "Good example" quality bar: specific services, scope, risks, and mitigations.
`;

function toSectionSlug(sectionHeading: string): string {
  return sectionHeading
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-");
}

async function loadTddPersistenceContext(): Promise<TddPersistenceContext | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const dbModule = await import("@workspace/db");
    return {
      db: dbModule.db,
      tddSubmissionsTable: dbModule.tddSubmissionsTable,
    };
  } catch {
    return null;
  }
}

function escapeForRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeMermaidBlocks(markdown: string): string {
  return markdown.replaceAll(/```mermaid\s*([\s\S]*?)```/gi, (_match, rawBody) => {
    const body = String(rawBody).trim();
    const normalized = body.toLowerCase();
    const hasKnownStarter =
      /^graph(\s|$)/.test(normalized) ||
      /^flowchart(\s|$)/.test(normalized) ||
      /^sequencediagram(\s|$)/.test(normalized) ||
      /^classdiagram(\s|$)/.test(normalized) ||
      /^statediagram(\s|$)/.test(normalized) ||
      /^erdiagram(\s|$)/.test(normalized) ||
      /^journey(\s|$)/.test(normalized) ||
      /^gantt(\s|$)/.test(normalized) ||
      /^pie(\s|$)/.test(normalized) ||
      /^mindmap(\s|$)/.test(normalized) ||
      /^timeline(\s|$)/.test(normalized) ||
      /^gitgraph(\s|$)/.test(normalized);

    const includesMermaidErrorOutput =
      normalized.includes("syntax error in text") ||
      normalized.includes("mermaid version");

    if (!hasKnownStarter || includesMermaidErrorOutput) {
      return "```text\n[Invalid Mermaid diagram omitted by guardrail]\n```";
    }

    return `\`\`\`mermaid\n${sanitizeMermaidBody(body)}\n\`\`\``;
  });
}

function removeUnfencedMermaidEngineErrors(markdown: string): string {
  const lines = markdown.split("\n");
  const filteredLines: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    const trimmedLower = line.trim().toLowerCase();
    const isCodeFence = line.trim().startsWith("```");
    if (isCodeFence) {
      inCodeFence = !inCodeFence;
      filteredLines.push(line);
      continue;
    }

    if (!inCodeFence) {
      if (
        trimmedLower === "syntax error in text" ||
        /^mermaid version\s+\d+\.\d+\.\d+/.test(trimmedLower)
      ) {
        continue;
      }
    }

    filteredLines.push(line);
  }

  return filteredLines.join("\n");
}

function repairBrokenCodeFences(markdown: string): string {
  const lines = markdown.split("\n");
  const repaired: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isFence = trimmed.startsWith("```");
    if (isFence) {
      inCodeFence = !inCodeFence;
      repaired.push(line);
      continue;
    }

    const isNumberedSectionHeading = /^##\s+\d+\./.test(trimmed);
    if (inCodeFence && isNumberedSectionHeading) {
      repaired.push("```");
      inCodeFence = false;
    }

    repaired.push(line);
  }

  if (inCodeFence) {
    repaired.push("```");
  }

  return repaired.join("\n");
}

function removeGenerationMetaArtifacts(markdown: string): string {
  return markdown
    .replaceAll(
      /^.*full document will continue.*$/gim,
      "",
    )
    .replaceAll(
      /^.*contact for more details and final implementation steps.*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\(the rest of sections follows similar level detail as initially outlined, ending with deployment sequence\.?\)\s*$/gim,
      "",
    )
    .replaceAll(
      /^.*syntax error in text.*$/gim,
      "",
    )
    .replaceAll(
      /^.*mermaid version\s+\d+\.\d+\.\d+.*$/gim,
      "",
    )
    .replaceAll(
      /syntax error in text\s*mermaid version\s+\d+\.\d+\.\d+/gim,
      "",
    )
    .replaceAll(
      /^\s*\[(see full detailed components.*outlined previously.*)\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[(deployment sequence.*outlined previously.*section 8.*)\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^.*please respond to request additional sections.*$/gim,
      "",
    )
    .replaceAll(
      /^.*after deep review\/feedback.*$/gim,
      "",
    )
    .replaceAll(
      /^.*feel free to ask for.*additional.*sections.*$/gim,
      "",
    )
    .replaceAll(
      /^.*let me know if you.*want.*additional.*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[remaining sections?\s+[\d\.]+ through[\s\S]*?\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[all subsections? formatted and output.*?\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[sections?\s+[\d\.]+\s+through\s+[\d\.]+.*?output.*?\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[.*?without skipping.*?\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[.*?all subsections.*?formatted.*?\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^.*output\s+(all\s+)?sections?\s+7\.1\s+through\s+7\.10.*$/gim,
      "",
    )
    .replaceAll(
      /^.*output\s+(all\s+)?subsections?\s+7\.1\s+through.*$/gim,
      "",
    )
    .replaceAll(
      /^.*do not summarize or skip any subsection.*$/gim,
      "",
    )
    .replaceAll(
      /^>?\s*\*?\*?IMPORTANT:?\*?\*?.*subsection.*$/gim,
      "",
    )
    .replaceAll(
      /^.*token context limit.*$/gim,
      "",
    )
    .replaceAll(
      /^.*exceeds\s+(the\s+)?token.*$/gim,
      "",
    )
    .replaceAll(
      /^.*omitted sections.*$/gim,
      "",
    )
    .replaceAll(
      /^.*would continue\s+(markdown|with|the)\s+.*as above.*$/gim,
      "",
    )
    .replaceAll(
      /^.*follows?\s+(the\s+)?same\s+detailed\s+pattern.*$/gim,
      "",
    )
    .replaceAll(
      /^.*sections?\s+[\d\.]+[–\-][\d\.]+\s+would\s+continue.*$/gim,
      "",
    )
    .replaceAll(
      /^.*complete\s+document\s+generation\s+exceeds.*$/gim,
      "",
    )
    .replaceAll(
      /^.*remaining\s+sections?\s+continue\s+as\s+outlined.*$/gim,
      "",
    )
    .replaceAll(
      /^.*tokens?\s+are\s+constrained.*$/gim,
      "",
    )
    .replaceAll(
      /^.*this\s+response\s+truncates?\s+at.*$/gim,
      "",
    )
    .replaceAll(
      /^.*truncates?\s+at\s+[\d\.]+\s+due\s+to\s+space.*$/gim,
      "",
    )
    .replaceAll(
      /^.*complete\s+all\s+sections?\s+in\s+markdown\s+for\s+prod.*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\(\s*remaining\s+sections?\s+continue[\s\S]*?\)\s*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[sections?\s+\d+[-–]\d+\s+follow\s+the\s+exact\s+template[\s\S]*?\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^.*follow\s+the\s+exact\s+template\s+format\s+above.*$/gim,
      "",
    )
    .replaceAll(
      /^.*subsections?\s+7\.1\s*[-–]\s*7\.10\s+fully\s+drafted.*$/gim,
      "",
    )
    .replaceAll(
      /^.*prose\s+and\s+tables\s+written\s+per\s+app\s+case.*$/gim,
      "",
    )
    .replaceAll(
      /^.*fully\s+drafted.*per\s+app\s+case.*$/gim,
      "",
    )
    .replaceAll(
      /^.*all\s+sections?\s+describe\s+infra.*devops.*concisely.*$/gim,
      "",
    )
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function enforceSharedEdgeSecurityConstraints(markdown: string): string {
  return markdown
    .replaceAll(
      /Azure Application Gateway with WAF \(Web Application Firewall\)/gi,
      "Cloudflare WAF (shared enterprise L7 firewall service)",
    )
    .replaceAll(
      /Azure Front Door \+ WAF/gi,
      "Cloudflare WAF (shared enterprise L7 firewall service)",
    )
    .replaceAll(
      /\bAzure Application Gateway\b/gi,
      "Cloudflare WAF (shared enterprise L7 firewall service)",
    )
    .replaceAll(
      /\bAzure Firewall\b/gi,
      "Shared enterprise L7 firewall service",
    );
}

function buildFallbackSectionContent(heading: string): string {
  if (heading === "3. Workload Context & Classification") {
    return [
      "### 3.1 Environment Summary",
      "See environment summary configured in the intake form.",
      "",
      "### 3.2 Workload Classification",
      "",
      WORKLOAD_CLASSIFICATION_PLACEHOLDER,
    ].join("\n");
  }

  if (heading === "5. Platform Components (Infrastructure View)") {
    return [
      "### 5.1 Existing/Current Infra Components",
      "No existing Azure infrastructure — this is a net-new deployment.",
      "",
      "### 5.2 New/Proposed Infra Components",
      "The following table lists all new Azure services provisioned for this solution:",
      "",
      PLATFORM_COMPONENTS_PLACEHOLDER,
    ].join("\n");
  }

  if (heading === "6. Proposed Target State Architecture (To-Be)") {
    return [
      "### 6.1 Architecture Overview",
      "",
      "The target state architecture follows Azure Landing Zone principles with a hub-spoke network topology hosted in Canadian Azure regions (Canada Central primary, Canada East for DR where enabled). The workload resides in a dedicated spoke subscription, with a spoke VNet peered to the McCain enterprise hub VNet. The hub VNet contains shared services managed by the McCain network team: Bastion host, VPN/ExpressRoute Gateway, shared DNS servers, and the corporate network firewall (Palo Alto / Fortinet). No dedicated Azure Firewall is provisioned per workload — all inter-spoke and internet-bound traffic is routed via User-Defined Routes (UDRs) through the shared hub firewall.",
      "",
      "**Inbound Traffic Path:** Internet → Cloudflare WAF (enterprise L7 protection and DNS under the mccain.com umbrella) → Azure App Service built-in load balancer (HTTPS only, TLS 1.2+). No Azure Application Gateway or per-workload WAF is deployed. Cloudflare WAF provides DDoS mitigation, bot protection, and L7 filtering before traffic reaches the App Service endpoint.",
      "",
      "**Outbound Traffic Path:** App Service VNet Integration → spoke VNet → UDRs → Hub VNet → corporate shared firewall → internet (for any approved external dependencies). All PaaS service access (PostgreSQL Flexible Server, Azure Key Vault, Azure Storage, Service Bus) is routed via Private Endpoints within the spoke VNet. Private DNS Zones resolve private FQDNs for all PaaS services, ensuring DNS resolution stays within the Microsoft network and never traverses the public internet.",
      "",
      "**Application Tier:** Azure App Service Plan (PaaS) deployed in the spoke subscription. Each environment (Dev, QA/UAT, Prod) has its own dedicated App Service Plan and Web App resource, with VNet outbound integration enabled for all environments. Production Web Apps use staging deployment slots to support zero-downtime blue/green deployments with slot swap promotion.",
      "",
      "**Data Tier:** Azure Database for PostgreSQL Flexible Server deployed in a dedicated database subnet delegated to `Microsoft.DBforPostgreSQL/flexibleServers`. The Flexible Server has no public network access — all connectivity is via Private Endpoint within the spoke VNet. Geo-redundant backups are enabled for the production environment with a 7-day retention period and point-in-time restore capability. Dev and QA environments use locally redundant storage (LRS) backups.",
      "",
      "**Security Boundary:** Microsoft Entra ID (Azure AD) enforces authentication at the App Service level using Managed Identities for all service-to-service communication — no stored credentials or service principal secrets. Network Security Groups (NSGs) are applied at the subnet level (one NSG per subnet) providing L4 port/protocol controls as the local enforcement layer. Azure Key Vault stores all application secrets with soft-delete (90-day retention) and purge protection enabled; access is via Managed Identity with least-privilege RBAC role assignments. Azure Private DNS Zones handle name resolution for all Private Endpoints (Key Vault, PostgreSQL, Storage).",
      "",
      "### 6.2 Architecture Diagram (High Level)",
      "",
      "[ARCHITECTURE_DIAGRAM_PLACEHOLDER]",
    ].join("\n");
  }

  if (heading === "7. Target Solution Detailed Design Components") {
    return [
      "### 7.1 Network Architecture",
      "**Per-Environment VNet and Subnet Design:**",
      "",
      NETWORKING_TABLE_PLACEHOLDER,
      "",
      "**Hub-Spoke Corporate Network Topology:**",
      "- Shared Hub VNet managed by the McCain network team with shared services (Bastion, VPN/ExpressRoute Gateway, DNS).",
      "- One dedicated spoke VNet per environment, peered to the hub.",
      "- Corporate Shared Firewall (Palo Alto / Fortinet) in Hub — no dedicated Azure Firewall per workload.",
      "- Cloudflare WAF is the enterprise L7 protection layer; no Azure Application Gateway WAF deployed.",
      "- Azure App Service built-in load balancer used — no separate Azure Load Balancer.",
      "- Private Endpoints for all PaaS services; Private DNS Zones for name resolution.",
      "",
      "**NSG Rules:**",
      "",
      NSG_RULES_PLACEHOLDER,
      "",
      "### 7.2 Identity & Access Management",
      "- Microsoft Entra ID (Azure AD) with Managed Identities for all service-to-service authentication.",
      "- RBAC least-privilege model with role assignments scoped to resource groups, not subscriptions.",
      "- Privileged Identity Management (PIM) for just-in-time administrative access.",
      "- Conditional Access policies enforcing MFA for all user accounts.",
      "",
      SECURITY_ACCESS_PLACEHOLDER,
      "",
      "### 7.3 Compute & Platform Architecture",
      "**App Service Plan & Web App Configuration (per environment):**",
      "",
      COMPUTE_SIZING_PLACEHOLDER,
      "",
      "- Auto-scale rules: min 1, max 5 instances; scale-out at CPU > 70% for 5 minutes.",
      "- Availability Zones enabled for Prod workloads when HA is required.",
      "",
      "### 7.4 Data & Storage Architecture",
      "**Database Configuration (per environment):**",
      "",
      DATABASE_SIZING_PLACEHOLDER,
      "",
      "- Encryption at rest (AES-256) and in transit (TLS 1.2+) on all data services.",
      "- Private Endpoint only — no public database access.",
      "",
      "### 7.5 Security Architecture & Controls",
      "- Microsoft Defender for Cloud with Standard tier on all production services.",
      "- Azure Key Vault: soft delete 90 days, purge protection ON, Managed Identity access only.",
      "- Azure Policy initiatives: CIS Azure 1.4.0 and organizational custom policies applied.",
      "- No secrets in source code or pipeline variables — all secrets stored in Key Vault.",
      "",
      "### 7.6 Monitoring & Operations",
      "",
      MONITORING_OPS_PLACEHOLDER,
      "",
      "### 7.7 Business Continuity & Disaster Recovery",
      "- Availability target: 99.9%. Automated database backups with point-in-time restore.",
      "- Storage replication: GRS for Prod (when DR enabled), LRS for Dev/QA.",
      "- DR region: Canada East (when DR is enabled); Active-Passive failover model.",
      "- Quarterly DR drills; runbooks maintained in Azure DevOps wiki.",
      "",
      "### 7.8 DevOps & Release Management",
      "- Azure DevOps pipelines (YAML-based): Dev auto-deploy on merge; QA/Prod require approvals.",
      "- Infrastructure as Code: Bicep/Terraform stored in Azure Repos; peer review required.",
      "- Branch strategy: feature/* → develop → release/* → main.",
      "",
      "### 7.9 Risks, Assumptions & Exceptions",
      "| # | Category | Risk / Assumption | Mitigation |",
      "|---|----------|-------------------|-----------|",
      "| 1 | Network | Network team engagement required for VNet CIDR and hub peering | Engage early |",
      "| 2 | Security | Azure AD P2 licensing required for PIM | Verify before deployment |",
      "| 3 | Cost | Estimates are indicative | Validate with Azure Pricing Calculator |",
      "",
      "### 7.10 Cost Management & Financial Governance",
      "**Solution Budget:**",
      "",
      COST_BREAKDOWN_PLACEHOLDER,
      "",
      "- Azure Cost Management budgets: alerts at 80% and 100% of monthly estimate.",
      "- Dev/QA auto-shutdown outside business hours (estimated 40–60% savings).",
    ].join("\n");
  }

  if (heading === "8. Deployment Architecture") {
    return [
      "**Deployment Sequence:**",
      "1. Hub Network: VNet, NSGs, VPN/ExpressRoute Gateway — coordinated with network team.",
      "2. Spoke VNets per environment + VNet Peering to hub.",
      "3. Shared foundation: Key Vault, Log Analytics Workspace, Managed Identities, RBAC assignments.",
      "4. Data services: Database Flexible Server + Private Endpoints + DNS Zones.",
      "5. Compute: App Service Plans and Web Apps (Dev first, then QA/UAT, then Prod).",
      "6. CI/CD pipeline initialization and application deployment.",
      "7. Monitoring, alerting, and diagnostic settings validation.",
      "8. Security baseline review (Defender for Cloud score); Prod go-live approval.",
      "",
      "**Environment Promotion:** Dev → QA/UAT → Production (each requires sign-off)",
      "",
      "### 8.1 Naming & Resource Standards",
      "The following table provides computed resource names for all environments:",
      "",
      NAMING_STANDARDS_PLACEHOLDER,
      "",
      "### 8.2 Deployment Inputs for IaC / Pipeline",
      "The following table captures all key parameters required to deploy this solution:",
      "",
      IAC_INPUTS_PLACEHOLDER,
    ].join("\n");
  }

  return "Section generated with baseline guidance. Review and refine for workload-specific details.";
}

function toMermaidNodeLabel(value: string): string {
  return value
    .trim()
    .replaceAll(/[^\w\s\-/().]/g, "")
    .replaceAll(/\s+/g, " ");
}

/**
 * Sanitizes a Mermaid diagram body to be compatible with Mermaid v11.
 * - Removes markdown table lines (pipe-delimited) that sneak into diagrams
 * - Quotes unquoted node labels that contain parentheses or other special chars
 * - Strips horizontal rule lines
 */
function sanitizeMermaidBody(body: string): string {
  const lines = body.split("\n").map((line) => {
    const trimmed = line.trim();

    // Keep blank lines and comments as-is
    if (trimmed === "" || trimmed.startsWith("%%")) return line;

    // Keep control keywords as-is
    if (
      /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitgraph)(\s|$)/i.test(trimmed) ||
      /^(subgraph|end|direction|click|style|classDef|linkStyle|note)(\s|$)/i.test(trimmed)
    ) {
      return line;
    }

    // Remove markdown table lines (starts with |)
    if (trimmed.startsWith("|")) return "";

    // Remove horizontal rules
    if (/^[-*]{3,}$/.test(trimmed)) return "";

    // Fix unquoted node labels containing parentheses or other special chars
    // that Mermaid v11 might misinterpret as shape syntax.
    // Pattern: NodeId[unquoted label with special chars]  → NodeId["quoted label"]
    // - \b(\w+) matches the node ID (alphanumeric/underscore only)
    // - \[([^(\]"<>][^\]]*[()#+&][^\]]*)\] matches an unquoted rectangular-bracket label body
    //   whose first character is NOT ( — this preserves cylinder shapes [(label)] where the
    //   bracket content starts with ( as a shape delimiter, not a label character.
    //   (Stadium shapes use ([label]) syntax and don't use the [( pattern.)
    //   The body must contain at least one of: ( ) # + & — chars that can confuse Mermaid v11.
    const fixedLine = line.replace(
      /\b(\w+)\[([^(\]"<>][^\]]*[()#+&][^\]]*)\]/g,
      (_m, id: string, label: string) => `${id}["${label.replace(/"/g, "'")}"]`,
    );
    return fixedLine;
  });

  return lines.join("\n");
}

function buildDeterministicArchitectureDiagram(data: {
  applicationName: string;
  networkPosture: string;
  drEnabled?: boolean;
  azureRegions: string[];
}): string {
  // Sanitize the app label so it is safe inside a quoted Mermaid node label
  const rawLabel = toMermaidNodeLabel(data.applicationName) || "Application";
  // Strip parentheses and square brackets from the label to avoid Mermaid v11
  // misinterpreting them as shape delimiters (e.g., ([]) = stadium, [()] = cylinder)
  const appLabel = rawLabel.replace(/[()[\]]/g, "").trim() || "Application";
  const regionLabel = data.azureRegions
    .map((region) => (region === "canadacentral" ? "Canada Central" : "Canada East"))
    .join(" and ");
  const postureLabel =
    data.networkPosture === "Internal-Only"
      ? "Private access via shared enterprise edge"
      : "Internet access via shared enterprise edge";
  const drLabel = data.drEnabled ? "DR replication enabled" : "Single-region primary";

  return [
    "graph TD",
    "    Users([End Users])",
    '    Cloudflare["Cloudflare WAF - Shared L7 Firewall"]',
    `    Web["Azure App Service - ${appLabel} Web"]`,
    `    Api["Azure App Service - ${appLabel} API"]`,
    "    Pg[(Azure Database for PostgreSQL)]",
    "    Blob[(Azure Blob Storage)]",
    '    KeyVault["Azure Key Vault"]',
    '    Monitor["Azure Monitor and Application Insights"]',
    `    Region["Primary Region - ${regionLabel}"]`,
    `    Posture["${postureLabel}"]`,
    `    DR["BCDR - ${drLabel}"]`,
    "    Users --> Cloudflare",
    "    Cloudflare --> Web",
    "    Web --> Api",
    "    Api --> Pg",
    "    Api --> Blob",
    "    Api --> KeyVault",
    "    Api -.-> Monitor",
    "    Web -.-> Monitor",
    "    Web -.-> Region",
    "    Api -.-> Posture",
    "    Api -.-> DR",
  ].join("\n");
}

/**
 * Build a markdown networking table for per-environment CIDR and subnets.
 */
function buildNetworkingTable(data: {
  environmentCidrs?: Record<string, string>;
  networkCidr?: string;
  environments: string[];
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);

  const rows: string[] = [];
  rows.push("| Environment | CIDR | VNet Name | Workload Subnet | Purpose |");
  rows.push("|-------------|------|-----------|-----------------|---------|");

  for (const env of data.environments) {
    const envLower = env.toLowerCase();
    const cidr = data.environmentCidrs?.[env] ?? data.networkCidr ?? "10.0.0.0/16";
    const vnetName = `${org}-cc-${lob}-${app}-${envLower}-vnet`;
    const subnetName = `${org}-cc-${lob}-${app}-${envLower}-snet`;
    rows.push(`| ${env} | ${cidr} | ${vnetName} | ${subnetName} | ${env} workloads |`);
  }

  return rows.join("\n");
}

/**
 * Build default NSG inbound/outbound rule tables for TDD output.
 */
function buildNsgRulesTables(data: {
  networkPosture: string;
  environments: string[];
}): string {
  const isInternet = data.networkPosture === "Internet-Facing" || data.networkPosture === "Hybrid";

  const inbound = [
    "| Priority | Name | Source | Source Port | Destination | Service/Port | Action | Description |",
    "|----------|------|--------|-------------|-------------|--------------|--------|-------------|",
    `| 100 | Allow-HTTPS-Inbound | ${isInternet ? "Internet" : "VirtualNetwork"} | * | VirtualNetwork | 443/TCP | Allow | Allow HTTPS inbound |`,
    "| 110 | Allow-AppGateway-Health | GatewayManager | * | * | 65200-65535/TCP | Allow | App Gateway health probe |",
    "| 200 | Allow-VNet-Inbound | VirtualNetwork | * | VirtualNetwork | * | Allow | Internal VNet traffic |",
    "| 300 | Allow-AzureLoadBalancer | AzureLoadBalancer | * | * | * | Allow | Azure Load Balancer probes |",
    "| 4096 | Deny-All-Inbound | * | * | * | * | Deny | Deny all other inbound |",
  ].join("\n");

  const outbound = [
    "| Priority | Name | Source | Source Port | Destination | Service/Port | Action | Description |",
    "|----------|------|--------|-------------|-------------|--------------|--------|-------------|",
    "| 100 | Allow-HTTPS-Outbound | VirtualNetwork | * | Internet | 443/TCP | Allow | Allow HTTPS to internet |",
    "| 110 | Allow-SQL-Outbound | VirtualNetwork | * | VirtualNetwork | 1433/TCP | Allow | SQL/PostgreSQL access |",
    "| 120 | Allow-Storage-Outbound | VirtualNetwork | * | Storage | 443/TCP | Allow | Azure Storage access |",
    "| 130 | Allow-KeyVault-Outbound | VirtualNetwork | * | AzureKeyVault | 443/TCP | Allow | Key Vault access |",
    "| 140 | Allow-Monitor-Outbound | VirtualNetwork | * | AzureMonitor | 443/TCP | Allow | Azure Monitor and Log Analytics |",
    "| 4096 | Deny-All-Outbound | * | * | * | * | Deny | Deny all other outbound |",
  ].join("\n");

  return `**Inbound NSG Rules (per workload subnet):**\n\n${inbound}\n\n**Outbound NSG Rules (per workload subnet):**\n\n${outbound}`;
}

/**
 * Build an Azure services design components table for TDD Section 7.
 */
function buildAzureServicesTable(data: {
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
  environments: string[];
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  networkPosture: string;
  workloadTier?: string;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);
  const envList = data.environments.map((e) => e.toLowerCase()).join(", ");
  const isProd = data.environments.includes("Prod");
  const tier0or1 = data.workloadTier === "Tier 0" || data.workloadTier === "Tier 1";

  const rows = [
    "| Azure Service | Function | Resource Group | Design Parameters |",
    "|---------------|----------|----------------|-------------------|",
    `| Azure App Service | Host ${data.frontendStack ?? "web"} frontend | \`${org}-cc-${lob}-${app}-{env}-rg\` | Envs: ${envList}; SKU: B2 Dev/QA, P2v3 Prod |`,
    `| Azure App Service | Host ${data.backendStack ?? "API"} backend | \`${org}-cc-${lob}-${app}-{env}-rg\` | VNet Integration; Managed Identity |`,
    `| ${data.databaseStack ? data.databaseStack : "Azure Database for PostgreSQL"} | Relational data store | \`${org}-cc-${lob}-${app}-db-{env}-rg\` | ${isProd ? "Geo-redundant; " : ""}Private Endpoint; TLS 1.2+ |`,
    `| Azure Blob Storage | Unstructured storage / artifacts | \`${org}-cc-${lob}-${app}-{env}-rg\` | LRS Dev/QA; ${isProd ? "GRS Prod" : "ZRS Prod"}; Lifecycle policies |`,
    `| Azure Key Vault | Secrets, certificates, keys | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | Soft delete; Managed Identity access only |`,
    `| Azure Log Analytics Workspace | Centralised logging | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | ${isProd ? "90-day" : "30-day"} retention |`,
    `| Azure Application Insights | APM / distributed tracing | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | Connected to Log Analytics |`,
    `| Microsoft Defender for Cloud | Cloud security posture | Subscription | ${tier0or1 ? "Standard tier all services" : "Standard tier for critical services"} |`,
    `| Microsoft Entra ID | Identity and RBAC | Tenant | Managed Identities; PIM for admin access |`,
    `| Azure Virtual Network | Network isolation | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | Hub-spoke; NSGs per subnet; Private Endpoints |`,
  ];

  return rows.join("\n");
}

/**
 * Build an environment summary table for quick reference by deployment teams.
 */
function buildEnvironmentSummaryTable(data: {
  environments: string[];
  azureRegions: string[];
  environmentCidrs?: Record<string, string>;
  networkCidr?: string;
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  businessOwner: string;
  itOwner: string;
  technologyOwnerEmail: string;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);
  const primaryRegion = data.azureRegions.includes("canadacentral")
    ? "Canada Central"
    : "Canada East";

  const owningTeam    = data.businessOwner       || "N/A";
  const techContact   = data.itOwner             || "N/A";
  const techEmail     = data.technologyOwnerEmail || "";

  const rows: string[] = [];
  rows.push(
    "| Environment | Region | Subscription | Resource Group (Foundation) | VNet CIDR | Owning Team | Technical Contact |",
  );
  rows.push(
    "|-------------|--------|-------------|----------------------------|-----------|-------------|------------------|",
  );

  for (const env of data.environments) {
    const envLower = env.toLowerCase();
    const cidr = data.environmentCidrs?.[env] ?? data.networkCidr ?? "TBD";
    const sub = `${org}-${lob}-${app}-${envLower}-sub`;
    const rg = `${org}-cc-${lob}-${app}-foundation-${envLower}-rg`;
    const contactCell = techEmail ? `${techContact} (${techEmail})` : techContact;
    rows.push(
      `| ${env} | ${primaryRegion} | \`${sub}\` | \`${rg}\` | ${cidr} | ${owningTeam} | ${contactCell} |`,
    );
  }

  return rows.join("\n");
}

/**
 * Build a naming standards table with computed resource names per environment.
 */
function buildNamingStandardsTable(data: {
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  environments: string[];
}): string {
  const { org, lobShort: lob, app } = buildNamingParts({
    organization: data.organization,
    lineOfBusiness: data.lineOfBusiness,
    applicationName: data.applicationName,
  });
  const orgAlpha = org.replaceAll("-", "");
  const lobAlpha = lob.replaceAll("-", "");
  const appAlpha = app.replaceAll("-", "");

  type ResourceDef = { type: string; compute: (envLower: string) => string };
  const resourceDefs: ResourceDef[] = [
    { type: "Subscription", compute: (e) => `${org}-${lob}-${app}-${e}-sub` },
    { type: "Foundation Resource Group", compute: (e) => `${org}-cc-${lob}-${app}-foundation-${e}-rg` },
    { type: "Workload Resource Group", compute: (e) => `${org}-cc-${lob}-${app}-db-${e}-rg` },
    { type: "VNet", compute: (e) => `${org}-cc-${lob}-${app}-${e}-vnet` },
    { type: "Subnet (workload)", compute: (e) => `${org}-cc-${lob}-${app}-workload-${e}-snet` },
    { type: "Subnet (database)", compute: (e) => `${org}-cc-${lob}-${app}-db-${e}-snet` },
    { type: "Subnet (private endpoints)", compute: (e) => `${org}-cc-${lob}-${app}-pe-${e}-snet` },
    { type: "NSG (workload subnet)", compute: (e) => `${org}-cc-${lob}-${app}-workload-${e}-nsg` },
    { type: "App Service Plan", compute: (e) => `${org}-cc-${lob}-${app}-${e}-asp` },
    { type: "App Service (Web)", compute: (e) => `${org}-cc-${lob}-${app}-web-${e}-app` },
    { type: "App Service (API)", compute: (e) => `${org}-cc-${lob}-${app}-api-${e}-app` },
    { type: "Database Server", compute: (e) => `${org}-cc-${lob}-${app}-db-${e}-server` },
    { type: "Key Vault", compute: (e) => `${org}-cc-${lob}-${app}-${e}-kv` },
    // Storage Account names: no hyphens, lowercase, max 24 chars (Azure limit).
    // If the concatenated name exceeds 24 chars it is truncated — verify global uniqueness manually.
    { type: "Storage Account (verify uniqueness)", compute: (e) => `${(orgAlpha + lobAlpha + appAlpha + e + "st").slice(0, 24)}` },
    { type: "Log Analytics Workspace", compute: (e) => `${org}-cc-${lob}-${app}-${e}-law` },
    { type: "Application Insights", compute: (e) => `${org}-cc-${lob}-${app}-${e}-appi` },
    { type: "User-assigned Managed Identity", compute: (e) => `${org}-cc-${lob}-${app}-${e}-mi` },
    { type: "Private Endpoint (DB)", compute: (e) => `${org}-cc-${lob}-${app}-db-${e}-pe` },
    { type: "Private Endpoint (KV)", compute: (e) => `${org}-cc-${lob}-${app}-kv-${e}-pe` },
    { type: "Private Endpoint (Storage)", compute: (e) => `${org}-cc-${lob}-${app}-blob-${e}-pe` },
  ];

  const envHeaders = data.environments.join(" | ");
  const rows: string[] = [];
  rows.push(`| Resource Type | ${envHeaders} |`);
  rows.push(`|---------------|${data.environments.map(() => "------").join("|")}|`);

  for (const def of resourceDefs) {
    const envValues = data.environments.map((env) => `\`${def.compute(env.toLowerCase())}\``);
    rows.push(`| ${def.type} | ${envValues.join(" | ")} |`);
  }

  return rows.join("\n");
}

/**
 * Build a detailed Azure services configuration matrix (deployment-ready).
 */
function buildAzureServicesConfigMatrix(data: {
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
  environments: string[];
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  networkPosture: string;
  workloadTier?: string;
  haEnabled?: boolean;
  drEnabled?: boolean;
  azureRegions: string[];
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);
  const isProd = data.environments.includes("Prod");
  const isTier01 = data.workloadTier === "Tier 0" || data.workloadTier === "Tier 1";
  const primaryRegion = data.azureRegions.includes("canadacentral") ? "Canada Central" : "Canada East";
  const haStr = data.haEnabled ? "Zone-redundant (3 AZs)" : "Single-zone";
  const drStr = data.drEnabled ? "Geo-replication → Canada East" : "N/A";
  const dbBackup = isProd ? "Automated 35-day; GRS" : "Automated 7-day; LRS";

  const rows = [
    "| Azure Service | Function/Purpose | SKU/Plan | Region | Resource Group | High Availability | Backup/DR | Monitoring | Notes |",
    "|---------------|-----------------|----------|--------|----------------|------------------|-----------|-----------|-------|",
    `| Azure App Service (Web) | Host ${data.frontendStack ?? "web frontend"} | B2 (Dev/QA), P2v3 (Prod) | ${primaryRegion} | \`${org}-cc-${lob}-${app}-{env}-rg\` | ${haStr} | ${drStr} | App Insights + LAW | VNet Integration enabled |`,
    `| Azure App Service (API) | Host ${data.backendStack ?? "API backend"} | B2 (Dev/QA), P2v3 (Prod) | ${primaryRegion} | \`${org}-cc-${lob}-${app}-{env}-rg\` | ${haStr} | ${drStr} | App Insights + LAW | Managed Identity; VNet Integration |`,
    `| ${data.databaseStack ?? "Azure Database for PostgreSQL"} | Relational data store | Burstable B2s (Dev/QA), General Purpose D4s v3 (Prod) | ${primaryRegion} | \`${org}-cc-${lob}-${app}-db-{env}-rg\` | ${isProd ? "Zone-redundant standby" : "Single-zone"} | ${dbBackup} | Diagnostic logs → LAW | Private Endpoint; TLS 1.2+; CMK Prod |`,
    `| Azure Blob Storage | Unstructured storage / artifacts | Standard LRS (Dev/QA), Standard GRS (Prod) | ${primaryRegion} | \`${org}-cc-${lob}-${app}-{env}-rg\` | ${isProd ? "ZRS (Prod)" : "LRS"} | ${isProd ? "Soft delete 30 days; geo-redundant" : "Soft delete 7 days"} | Storage metrics → LAW | Lifecycle policies; Private Endpoint |`,
    `| Azure Key Vault | Secrets, certs, keys | Standard (Dev/QA), Premium (Prod) | ${primaryRegion} | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | ${haStr} | Soft delete 90 days; Purge protection ON | Audit logs → LAW | MI-access only; no direct key access |`,
    `| Azure Log Analytics Workspace | Centralised logging & monitoring | PerGB2018 | ${primaryRegion} | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | N/A (managed PaaS) | ${isProd ? "90-day retention" : "30-day retention"} | Self-monitored | All platform diagnostic logs ingested here |`,
    `| Azure Application Insights | APM / distributed tracing | Workspace-based | ${primaryRegion} | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | N/A (managed PaaS) | 90-day query retention | Alerts via LAW | Connected to LAW; custom metrics enabled |`,
    `| Azure Virtual Network | Network isolation per environment | N/A | ${primaryRegion} | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | ${haStr} | N/A | NSG Flow Logs → LAW | Hub-spoke topology; NSGs on all subnets |`,
    `| Microsoft Defender for Cloud | Cloud security posture management (CSPM) | ${isTier01 ? "Defender for Servers P2 + all PaaS plans" : "Defender for Cloud free + selected plans"} | ${primaryRegion} | Subscription | N/A | N/A | Security alerts → LAW / Sentinel | Enabled for Prod as minimum |`,
    `| Microsoft Entra ID | Identity, SSO, RBAC | P1 (Dev/QA), P2 (Prod) | Global | Tenant | N/A | N/A | Sign-in + audit logs → LAW | PIM for admin; MIs for all services |`,
    `| Azure Private DNS Zones | Private name resolution for PaaS endpoints | N/A | ${primaryRegion} | \`${org}-cc-${lob}-${app}-foundation-{env}-rg\` | Zone-hosted (resilient) | N/A | N/A | One zone per Private Endpoint service type |`,
  ];

  return rows.join("\n");
}

/**
 * Build an enhanced networking plan table with subnet delegation and reserved IP notes.
 */
function buildEnhancedNetworkingTable(data: {
  environmentCidrs?: Record<string, string>;
  networkCidr?: string;
  environments: string[];
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  databaseStack?: string;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);

  // Determine DB subnet delegation based on the configured database type
  const dbStack = (data.databaseStack ?? "").toLowerCase();
  const dbDelegation = dbStack.includes("mysql")
    ? "Microsoft.DBforMySQL/flexibleServers"
    : dbStack.includes("sql") && !dbStack.includes("cosmos") && !dbStack.includes("postgres")
      ? "Microsoft.Sql/managedInstances"
      : "Microsoft.DBforPostgreSQL/flexibleServers"; // default / PostgreSQL

  const rows: string[] = [];
  rows.push(
    "| Environment | VNet CIDR | Subnet Name | Subnet CIDR | Purpose | Delegation | Notes |",
  );
  rows.push(
    "|-------------|-----------|-------------|-------------|---------|------------|-------|",
  );

  for (const env of data.environments) {
    const envLower = env.toLowerCase();
    const vnetCidr = data.environmentCidrs?.[env] ?? data.networkCidr ?? "TBD";
    const vnetName = `${org}-cc-${lob}-${app}-${envLower}-vnet`;
    const subnets = [
      {
        name: `${org}-cc-${lob}-${app}-workload-${envLower}-snet`,
        cidr: "TBD (/24 recommended)",
        purpose: `${env} app tier (App Service VNet Integration)`,
        delegation: "Microsoft.Web/serverFarms",
        notes: "Azure reserves 5 IPs (.0-.3, .255)",
      },
      {
        name: `${org}-cc-${lob}-${app}-db-${envLower}-snet`,
        cidr: "TBD (/27 minimum)",
        purpose: `${env} database tier`,
        delegation: dbDelegation,
        notes: "Delegation required for Flexible Server managed deployment",
      },
      {
        name: `${org}-cc-${lob}-${app}-pe-${envLower}-snet`,
        cidr: "TBD (/27 minimum)",
        purpose: `Private Endpoints for ${env} PaaS (KV, Storage, DB)`,
        delegation: "None (PE requires policies disabled)",
        notes: "Set privateLinkServiceNetworkPolicies=Disabled",
      },
    ];

    for (const [i, subnet] of subnets.entries()) {
      if (i === 0) {
        rows.push(
          `| **${env}** (VNet: \`${vnetName}\`) | ${vnetCidr} | \`${subnet.name}\` | ${subnet.cidr} | ${subnet.purpose} | ${subnet.delegation} | ${subnet.notes} |`,
        );
      } else {
        rows.push(
          `| | | \`${subnet.name}\` | ${subnet.cidr} | ${subnet.purpose} | ${subnet.delegation} | ${subnet.notes} |`,
        );
      }
    }
  }

  return rows.join("\n");
}

/**
 * Build a security & access configuration section for section 7.3 (deployment-ready).
 */
function buildSecurityAccessTables(data: {
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  environments: string[];
  networkPosture: string;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);

  const miRows = data.environments.map((env) => {
    const envLower = env.toLowerCase();
    return `| \`${org}-cc-${lob}-${app}-${envLower}-mi\` | User-assigned MI | App Service (Web + API) | Key Vault Secrets User, Storage Blob Data Contributor, Log Analytics Contributor | Scoped to \`${org}-cc-${lob}-${app}-{env}-rg\` |`;
  });
  const miTable = [
    "**Managed Identities:**",
    "",
    "| Identity Name | Type | Assigned To | Required RBAC Roles | Scope |",
    "|--------------|------|------------|---------------------|-------|",
    ...miRows,
    `| \`${org}-cc-${lob}-${app}-deploy-sp\` | Service Principal | CI/CD Pipeline | Contributor (app RGs), Key Vault Certificates Officer | Scoped to app Resource Groups |`,
  ].join("\n");

  const kvTable = [
    "",
    "**Key Vault Secrets & Certificates (must be populated before first deployment):**",
    "",
    "| Secret / Cert Name | Purpose | Environment | Owner | Status |",
    "|-------------------|---------|-------------|-------|--------|",
    `| \`${app}-db-connection-string\` | Database connection string | All | App Team | **REQUIRED** |`,
    `| \`${app}-api-key\` | Internal API authentication key | All | App Team | **REQUIRED** |`,
    `| \`${app}-storage-connection-string\` | Azure Blob Storage connection | All | App Team | **REQUIRED** |`,
    `| \`${app}-ssl-cert\` | TLS certificate for custom domain | Prod | Infra Team | **REQUIRED (Prod)** |`,
    `| \`${app}-entra-client-secret\` | Entra ID app registration client secret | All | Infra Team | **REQUIRED** |`,
  ].join("\n");

  const peRows = data.environments.flatMap((env) => {
    const envLower = env.toLowerCase();
    const vnet = `${org}-cc-${lob}-${app}-${envLower}-vnet`;
    const subnet = `${org}-cc-${lob}-${app}-pe-${envLower}-snet`;
    return [
      `| Azure Database for PostgreSQL | \`${org}-cc-${lob}-${app}-db-${envLower}-pe\` | \`privatelink.postgres.database.azure.com\` | \`${vnet}\` | \`${subnet}\` | **REQUIRED** |`,
      `| Azure Key Vault | \`${org}-cc-${lob}-${app}-kv-${envLower}-pe\` | \`privatelink.vaultcore.azure.net\` | \`${vnet}\` | \`${subnet}\` | **REQUIRED** |`,
      `| Azure Blob Storage | \`${org}-cc-${lob}-${app}-blob-${envLower}-pe\` | \`privatelink.blob.core.windows.net\` | \`${vnet}\` | \`${subnet}\` | **REQUIRED** |`,
    ];
  });
  const peTable = [
    "",
    "**Private Endpoints & DNS Zones (required for all PaaS services in all environments):**",
    "",
    "| Service | Private Endpoint Name | Private DNS Zone | VNet | Subnet | Status |",
    "|---------|----------------------|-----------------|------|--------|--------|",
    ...peRows,
  ].join("\n");

  return `${miTable}\n${kvTable}\n${peTable}`;
}

/**
 * Build monitoring & operations tables for section 7.7 (deployment-ready).
 */
function buildMonitoringOperationsTable(data: {
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  environments: string[];
  monitoringEnvironments?: string[];
  availabilityTarget?: string;
  rto?: string;
  rpo?: string;
  workloadTier?: string;
  drEnabled?: boolean;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);
  const monitoringEnvs = data.monitoringEnvironments ?? ["Prod"];
  const isProd = data.environments.includes("Prod");

  const diagTable = [
    "**Log Analytics — Diagnostic Settings (configure on ALL resources in ALL environments):**",
    "",
    "| Azure Resource | Diagnostic Setting Name | Log Categories | Metrics | Destination | Retention |",
    "|---------------|------------------------|----------------|---------|-------------|-----------|",
    `| App Service (Web + API) | \`${app}-appservice-diag\` | AppServiceConsoleLogs, AppServiceHTTPLogs, AppServiceAppLogs | AllMetrics | \`${org}-cc-${lob}-${app}-{env}-law\` | 30d (Dev/QA), 90d (Prod) |`,
    `| Azure Database for PostgreSQL | \`${app}-pgdb-diag\` | PostgreSQLLogs, QueryStoreRuntimeStatistics | AllMetrics | \`${org}-cc-${lob}-${app}-{env}-law\` | 30d (Dev/QA), 90d (Prod) |`,
    `| Azure Key Vault | \`${app}-kv-diag\` | AuditEvent, AzurePolicyEvaluationDetails | AllMetrics | \`${org}-cc-${lob}-${app}-{env}-law\` | 90d (all envs — audit requirement) |`,
    `| Azure Blob Storage | \`${app}-storage-diag\` | StorageRead, StorageWrite, StorageDelete | Transaction | \`${org}-cc-${lob}-${app}-{env}-law\` | 30d (Dev/QA), 90d (Prod) |`,
    `| Virtual Network / NSG | \`${app}-nsg-flowlogs\` | NetworkSecurityGroupEvent, RuleCounter | N/A | \`${org}-cc-${lob}-${app}-{env}-law\` | 30d (Dev/QA), 90d (Prod) |`,
  ].join("\n");

  const alertTable = [
    "",
    "**Alert Rules (Action Group: TBD — configure before go-live):**",
    "",
    "| Alert Name | Signal | Condition | Severity | Action | Scope |",
    "|-----------|--------|-----------|---------|--------|-------|",
    `| AppService-HighCPU | CPU Percentage | > 80% for 5 min | Sev 2 | Email ops-team | Prod, QA |`,
    `| AppService-Http5xx | Http5xx | > 10 errors / 5 min | Sev 1 | Email + PagerDuty | Prod |`,
    `| AppService-Availability | Availability | < ${data.availabilityTarget ?? "99.9%"} | Sev 1 | Email + PagerDuty | Prod |`,
    `| DB-HighConnections | Active Connections | > 80% of max | Sev 2 | Email ops-team | Prod, QA |`,
    `| DB-StorageNearFull | Storage Percent | > 85% | Sev 2 | Email ops-team | Prod |`,
    `| KeyVault-AccessDenied | AuditEvent — Access Denied | Any occurrence | Sev 2 | Email security-team | All |`,
    `| Budget-Alert-80pct | Monthly Cost | > 80% of budget | Sev 3 | Email finops-team | All |`,
  ].join("\n");

  const backupTable = [
    "",
    "**Backup Policy & BCDR Parameters:**",
    "",
    "| Service | Backup Method | Frequency | Retention (Dev/QA) | Retention (Prod) | RPO | RTO | DR Strategy |",
    "|---------|--------------|-----------|-------------------|-----------------|-----|-----|-------------|",
    `| App Service | Redeploy from pipeline | On-demand | N/A | N/A | ${data.rpo ?? "1 hour"} | ${data.rto ?? "4 hours"} | Redeploy from source control |`,
    `| Azure Database for PostgreSQL | Automated backups + WAL | Daily full + continuous | 7 days | 35 days | 15 min (PITR) | ${data.rto ?? "4 hours"} | ${data.drEnabled ? "Geo-restore to Canada East" : "PITR within same region"} |`,
    `| Azure Blob Storage | Versioning + Soft delete | Continuous | 7 days soft delete | 30 days soft delete | Near-zero | ${data.rto ?? "4 hours"} | ${data.drEnabled ? "GRS replication to Canada East" : isProd ? "ZRS (Prod)" : "LRS"} |`,
    `| Azure Key Vault | Soft delete + Purge protection | Continuous | N/A (90d soft delete) | N/A (90d soft delete) | Near-zero | < 1 hour | Restore from backup; keys non-exportable |`,
    `| Availability Target | — | — | — | ${data.availabilityTarget ?? "99.9%"} | — | — | ${data.drEnabled ? "Active-Passive: Canada Central → Canada East" : "Single-region; no active DR"} |`,
  ].join("\n");

  return `${diagTable}\n${alertTable}\n${backupTable}`;
}

/**
 * Build a deployment inputs table for IaC / pipeline use (section 8).
 */
function buildIacDeploymentInputsTable(data: {
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  environments: string[];
  azureRegions: string[];
  environmentCidrs?: Record<string, string>;
  networkCidr?: string;
  workloadTier?: string;
  haEnabled?: boolean;
  drEnabled?: boolean;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);
  const primaryRegion = data.azureRegions.includes("canadacentral")
    ? "canadacentral"
    : "canadaeast";

  const params: Array<{
    name: string;
    required: string;
    source: string;
    compute: (env: string) => string;
    notes: string;
  }> = [
    {
      name: "SUBSCRIPTION_ID",
      required: "YES",
      source: "Azure Portal",
      compute: () => "TBD — one per environment",
      notes: "Grant deploy SP Contributor on each sub",
    },
    {
      name: "RESOURCE_GROUP_FOUNDATION",
      required: "YES",
      source: "Naming standard (computed)",
      compute: (env) => `${org}-cc-${lob}-${app}-foundation-${env.toLowerCase()}-rg`,
      notes: "Created in IaC module 1",
    },
    {
      name: "RESOURCE_GROUP_WORKLOAD",
      required: "YES",
      source: "Naming standard (computed)",
      compute: (env) => `${org}-cc-${lob}-${app}-db-${env.toLowerCase()}-rg`,
      notes: "Created in IaC module 1",
    },
    {
      name: "VNET_CIDR",
      required: "YES",
      source: "Network team — no hub overlap",
      compute: (env) => data.environmentCidrs?.[env] ?? data.networkCidr ?? "REQUIRED",
      notes: "Confirm with network team before deployment",
    },
    {
      name: "VNET_NAME",
      required: "YES",
      source: "Naming standard (computed)",
      compute: (env) => `${org}-cc-${lob}-${app}-${env.toLowerCase()}-vnet`,
      notes: "Peer to hub VNet after creation",
    },
    {
      name: "AZURE_REGION",
      required: "YES",
      source: "Fixed — Canadian data residency",
      compute: () => primaryRegion,
      notes: "All environments in same primary region",
    },
    {
      name: "APP_SERVICE_SKU",
      required: "YES",
      source: "Architecture decision",
      compute: (env) => env.toLowerCase() === "prod" ? "P2v3" : "B2",
      notes: "Right-size after load testing",
    },
    {
      name: "DB_SKU",
      required: "YES",
      source: "Architecture decision",
      compute: (env) => env.toLowerCase() === "prod" ? "General_Purpose_D4s_v3" : "Burstable_B2s",
      notes: "Review after performance baseline",
    },
    {
      name: "DB_STORAGE_GB",
      required: "YES",
      source: "App team estimate",
      compute: (env) => env.toLowerCase() === "prod" ? "128" : "32",
      notes: "Auto-grow enabled; increase if > 80% used",
    },
    {
      name: "HA_ENABLED",
      required: "YES",
      source: "Architecture decision",
      compute: () => data.haEnabled ? "true" : "false",
      notes: "Zone-redundant deployment for Prod when true",
    },
    {
      name: "DR_ENABLED",
      required: "YES",
      source: "Architecture decision",
      compute: () => data.drEnabled ? "true" : "false",
      notes: "Enables geo-replication to Canada East",
    },
    {
      name: "LOG_RETENTION_DAYS",
      required: "YES",
      source: "Policy / compliance requirement",
      compute: (env) => env.toLowerCase() === "prod" ? "90" : "30",
      notes: "Aligned with audit requirements",
    },
    {
      name: "KEY_VAULT_NAME",
      required: "YES",
      source: "Naming standard (computed)",
      compute: (env) => `${org}-cc-${lob}-${app}-${env.toLowerCase()}-kv`,
      notes: "Must be globally unique within Azure",
    },
    {
      name: "MANAGED_IDENTITY_NAME",
      required: "YES",
      source: "Naming standard (computed)",
      compute: (env) => `${org}-cc-${lob}-${app}-${env.toLowerCase()}-mi`,
      notes: "Assign RBAC roles immediately after creation",
    },
    {
      name: "WORKLOAD_TIER",
      required: "NO",
      source: "Fixed",
      compute: () => data.workloadTier ?? "Tier 2",
      notes: "Drives Defender for Cloud tier selection",
    },
  ];

  const envHeaders = data.environments.join(" | ");
  const rows: string[] = [];
  rows.push(`| Parameter / Variable | Required? | Source | ${envHeaders} | Notes |`);
  rows.push(`|---------------------|-----------|--------|${data.environments.map(() => "------").join("|")}|-------|`);

  for (const param of params) {
    const envValues = data.environments.map((env) => param.compute(env));
    rows.push(
      `| \`${param.name}\` | ${param.required} | ${param.source} | ${envValues.join(" | ")} | ${param.notes} |`,
    );
  }

  return rows.join("\n");
}

function upsertArchitectureDiagram(
  markdown: string,
  diagramCode: string,
  uploadedImageBase64?: string,
): string {
  const diagramBlock = uploadedImageBase64
    ? `![Architecture Diagram](${uploadedImageBase64})\n\n> *Diagram uploaded by the architect — see the overview description in section 6.1.*`
    : `\`\`\`mermaid\n${diagramCode}\n\`\`\``;

  // 1. Preferred: replace the explicit placeholder injected by the user prompt template
  if (markdown.includes("[ARCHITECTURE_DIAGRAM_PLACEHOLDER]")) {
    return markdown.replace("[ARCHITECTURE_DIAGRAM_PLACEHOLDER]", diagramBlock);
  }

  // 2. Replace any existing mermaid block the model produced (despite instructions)
  const existingMermaidRegex = /```mermaid[\s\S]*?```/i;
  if (existingMermaidRegex.test(markdown)) {
    return markdown.replace(existingMermaidRegex, diagramBlock);
  }

  // 3. Insert after the 6.2 subsection heading (flexible whitespace matching)
  const diagramHeadingRegex =
    /(#{2,4}\s+6\.2\s+Architecture Diagram[^\n]*\n)/i;
  if (diagramHeadingRegex.test(markdown)) {
    return markdown.replace(
      diagramHeadingRegex,
      (_match, headingLine: string) => `${headingLine}\n${diagramBlock}\n\n`,
    );
  }

  // 4. Insert after the section 6 heading
  const sectionHeadingRegex = /(##\s+6\.\s+Proposed Target State Architecture[^\n]*\n)/i;
  if (sectionHeadingRegex.test(markdown)) {
    return markdown.replace(
      sectionHeadingRegex,
      (_match, headingLine: string) =>
        `${headingLine}\n### 6.2 Architecture Diagram (High Level)\n\n${diagramBlock}\n\n`,
    );
  }

  // 5. Fallback: append at end
  return `${markdown}\n\n## 6. Proposed Target State Architecture (To-Be)\n\n### 6.2 Architecture Diagram (High Level)\n\n${diagramBlock}\n`;
}

function isLowValueSectionBody(sectionBody: string): boolean {
  const normalized = sectionBody.toLowerCase();
  if (normalized.trim().length < 100) {
    return true;
  }
  // Catch content that is present but far too thin to be useful prose
  const wordCount = normalized.trim().split(/\s+/).length;
  if (wordCount < 40) {
    return true;
  }

  // Hard triggers — always indicate AI truncation or meta-commentary, regardless of word count.
  // These are phrases that should NEVER appear in legitimate section content.
  const hardTriggerPhrases = [
    // Un-replaced bracket-prefixed instruction placeholders left verbatim by the model
    "[write 400",
    "[write 300",
    "[using the application description",
    "[cover all six points",
    "[application overview:",
    // AI truncation / meta-commentary
    "content pending refinement",
    "continue generating sections",
    "following the provided template",
    "following the same template",
    "sections 5 through",
    "sections 6 through",
    "sections 7 through",
    "azure-specific recommendations and work",
    "please respond to request additional sections",
    "after deep review/feedback",
    "feel free to ask for additional",
    "let me know if you want",
    "provide additional sections",
    "request additional sections",
    "remaining sections",
    "all subsections formatted and output",
    "without skipping",
    "sections formatted and output",
    "7.1 through 8.2",
    "7.1 through 8",
    "output all subsections",
    "output sections 7.1",
    "do not summarize or skip any subsection",
    "every subsection must contain complete",
    "token context limit",
    "exceeds the token",
    "omitted sections",
    "would continue markdown",
    "would continue with",
    "follows the same detailed pattern",
    "follows same detailed pattern",
    "complete document generation exceeds",
    "would continue as above",
    "prose as above",
    "remaining sections continue as outlined",
    "tokens are constrained",
    "this response truncates at",
    "truncates at 7.",
    "complete all sections in markdown for prod",
    "constrained in this snippet",
    "follow the exact template format above",
    "subsections 7.1 - 7.10 fully drafted",
    "subsections 7.1–7.10 fully drafted",
    "prose and tables written per app case",
    "fully drafted",
    "per app case",
    "all sections describe infra",
    "sections 5-8 follow",
    "sections 5–8 follow",
  ];

  if (hardTriggerPhrases.some((phrase) => normalized.includes(phrase))) {
    return true;
  }

  // Soft triggers — cross-reference phrases that are legitimate in full-length sections
  // but indicate lazy/stub output when the section is sparse (< 150 words).
  if (wordCount < 150) {
    const softTriggerPhrases = [
      "see full detailed components",
      "refer earlier",
      "refer to earlier",
      "refer to previous",
      "refer to the earlier",
      "as described above",
      "as described earlier",
      "as outlined previously",
      "see above",
      "as per above",
      "please refer",
      "see earlier sections",
      "see section",
      "covered above",
      "as specified above",
      "details are provided above",
      "refer back to",
      "due to space",
    ];
    if (softTriggerPhrases.some((phrase) => normalized.includes(phrase))) {
      return true;
    }
  }

  return false;
}

interface PrebuiltTables {
  platformComponents: string;
  nsgRules: string;
  networking: string;
  securityAccess: string;
  computeSizing: string;
  databaseSizing: string;
  monitoringOps: string;
  costBreakdown: string;
  namingStandards: string;
  iacInputs: string;
  workloadClassification: string;
  /** Full server-built fallback for section 4 — used when model output is thin */
  section4Fallback: string;
  /** Full server-built fallback for section 5 — used when model output is thin */
  section5Fallback: string;
  /** Application-specific fallback for section 6 — used when model output is thin */
  section6Fallback: string;
}

function injectPrebuiltTables(markdown: string, tables: PrebuiltTables): string {
  // Use a function replacer so that any `$` characters in table content are
  // treated as literals and not as regex back-reference patterns.
  let result = markdown;
  result = result.replaceAll(PLATFORM_COMPONENTS_PLACEHOLDER, () => tables.platformComponents);
  result = result.replaceAll(NSG_RULES_PLACEHOLDER, () => tables.nsgRules);
  result = result.replaceAll(NETWORKING_TABLE_PLACEHOLDER, () => tables.networking);
  result = result.replaceAll(SECURITY_ACCESS_PLACEHOLDER, () => tables.securityAccess);
  result = result.replaceAll(COMPUTE_SIZING_PLACEHOLDER, () => tables.computeSizing);
  result = result.replaceAll(DATABASE_SIZING_PLACEHOLDER, () => tables.databaseSizing);
  result = result.replaceAll(MONITORING_OPS_PLACEHOLDER, () => tables.monitoringOps);
  result = result.replaceAll(COST_BREAKDOWN_PLACEHOLDER, () => tables.costBreakdown);
  result = result.replaceAll(NAMING_STANDARDS_PLACEHOLDER, () => tables.namingStandards);
  result = result.replaceAll(IAC_INPUTS_PLACEHOLDER, () => tables.iacInputs);
  result = result.replaceAll(WORKLOAD_CLASSIFICATION_PLACEHOLDER, () => tables.workloadClassification);
  return result;
}

function applyOutputGuardrails(
  markdown: string,
  diagramInput: {
    applicationName: string;
    networkPosture: string;
    drEnabled?: boolean;
    azureRegions: string[];
  },
  prebuiltTables: PrebuiltTables,
  uploadedImageBase64?: string,
): { guarded: string; rebuiltSections: string[] } {
  let guarded = removeGenerationMetaArtifacts(markdown);
  guarded = repairBrokenCodeFences(guarded);
  guarded = removeUnfencedMermaidEngineErrors(guarded);
  guarded = enforceSharedEdgeSecurityConstraints(guarded);
  guarded = normalizeMermaidBlocks(guarded);

  // Normalise any placeholder tokens the model may have reformatted (e.g.
  // backtick code spans, escaped brackets, escaped underscores) so that the
  // subsequent replaceAll calls can find them reliably.
  guarded = normalizePlaceholders(guarded);

  // Inject all deterministic tables (replace placeholders; if placeholder was
  // removed/overwritten by the model, this is a no-op and the guardrail loop
  // below will catch any missing or low-value sections).
  guarded = injectPrebuiltTables(guarded, prebuiltTables);

  // Diagnostic: log any placeholders that were not replaced (helps debug model
  // output format variations — should be empty after normalizePlaceholders).
  const remainingPlaceholders = ALL_PLACEHOLDER_NAMES.filter((name) =>
    guarded.includes(`[${name}]`),
  );
  if (remainingPlaceholders.length > 0) {
    console.warn(
      "[guardrails] Placeholders NOT replaced after first injection pass:",
      remainingPlaceholders,
    );
  }

  const rebuiltSections: string[] = [];

  // Data-driven fallbacks that override the generic buildFallbackSectionContent()
  // for sections that are deterministic or require application-specific prose.
  const customFallbackMap: Partial<Record<string, string>> = {
    "4. Current State Architecture (As-Is)": prebuiltTables.section4Fallback,
    "5. Platform Components (Infrastructure View)": prebuiltTables.section5Fallback,
    "6. Proposed Target State Architecture (To-Be)": prebuiltTables.section6Fallback,
  };

  for (const heading of REQUIRED_TDD_HEADINGS) {
    const headingRegex = new RegExp(
      `^#{1,6}\\s+${escapeForRegex(heading)}\\s*$`,
      "mi",
    );
    const customFallback = customFallbackMap[heading];
    const fallbackBody = customFallback ?? buildFallbackSectionContent(heading);

    if (!headingRegex.test(guarded)) {
      guarded += `\n\n## ${heading}\n\n${fallbackBody}\n`;
      rebuiltSections.push(heading);
      continue;
    }

    const sectionRegex = new RegExp(
      `(^##\\s+${escapeForRegex(heading)}\\s*$)([\\s\\S]*?)(?=^##\\s+\\d+\\.|$)`,
      "mi",
    );
    const matched = guarded.match(sectionRegex);
    if (!matched) {
      continue;
    }
    const sectionBody = matched[2] ?? "";
    if (!isLowValueSectionBody(sectionBody)) {
      continue;
    }
    const replacementBody = `\n\n${fallbackBody}\n\n`;
    guarded = guarded.replace(
      sectionRegex,
      (_all, headingLine: string) => `${headingLine}${replacementBody}`,
    );
    rebuiltSections.push(heading);
  }

  // Second injection pass: ensures placeholders embedded in any guardrail-rebuilt
  // fallback sections are also replaced with deterministic table content.
  guarded = injectPrebuiltTables(guarded, prebuiltTables);

  guarded = upsertArchitectureDiagram(
    guarded,
    buildDeterministicArchitectureDiagram(diagramInput),
    uploadedImageBase64,
  );
  return { guarded: enforceSharedEdgeSecurityConstraints(guarded), rebuiltSections };
}

/**
 * Build a workload classification table for section 3.2 — from form data.
 */
function buildWorkloadClassificationTable(data: {
  workloadTier?: string;
  availabilityTarget?: string;
  rto?: string;
  rpo?: string;
  haEnabled?: boolean;
  drEnabled?: boolean;
  networkPosture: string;
}): string {
  const tier = data.workloadTier ?? "Tier 2";
  const sla = data.availabilityTarget ?? "99.9%";
  const rto = data.rto ?? "4 hours";
  const rpo = data.rpo ?? "1 hour";

  const criticality: Record<string, string> = {
    "Tier 0": "Mission Critical — loss causes immediate revenue impact or regulatory breach",
    "Tier 1": "Business Critical — loss severely impacts business operations",
    "Tier 2": "Business Important — loss causes significant productivity impact",
    "Tier 3": "Non-Critical — development, testing, or low-impact workloads",
  };
  const impactDesc = criticality[tier] ?? "Medium business impact";

  return [
    "| Attribute | Value |",
    "|-----------|-------|",
    `| Workload Tier | ${tier} |`,
    `| Business Criticality | ${impactDesc} |`,
    `| Data Classification | Confidential |`,
    `| Availability Target (SLA) | ${sla} |`,
    `| RTO (Recovery Time Objective) | ${rto} |`,
    `| RPO (Recovery Point Objective) | ${rpo} |`,
    `| High Availability | ${data.haEnabled ? "Yes — multi-zone deployment required" : "Not required — single-zone deployment"} |`,
    `| Disaster Recovery | ${data.drEnabled ? "Yes — active-passive DR to Canada East" : "Not configured"} |`,
    `| Network Posture | ${data.networkPosture} |`,
    `| Support Model | Business hours L2 support; on-call for Prod Sev 1 incidents |`,
  ].join("\n");
}

/**
 * Build current state section content for section 4 — Greenfield vs Migration.
 */
function buildCurrentStateContent(data: {
  applicationType: string;
  applicationFlow: string;
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
}): { hosting: string; architecture: string; existingInfra: string } {
  const MIGRATION_TYPES = ["Migration", "Cloud Migration", "Application Replacement", "Application Decommissioning"];
  const isGreenfield = !MIGRATION_TYPES.some(t => data.applicationType.toLowerCase() === t.toLowerCase()) && !data.applicationType.toLowerCase().includes("migration");

  if (isGreenfield) {
    return {
      hosting: `No prior hosting exists — this is a greenfield deployment on Microsoft Azure. There is no legacy infrastructure to migrate or decommission. The solution will be built from scratch using Azure PaaS services.`,
      architecture: `As a greenfield solution, there is no current cloud or on-premises infrastructure. The application will be designed and deployed natively on Azure from day one, following Azure Landing Zone principles and hub-spoke network topology.`,
      existingInfra: `None — this is a greenfield deployment. No existing infrastructure components are being retained or integrated. All services listed in Section 5.2 are net-new Azure resources.`,
    };
  }

  return {
    hosting: `The current workload is hosted on-premises or with an existing cloud provider. Migration to Azure involves decommissioning the existing environment post-cutover.`,
    architecture: `Current infrastructure details to be confirmed with the application team. Key components include: ${[data.frontendStack, data.backendStack, data.databaseStack].filter(Boolean).join(", ") || "web application stack with database backend"}.`,
    existingInfra: `Existing infrastructure components being reviewed for migration or decommission. Inventory to be completed with the application team prior to migration planning.`,
  };
}

/**
 * Build a complete server-side fallback for Section 4 (Current State Architecture As-Is).
 * Used when the model produces thin or absent content for this section.
 */
function buildSection4Fallback(data: {
  applicationType: string;
  applicationFlow?: string;
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
  infrastructureSupportManager?: string;
  applicationSupportManager?: string;
  itOwner?: string;
  businessOwner?: string;
  technologyOwnerEmail?: string;
  businessOwnerEmail?: string;
  organization: string;
}): string {
  const currentState = buildCurrentStateContent({
    applicationType: data.applicationType,
    applicationFlow: data.applicationFlow ?? "",
    frontendStack: data.frontendStack,
    backendStack: data.backendStack,
    databaseStack: data.databaseStack,
  });

  const frontend  = data.frontendStack  ?? "TBD";
  const backend   = data.backendStack   ?? "TBD";
  const database  = data.databaseStack  ?? "TBD";
  const flow      = data.applicationFlow ?? "Application flow details to be provided by the application team.";

  const lines = [
    "### 4.1 Current Hosting Model",
    "",
    currentState.hosting,
    "",
    "### 4.2 Current High-Level Architecture (Infra)",
    "",
    currentState.architecture,
    "",
    "### 4.3 Current High-Level Application Flow/Architecture",
    "",
    flow,
    "",
    "### 4.4 Assumptions for the Solution",
    "",
    "| Items | Descriptions |",
    "|-------|--------------|",
    `| Authentication & Authorization | Entra ID (Azure AD) based authentication and RBAC will be enforced. No legacy on-premises AD dependency unless expressly confirmed by the application team. |`,
    `| User Interface | UI stack is ${frontend}. Assumed SPA or server-rendered web app hosted on Azure App Service. CDN caching via Cloudflare where applicable. |`,
    `| Data Transformations | All data transformations occur in the backend (${backend}) layer. No ETL pipeline assumed unless explicitly scoped. |`,
    `| Raw Data Storage | Relational data stored in ${database}. Unstructured data (files, blobs) stored in Azure Blob Storage. No legacy data migration unless confirmed. |`,
    `| Business Logic & Notifications | Application business logic is encapsulated in the backend service (${backend}). Email/notification via Azure Communication Services or third-party SaaS (e.g., SendGrid) if required. |`,
    `| SaaS Integrations | Any third-party SaaS integrations are assumed to use OAuth2 / API key patterns. Connectivity via Private Endpoints or approved outbound firewall rules through the shared hub. |`,
    "",
    "### 4.5 Stakeholders",
    "",
    `#### ${data.organization} Stakeholders`,
    "",
    "| Name | Role | Email Address |",
    "|------|------|---------------|",
    `| ${data.infrastructureSupportManager ?? "TBD"} | Infrastructure Support Manager | |`,
    `| ${data.applicationSupportManager ?? "TBD"} | Application Support Manager | |`,
    `| ${data.itOwner ?? "TBD"} | IT Owner | ${data.technologyOwnerEmail ?? ""} |`,
    `| ${data.businessOwner ?? "TBD"} | Business Owner | ${data.businessOwnerEmail ?? ""} |`,
    "",
    "#### Partner/Vendor Stakeholders",
    "",
    "| Name | Role | Email Address |",
    "|------|------|---------------|",
    "| To be identified | TBD | TBD |",
  ];

  return lines.join("\n");
}

/**
 * Build a complete server-side fallback for Section 5 (Platform Components Infrastructure View).
 * Used when the model produces thin or absent content for this section.
 */
function buildSection5Fallback(data: {
  applicationType: string;
  applicationFlow?: string;
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
}): string {
  const currentState = buildCurrentStateContent({
    applicationType: data.applicationType,
    applicationFlow: data.applicationFlow ?? "",
    frontendStack: data.frontendStack,
    backendStack: data.backendStack,
    databaseStack: data.databaseStack,
  });

  return [
    "### 5.1 Existing/Current Infra Components",
    "",
    currentState.existingInfra,
    "",
    "### 5.2 New/Proposed Infra Components",
    "",
    "The following table lists all new Azure services provisioned for this solution. SKU/Plan and HA settings are environment-specific (shown in parentheses where they differ). Replace {env} with the environment short name (dev / qa / prod) in resource group names.",
    "",
    PLATFORM_COMPONENTS_PLACEHOLDER,
  ].join("\n");
}

/**
 * Build an application-specific fallback for Section 6 (Proposed Target State Architecture To-Be).
 * Incorporates actual application name, environments, stacks, and network posture so the fallback
 * is meaningfully richer than a generic template.
 */
function buildSection6Fallback(data: {
  applicationName: string;
  applicationOverview?: string;
  applicationFlow?: string;
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
  networkPosture: string;
  haEnabled?: boolean;
  drEnabled?: boolean;
  environmentsRequired: string[];
  azureRegions: string[];
}): string {
  const appName     = data.applicationName;
  const frontend    = data.frontendStack  ?? "web frontend";
  const backend     = data.backendStack   ?? "API backend";
  const database    = data.databaseStack  ?? "Azure Database for PostgreSQL Flexible Server";
  const envList     = data.environmentsRequired.join(", ");
  const primaryRegion = data.azureRegions.includes("canadacentral") ? "Canada Central" : "Canada East";
  const isInternet  = data.networkPosture === "Internet-Facing" || data.networkPosture === "Hybrid";
  const haStr       = data.haEnabled ? "multi-zone highly available" : "standard single-zone";
  const drStr       = data.drEnabled
    ? "Disaster recovery is configured in Canada East using an Active-Passive failover model with geo-redundant database backups and Storage GRS replication."
    : "Disaster recovery has not been scoped for this solution; the primary region (Canada Central) is used exclusively.";

  const inboundPath = isInternet
    ? "Internet → Cloudflare WAF (enterprise L7 protection and DNS under the mccain.com domain umbrella) → Azure App Service built-in load balancer (HTTPS only, TLS 1.2+). No Azure Application Gateway or per-workload WAF is deployed."
    : "No direct internet ingress — all access is via the McCain enterprise hub VNet through Bastion or VPN/ExpressRoute. Cloudflare WAF provides L7 protection at the edge for any approved external endpoints.";

  const integrationContext = data.applicationOverview
    ? `Based on the application overview for ${appName}, integration patterns follow standard Azure PaaS connectivity — any external API calls are routed outbound through the shared corporate hub firewall via UDRs, and all PaaS service access uses Private Endpoints. Specific SaaS connectors or messaging services (Service Bus, Event Grid) should be confirmed with the application team and added as Private Endpoints or approved firewall egress rules.`
    : `Integration patterns for ${appName} follow standard Azure PaaS connectivity. External API calls route through the shared hub firewall; all internal PaaS connectivity (database, Key Vault, Storage) uses Private Endpoints within the spoke VNet.`;

  return [
    "### 6.1 Architecture Overview",
    "",
    `The target state architecture for **${appName}** follows Azure Landing Zone principles with a hub-spoke network topology hosted in ${primaryRegion} (${haStr} deployment). The solution is deployed across the following environments: ${envList}. Each environment occupies a dedicated spoke subscription with its own spoke VNet peered to the McCain enterprise hub VNet. The hub VNet, managed by the McCain network team, provides shared services including the Bastion host, VPN/ExpressRoute Gateway, shared DNS servers, and the corporate network firewall (Palo Alto / Fortinet). No dedicated Azure Firewall is provisioned per workload — all inter-spoke and internet-bound traffic is routed via User-Defined Routes (UDRs) through the shared hub firewall, following the McCain centralized egress model.`,
    "",
    `**Inbound Traffic Path:** ${inboundPath} No Azure Application Gateway or per-workload WAF is deployed. Cloudflare WAF provides DDoS mitigation, bot protection, and L7 filtering before traffic reaches the Azure App Service endpoint, which enforces HTTPS-only with TLS 1.2+ minimum.`,
    "",
    `**Outbound Traffic Path:** Azure App Service VNet Integration routes all outbound traffic from the application tier through the spoke VNet. Traffic destined for PaaS services (${database}, Azure Key Vault, Azure Blob Storage) resolves to private IP addresses via Azure Private DNS Zones and is delivered through Private Endpoints within the spoke VNet — never traversing the public internet. Traffic requiring internet egress (approved external APIs, NuGet feeds, etc.) is routed via UDRs through the shared hub corporate firewall, which enforces allowlisting and logging of all outbound connections.`,
    "",
    `**Application Tier:** Azure App Service (PaaS) is the hosting platform for the ${appName} solution. Each environment (${envList}) has a dedicated App Service Plan and App Service instance for both the ${frontend} and ${backend} components. All App Services have VNet outbound integration enabled. Production instances use staging deployment slots to support zero-downtime blue/green deployments via slot swap promotion. Non-production instances use fixed single-instance plans with cost-optimized B-series SKUs; Production uses P-series SKUs with auto-scale enabled (scale-out at CPU > 70% sustained for 5 minutes; minimum 2 instances always active).`,
    "",
    `**Data Tier:** ${database} is deployed in a dedicated database subnet delegated to the appropriate Azure service provider namespace. The database server has no public network access enabled — all connectivity is routed exclusively through a Private Endpoint within the spoke VNet. Private DNS Zones handle FQDN resolution for the database endpoint, ensuring all name resolution stays within the Microsoft network backbone. Geo-redundant backups are enabled for the Production environment with point-in-time restore; Dev and QA environments use locally redundant storage backups with a shorter retention period. ${drStr}`,
    "",
    `**Security Boundary:** Microsoft Entra ID (formerly Azure AD) enforces authentication at the App Service level. Managed Identities are assigned to all Azure services for service-to-service communication — no stored credentials, connection string secrets, or service principal client secrets are used in application configuration. Network Security Groups (NSGs) are applied at the subnet level (one NSG per subnet) providing L4 port/protocol controls as the local enforcement layer within the spoke VNet. Azure Key Vault stores all application secrets, certificates, and encryption keys with soft-delete (90-day retention) and purge protection enabled; access is scoped exclusively to Managed Identity RBAC role assignments following least-privilege principles. Azure Private DNS Zones are deployed for all Private Endpoint-enabled PaaS services (Key Vault, PostgreSQL/database, Blob Storage) ensuring consistent private FQDN resolution across all environments.`,
    "",
    `**Integration Patterns:** ${integrationContext}`,
    "",
    "### 6.2 Architecture Diagram (High Level)",
    "",
    "[ARCHITECTURE_DIAGRAM_PLACEHOLDER]",
  ].join("\n");
}

/**
 * Build a per-environment database sizing table for section 7.4.
 */
function buildDatabaseSizingTable(data: {
  databaseStack?: string;
  environments: string[];
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  haEnabled?: boolean;
  drEnabled?: boolean;
  workloadTier?: string;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);
  const dbLabel = data.databaseStack ?? "Azure Database for PostgreSQL Flexible Server";

  const rows: string[] = [];
  rows.push("| Environment | Service | Resource Name | SKU / Tier | Storage | Backup Retention | HA / Redundancy | Private Endpoint | Notes |");
  rows.push("|-------------|---------|--------------|-----------|---------|-----------------|-----------------|-----------------|-------|");

  for (const env of data.environments) {
    const envLower = env.toLowerCase();
    const isProd = envLower === "prod" || envLower === "production";
    const sku = isProd ? "General Purpose — Standard_D4ds_v4 (4 vCores)" : "Burstable — Standard_B2ms (2 vCores)";
    const storage = isProd ? "128 GB (auto-grow enabled)" : "32 GB (auto-grow enabled)";
    const backup = isProd ? "35 days (geo-redundant)" : "7 days (locally redundant)";
    const haMode = (data.haEnabled && isProd) ? "Zone-redundant HA standby" : "No HA standby";
    const drNote = (data.drEnabled && isProd) ? "Geo-restore to Canada East available" : "N/A";
    const dbName = `${org}-cc-${lob}-${app}-db-${envLower}-server`;
    const peName = `${org}-cc-${lob}-${app}-db-${envLower}-pe`;
    rows.push(`| **${env}** | ${dbLabel} | \`${dbName}\` | ${sku} | ${storage} | ${backup} | ${haMode} | \`${peName}\` | ${drNote}; TLS 1.2+; CMK at rest |`);
  }

  return rows.join("\n");
}

/**
 * Build a compute sizing table for section 7.3 — one row per service per environment.
 */
function buildComputeSizingTable(data: {
  frontendStack?: string;
  backendStack?: string;
  environments: string[];
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  haEnabled?: boolean;
  workloadTier?: string;
}): string {
  const org = resolveOrgShortForm(data.organization);
  const lob = getLobCode(data.lineOfBusiness);
  const app = sanitizeNamePart(data.applicationName);
  const isTier01 = data.workloadTier === "Tier 0" || data.workloadTier === "Tier 1";

  const rows: string[] = [];
  rows.push("| Environment | Service | Resource Name | SKU / Plan | vCPUs | RAM | Auto-Scale | HA | Notes |");
  rows.push("|-------------|---------|--------------|-----------|-------|-----|------------|-----|-------|");

  for (const env of data.environments) {
    const envLower = env.toLowerCase();
    const isProd = envLower === "prod" || envLower === "production";
    const sku = isProd || isTier01 ? "P2v3" : "B2";
    const vcpu = isProd || isTier01 ? "2" : "2";
    const ram = isProd || isTier01 ? "8 GB" : "3.5 GB";
    const autoScale = isProd ? "Min 2 / Max 10 — scale-out at CPU >70% for 5 min" : "Disabled (fixed)";
    const ha = (data.haEnabled && isProd) ? "Zone-redundant (3 AZs)" : "Single-zone";
    const webName = `${org}-cc-${lob}-${app}-web-${envLower}-app`;
    const apiName = `${org}-cc-${lob}-${app}-api-${envLower}-app`;
    const aspName = `${org}-cc-${lob}-${app}-${envLower}-asp`;
    rows.push(`| **${env}** | App Service Plan | \`${aspName}\` | ${sku} | ${vcpu} | ${ram} | ${autoScale} | ${ha} | Shared plan for Web + API |`);
    rows.push(`| | App Service (Web) | \`${webName}\` | — | — | — | Inherited from plan | ${ha} | ${data.frontendStack ?? "Web frontend"}; VNet Integration |`);
    rows.push(`| | App Service (API) | \`${apiName}\` | — | — | — | Inherited from plan | ${ha} | ${data.backendStack ?? "API backend"}; Managed Identity |`);
  }

  return rows.join("\n");
}

function estimateMonthlyCost(data: {
  environments: string[];
  azureRegions: string[];
  haEnabled?: boolean;
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
  workloadTier?: string;
}): string {
  const envMultiplier = data.environments.length;
  const haMultiplier = data.haEnabled ? 2 : 1;
  const regionMultiplier = data.azureRegions.length;

  // Base estimates by tier
  const tierBase: Record<string, number> = {
    "Tier 0": 8000,
    "Tier 1": 4000,
    "Tier 2": 2000,
    "Tier 3": 800,
  };

  const base = tierBase[data.workloadTier ?? "Tier 2"] ?? 2000;
  const estimate = Math.round(base * envMultiplier * haMultiplier * (regionMultiplier > 1 ? 1.5 : 1));

  return `CAD $${estimate.toLocaleString()} - $${Math.round(estimate * 1.4).toLocaleString()} / month (estimated range across all environments)`;
}

/**
 * Build a per-service cost breakdown table in the style of the Digital Passport TDD.
 */
function buildCostBreakdownTable(data: {
  frontendStack?: string;
  backendStack?: string;
  databaseStack?: string;
  environments: string[];
  haEnabled?: boolean;
  drEnabled?: boolean;
  workloadTier?: string;
  azureRegions: string[];
}): string {
  const tierBase: Record<string, number> = {
    "Tier 0": 8000,
    "Tier 1": 4000,
    "Tier 2": 2000,
    "Tier 3": 800,
  };
  const base = tierBase[data.workloadTier ?? "Tier 2"] ?? 2000;
  const envMult = data.environments.length;
  const haMult = data.haEnabled ? 1.8 : 1;
  const total = Math.round(base * envMult * haMult);
  const annual = total * 12;

  const region = data.azureRegions.includes("canadacentral") ? "Canada Central" : "Canada East";

  // Per-service estimates (very rough, proportional to tier & env count)
  const webApp   = Math.round(60  * envMult * haMult);
  const apiApp   = Math.round(80  * envMult * haMult);
  const db       = Math.round(data.haEnabled ? 300 * envMult : 150 * envMult);
  const storage  = Math.round(20  * envMult);
  const keyVault = Math.round(5   * envMult);
  const monitor  = Math.round(50  * envMult);
  const defender = data.workloadTier === "Tier 0" || data.workloadTier === "Tier 1"
    ? Math.round(200 * envMult) : Math.round(50 * envMult);
  const network  = Math.round(40  * envMult);
  const other    = total - webApp - apiApp - db - storage - keyVault - monitor - defender - network;
  const otherAdj = Math.max(other, 0);

  const rows = [
    "| Service Type | Reserved Instance? | Region | Description | Est. Monthly Cost (CAD) |",
    "|---|---|---|---|---|",
    `| Azure App Service (Web) | No | ${region} | ${data.frontendStack ?? "Web frontend"}; B2 Dev/QA, P2v3 Prod | $${webApp} |`,
    `| Azure App Service (API) | No | ${region} | ${data.backendStack ?? "API backend"}; B2 Dev/QA, P2v3 Prod | $${apiApp} |`,
    `| ${data.databaseStack ?? "Azure Database for PostgreSQL"} | ${data.haEnabled ? "Evaluate at 6 months" : "No"} | ${region} | Burstable Dev/QA; General Purpose D4s v3 Prod${data.haEnabled ? "; zone-redundant standby" : ""} | $${db} |`,
    `| Azure Blob Storage | No | ${region} | Standard LRS Dev/QA; Standard GRS Prod; lifecycle policies | $${storage} |`,
    `| Azure Key Vault | No | ${region} | Standard Dev/QA; Premium Prod; soft delete 90 days | $${keyVault} |`,
    `| Azure Monitor + Log Analytics | No | ${region} | PerGB2018; 30d Dev/QA, 90d Prod retention + Application Insights | $${monitor} |`,
    `| Microsoft Defender for Cloud | No | ${region} | ${data.workloadTier === "Tier 0" || data.workloadTier === "Tier 1" ? "Defender for Servers P2 + PaaS plans (all envs)" : "Selected Defender plans on Prod resources only"} | $${defender} |`,
    `| Azure Virtual Network + Private Endpoints | No | ${region} | Hub-spoke peering + private endpoint per PaaS service per env | $${network} |`,
    otherAdj > 0 ? `| Other (DNS, bandwidth, misc.) | No | ${region} | Supplementary services | $${otherAdj} |` : null,
    "",
    `| **Licensing Program** | Microsoft Online Services Agreement | | | |`,
    `| **Monthly Total (all envs)** | | | | **~$${total.toLocaleString()}** |`,
    `| **Annual Total (all envs)** | | | | **~$${annual.toLocaleString()}** |`,
    "",
    "> Costs are estimates based on provisioned SKUs and environment count. Validate with the Azure Pricing Calculator and review actual utilization after 30 days in service.",
  ].filter(Boolean).join("\n");

  return rows;
}

router.post("/generate", tddGenerateRateLimiter, async (req, res) => {
  try {
    const parseResult = GenerateTddBody.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid request body", details: parseResult.error.issues });
      return;
    }

    const data = parseResult.data;

    // Pre-compute canonical naming slugs (same functions used by naming-preview endpoint)
    const orgSlug = resolveOrgShortForm(data.organization);
    const lobSlug = getLobCode(data.lineOfBusiness);
    const appSlug = sanitizeNamePart(data.applicationName);

    // Pre-flight: verify OpenAI is configured before building the heavy prompt
    try {
      createOpenAiClientContext();
    } catch (configError) {
      const userFacingConfigError = toUserFacingGenerationError(configError);
      req.log.error({ configError, userFacingConfigError }, "OpenAI client is not configured — cannot generate TDD");
      res.status(503).json({ error: `AI service is not configured: ${userFacingConfigError}` });
      return;
    }

    // Build the CIDR summary - use per-environment CIDRs when available
    const effectiveCidr = data.environmentCidrs
      ? Object.values(data.environmentCidrs)[0] ?? data.networkCidr ?? "10.0.0.0/16"
      : data.networkCidr ?? "10.0.0.0/16";

    const networkingTable = buildEnhancedNetworkingTable({
      environmentCidrs: data.environmentCidrs,
      networkCidr: data.networkCidr,
      environments: data.environmentsRequired,
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      databaseStack: data.databaseStack,
    });

    const nsgTablesBlock = buildNsgRulesTables({
      networkPosture: data.networkPosture,
      environments: data.environmentsRequired,
    });

    const azureServicesTable = buildAzureServicesConfigMatrix({
      frontendStack: data.frontendStack,
      backendStack: data.backendStack,
      databaseStack: data.databaseStack,
      environments: data.environmentsRequired,
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      networkPosture: data.networkPosture,
      workloadTier: data.workloadTier,
      haEnabled: data.haEnabled,
      drEnabled: data.drEnabled,
      azureRegions: data.azureRegions,
    });

    const environmentSummaryTable = buildEnvironmentSummaryTable({
      environments: data.environmentsRequired,
      azureRegions: data.azureRegions,
      environmentCidrs: data.environmentCidrs,
      networkCidr: data.networkCidr,
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      businessOwner: data.businessOwner,
      itOwner: data.itOwner,
      technologyOwnerEmail: data.technologyOwnerEmail,
    });

    const namingStandardsTable = buildNamingStandardsTable({
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      environments: data.environmentsRequired,
    });

    const securityAccessBlock = buildSecurityAccessTables({
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      environments: data.environmentsRequired,
      networkPosture: data.networkPosture,
    });

    const monitoringRequiredFor = data.monitoringRequiredFor ?? ["Prod"];
    const monitoringOperationsBlock = buildMonitoringOperationsTable({
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      environments: data.environmentsRequired,
      monitoringEnvironments: monitoringRequiredFor,
      availabilityTarget: data.availabilityTarget,
      rto: data.rto,
      rpo: data.rpo,
      workloadTier: data.workloadTier,
      drEnabled: data.drEnabled,
    });

    const iacDeploymentInputsTable = buildIacDeploymentInputsTable({
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      environments: data.environmentsRequired,
      azureRegions: data.azureRegions,
      environmentCidrs: data.environmentCidrs,
      networkCidr: data.networkCidr,
      workloadTier: data.workloadTier,
      haEnabled: data.haEnabled,
      drEnabled: data.drEnabled,
    });

    const costBreakdownTable = buildCostBreakdownTable({
      frontendStack: data.frontendStack,
      backendStack: data.backendStack,
      databaseStack: data.databaseStack,
      environments: data.environmentsRequired,
      haEnabled: data.haEnabled,
      drEnabled: data.drEnabled,
      workloadTier: data.workloadTier,
      azureRegions: data.azureRegions,
    });

    const computeSizingTable = buildComputeSizingTable({
      frontendStack: data.frontendStack,
      backendStack: data.backendStack,
      environments: data.environmentsRequired,
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      haEnabled: data.haEnabled,
      workloadTier: data.workloadTier,
    });

    const databaseSizingTable = buildDatabaseSizingTable({
      databaseStack: data.databaseStack,
      environments: data.environmentsRequired,
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      haEnabled: data.haEnabled,
      drEnabled: data.drEnabled,
      workloadTier: data.workloadTier,
    });

    const workloadClassificationTable = buildWorkloadClassificationTable({
      workloadTier: data.workloadTier,
      availabilityTarget: data.availabilityTarget,
      rto: data.rto,
      rpo: data.rpo,
      haEnabled: data.haEnabled,
      drEnabled: data.drEnabled,
      networkPosture: data.networkPosture,
    });

    const currentStateContent = buildCurrentStateContent({
      applicationType: data.applicationType,
      applicationFlow: data.applicationFlow,
      frontendStack: data.frontendStack,
      backendStack: data.backendStack,
      databaseStack: data.databaseStack,
    });

    const envCidrSummary = data.environmentCidrs && Object.keys(data.environmentCidrs).length > 0
      ? Object.entries(data.environmentCidrs)
          .map(([env, cidr]) => `  - ${env}: ${cidr}`)
          .join("\n")
      : `  - All environments: ${data.networkCidr ?? "10.0.0.0/16"}`;

    const namingConventions = buildNamingConventionLines({
      organization: data.organization,
      lineOfBusiness: data.lineOfBusiness,
      applicationName: data.applicationName,
      environments: data.environmentsRequired,
    });
    const lobCode = getLobCode(data.lineOfBusiness);
    const namingRulesBlock = `
## Naming Rule Inputs
- Organization slug: ${resolveOrgShortForm(data.organization)}
- LOB input: ${data.lineOfBusiness}
- LOB short code: ${lobCode}
- Application slug: ${sanitizeNamePart(data.applicationName)}
- Environment slug: lowercase environment value (dev/qa/uat/prod)

## Mandatory Naming Templates
1. Azure Service Name: <org>-cc-<lob>-<application-name>-<environment>-<service-name>
2. Subscription Name: <org>-<lob>-<application-name>-<environment>-Sub
3. Foundation Resource Group: <org>-cc-<lob>-<application-name>-foundation-<environment>-rg
4. Other Services Resource Group: <org>-cc-<lob>-<application-name>-db-<environment>-rg
5. VNet Name: <org>-cc-<lob>-<application-name>-<environment>-vnet
6. Subnet Name: <org>-cc-<lob>-<application-name>-<service-name>-<environment>-snet
`;

  const costEstimate = estimateMonthlyCost({
    environments: data.environmentsRequired,
    azureRegions: data.azureRegions,
    haEnabled: data.haEnabled,
    frontendStack: data.frontendStack,
    backendStack: data.backendStack,
    databaseStack: data.databaseStack,
    workloadTier: data.workloadTier,
  });

  const regionNames = data.azureRegions
    .map((r: string) => (r === "canadacentral" ? "Canada Central" : "Canada East"))
    .join(", ");
  const persistence = await loadTddPersistenceContext();
  let submissionId: number | null = null;

  const systemPrompt = `You are a senior Azure Cloud Solution Architect and Enterprise Architect specializing in creating comprehensive Technical Design Documents (TDD) for organizations migrating to or building on Microsoft Azure. You have deep expertise in:
- Azure Landing Zones and Hub-Spoke network topology
- Azure security best practices (Zero Trust, Defense in Depth)
- Azure networking (VNets, NSGs, Private Endpoints, hub-spoke connectivity)
- Azure identity and access management (Azure AD/Entra ID, RBAC, PIM)
- Azure compute services (App Service, AKS, VMs, Azure Functions)
- Azure data services (Azure SQL, Cosmos DB, Azure Storage, Azure Data Factory)
- Azure monitoring (Azure Monitor, Log Analytics, Application Insights)
- Azure DevOps and CI/CD pipelines
- Business Continuity and Disaster Recovery (BCDR) in Azure
- Azure cost management and FinOps
- Canadian data residency requirements (Canada Central, Canada East)

Generate thorough, professional TDD documents following the provided template structure exactly. Fill every section with intelligent, Azure-specific content based on the application details provided. Be specific with service recommendations, SKU choices, and Azure-native tooling.

## CRITICAL — Output Rules (Mandatory)

### Completeness (MANDATORY)
- You MUST output ALL sections 1 through 8 and ALL subsections 7.1 through 7.10 and 8.1 through 8.2 in full.
- NEVER use bracket tags like [Remaining Sections...], [All subsections formatted...], [Sections 7.1 through 8.2...], or any similar self-invented marker as a stand-in for content you have not written. These are forbidden.
- NEVER write phrases like "Complete document generation exceeds token context limit", "document follows same detailed pattern in omitted sections", "Sections 7.1–8.2 would continue markdown tables and prose as above", "(remaining sections continue as outlined, but tokens are constrained in this snippet)", "This response truncates at 7.2 due to space", or ANY similar statement admitting truncation, deferring sections, or referencing token/space constraints. These phrases are detected server-side and the entire affected section is replaced with generic fallback content, producing a worse document. The only correct response to space pressure is to write shorter bullets — never skip, defer, or mention token limits.
- NEVER emit phrases like "Continue generating sections X through Y", "refer earlier", "see above", "as described previously", "following the provided template", or similar truncation/reference artifacts.
- If the token budget feels tight, make each section MORE CONCISE — use tight bullet points instead of prose. Do NOT skip or summarise sections. Do NOT invent bracket placeholders.

### Bracket Marker Rules (CRITICAL)
- The ONLY bracket markers you are permitted to output verbatim are the explicit UPPERCASE system markers: [PLATFORM_COMPONENTS_TABLE], [NETWORKING_TABLE], [NSG_RULES_TABLE], [SECURITY_ACCESS_TABLE], [COMPUTE_SIZING_TABLE], [DATABASE_SIZING_TABLE], [MONITORING_OPS_TABLE], [COST_BREAKDOWN_TABLE], [NAMING_STANDARDS_TABLE], [IAC_INPUTS_TABLE], [WORKLOAD_CLASSIFICATION_TABLE], and [ARCHITECTURE_DIAGRAM_PLACEHOLDER]. Output each of these EXACTLY as written — the system replaces them with pre-built content automatically.
- The lowercase [...] prompts in the template (e.g. "[Write a summary...]") are mandatory fill points — replace every one with actual content. Do NOT leave any lowercase [...] prompt in the output.
- Do NOT invent any other bracket markers. If you create a bracket tag like [Remaining Sections...] or [Sections 7 through 8...], it will be treated as a critical output failure.

### Detail Level & Token Budget
- Write thorough, detailed content for every narrative section. The system-injected markers handle all large tables, freeing your entire token budget for rich prose.
- Use markdown tables, numbered lists, and sub-bullets to organise detail. The goal is a document detailed enough to hand directly to an implementation team.

**Section-by-section content requirements:**

- **Section 1 Executive Summary**: 2–3 paragraphs. Cover: (1) business objective and expected outcome, (2) selected Azure services by name and why they fit, (3) top 3 risks with mitigations, (4) deployment phases Dev→QA/UAT→Prod with approval gates.

- **Section 6.1 Architecture Overview**: CRITICAL — This section MUST contain 400–600 words of ORIGINAL prose. Do NOT use bullet points for this section — full paragraphs only. Even if the application architecture context field is blank, you MUST synthesise a complete architecture description from the application name, overview, environments, network posture, and Azure regions provided. Cover ALL six points below in separate full paragraphs:
  1. Landing Zone and subscription design — dedicate a paragraph to the spoke subscription name, hub-spoke VNet peering, and shared Hub services (Bastion, VPN/ExpressRoute Gateway, shared DNS).
  2. Network topology — VNETs, subnets (App Service delegated, DB delegated, Private Endpoint subnet), CIDR blocks per environment, inbound traffic path (Cloudflare WAF → App Service built-in LB), outbound traffic path (App Service VNet Integration → Private Endpoints for DB/Key Vault/Storage → Hub firewall).
  3. Application tier — App Service Plan SKU, runtime, deployment slots for Prod, VNet outbound integration.
  4. Data tier — PostgreSQL Flexible Server in delegated subnet, Private Endpoint only (no public access), geo-redundant Prod / LRS Dev-QA backups.
  5. Security boundary — Entra ID auth enforced at App Service, Managed Identities for all service-to-service, NSG per subnet, Private DNS Zones.
  6. Integration patterns — based on the application overview and flow provided, describe any external APIs, Service Bus, or SaaS connectors.
  If this section contains fewer than 200 words or contains the instruction text verbatim, it will be automatically replaced with generic fallback content — write the full section prose now.

- **Section 7.5 Security Architecture**: Write at least 300 words covering:
  1. Primary threat vectors for this workload and how the architecture counters them.
  2. Defender for Cloud plans enabled (App Service, Databases, Key Vault, Storage) and what they alert on.
  3. Key Vault strategy — secrets lifecycle, rotation policy, Managed Identity access, no direct human key access.
  4. Encryption — at-rest (CMK vs MMK decision), TLS 1.2+ enforcement, certificate lifecycle via Key Vault.
  5. Entra ID and Conditional Access — MFA policy, PIM for admin accounts, device compliance.
  6. Network security — NSG design principles, Private Endpoint DNS resolution, Hub firewall for outbound control.
  7. Audit trail — Log Analytics retention, Defender alerts, compliance review cadence.

- **Section 7.7 BCDR**: Cover RTO/RPO targets, backup schedule, DR region (Canada East), failover procedure, and testing schedule.

- **Section 7.8 DevOps & IaC**: Cover CI/CD pipeline design, branching strategy, deployment gates, Terraform/Bicep approach, and environment promotion flow.

- **Section 7.9 Risks**: Minimum 6 risk rows. Cover: network team dependency, Entra ID licensing, cost overrun, compliance/data residency, migration complexity, and timeline.

- **Section 4.4 Assumptions**: Every row must contain a real, workload-specific assumption — not a generic placeholder.

${AUTHORING_GUARDRAILS}

${FEW_SHOT_SECTION_EXAMPLE}

${namingRulesBlock}
Always use LOB short code values (DA, MD, DT, DG) in generated resource names.`;

    const architectureDiagramNote = data.architectureDiagramBase64
      ? `\n\n> **Architect-Uploaded Diagram:** An architecture/flow diagram image has been attached to this request. Carefully analyze the image and incorporate its components, flows, and relationships into your description of section 6.1 (Architecture Overview). The image itself will be embedded in section 6.2 by the system — do not attempt to reproduce it as text or Mermaid.`
      : "";

    const userPrompt = `Generate a complete Azure Technical Design Document (TDD) for the following application. Follow the template structure exactly as provided. Be comprehensive, professional, and specific to Azure services.

## Application Details

**Application Name:** ${data.applicationName}
**Application Type:** ${data.applicationType} (${["Migration", "Cloud Migration", "Application Replacement", "Application Decommissioning"].includes(data.applicationType) ? "Migration / Transition workload" : "New / Enhancement workload on Azure"})
**Organization:** ${data.organization}
**Line of Business:** ${data.lineOfBusiness}
**Solution:** ${data.solution}
**Environments Required:** ${data.environmentsRequired.join(", ")}
**Azure Regions:** ${regionNames}
**Network Posture:** ${data.networkPosture}
**Network CIDR per Environment:**
${envCidrSummary}
**Workload Tier:** ${data.workloadTier ?? "Tier 2"}
**High Availability:** ${data.haEnabled ? "Yes - Multi-zone/Region HA required" : "No"}
**Disaster Recovery:** ${data.drEnabled ? "Yes - DR site configured" : "No"}
**Availability Target:** ${data.availabilityTarget ?? "99.9%"}
**RTO:** ${data.rto ?? "4 hours"}
**RPO:** ${data.rpo ?? "1 hour"}

## Application Architecture

**Frontend Stack:** ${data.frontendStack || "Not specified"}
**Backend Stack:** ${data.backendStack || "Not specified"}
**Database Stack:** ${data.databaseStack || "Not specified"}
**Scalability Requirements:** ${data.scalabilityRequirements || "Standard auto-scaling"}

## Application Overview
${data.applicationOverview}

## Application Architecture Description
${data.applicationArchitecture || "Not provided — use the Application Overview and standard McCain Azure landing zone patterns to describe the architecture."}

## Application Flow
${data.applicationFlow || "Not provided — use the Application Overview to infer a realistic request/data flow for this workload."}

## Stakeholder Information

- Infrastructure Support Manager: ${data.infrastructureSupportManager || "N/A"}
- Application Support Manager: ${data.applicationSupportManager || "N/A"}
- IT Owner: ${data.itOwner || "N/A"}
- Business Owner: ${data.businessOwner || "N/A"}
- Key Stakeholders: ${data.keyStakeholders || "N/A"}
- Requestor Email: ${data.requestorEmail}

## Billing Information

- Company Code: ${data.billingCompanyCode || "N/A"}
- Plant: ${data.billingPlant || "N/A"}
- Cost Object: ${data.billingCostObject || "N/A"}
- GL Account: ${data.billingGlAccount || "N/A"}
- Budget Tracker Reference: ${data.budgetTrackerReference || "N/A"}
- Category Owner: ${data.categoryOwner || "N/A"}
- GL Account Owner Email: ${data.glAccountOwnerEmail || "N/A"}
- Technology Owner Email: ${data.technologyOwnerEmail || "N/A"}
- Business Owner Email: ${data.businessOwnerEmail || "N/A"}

## Resource Naming Conventions

${namingConventions}

## Cost Estimate

**High-level monthly cost estimate:** ${costEstimate}

---

Now generate the complete TDD document in Markdown format following this exact structure:

# Azure Cloud Technical Design Document (TDD)
# ${data.applicationName} - ${data.applicationType}

## Document Control

| Version | Date | Comment |
|---------|------|---------|
| 1.0 | ${new Date().toLocaleDateString("en-CA")} | Initial TDD |

| Document Owner | Title | Email |
|----------------|-------|-------|
| ${data.itOwner || "N/A"} | IT Owner | ${data.technologyOwnerEmail || "N/A"} |

---

## 1. Executive Summary

[Write a detailed executive summary of 2–3 paragraphs covering:
- **Business Objective**: What problem this application solves and the expected business outcome.
- **Scope & Approach**: Application type (${data.applicationType}), target environments (${data.environmentsRequired.join(", ")}), and the overall Azure PaaS architecture approach chosen.
- **Azure Architecture Direction**: Name the specific Azure services selected (App Service, PostgreSQL Flexible Server, Key Vault, Log Analytics, etc.) and explain why they fit this workload.
- **Key Risks & Dependencies**: Identify the top 3 risks (network team dependency, licensing, cost) and critical pre-requisites before deployment can begin.
- **Timeline & Next Steps**: High-level phasing from Dev → QA/UAT → Prod with approval gates.
Be specific — reference actual service names, environments, and team names from the form data above.]

---

## 2. Ownership, Stakeholders & Billing Context

### 2.1 Stakeholders & Billing Information

| Field | Value | Comments |
|-------|-------|----------|
| Infrastructure Support Manager | ${data.infrastructureSupportManager || "N/A"} | |
| Application Support Manager | ${data.applicationSupportManager || "N/A"} | |
| IT Owner | ${data.itOwner || "N/A"} | |
| Business Owner | ${data.businessOwner || "N/A"} | |
| Solution (LOB) | ${data.solution} | |
| Organization (Org) | ${data.organization} | |
| Line of Business | ${data.lineOfBusiness} | |
| Requestor email address | ${data.requestorEmail} | |
| Application Name | ${data.applicationName} | |
| Environments required | ${data.environmentsRequired.join(", ")} | |
| Billing Company Code | ${data.billingCompanyCode || "N/A"} | |
| Billing Plant | ${data.billingPlant || "N/A"} | |
| Billing Cost Object | ${data.billingCostObject || "N/A"} | |
| Billing GL Account | ${data.billingGlAccount || "N/A"} | |
| Budget Tracker Reference | ${data.budgetTrackerReference || "N/A"} | |
| Category Owner | ${data.categoryOwner || "N/A"} | |
| GL Account Owner email | ${data.glAccountOwnerEmail || "N/A"} | |
| Technology Owner Email | ${data.technologyOwnerEmail || "N/A"} | |
| Business Owner Email | ${data.businessOwnerEmail || "N/A"} | |
| Network Posture | ${data.networkPosture} | |
| Azure Regions | ${regionNames} | Canadian data residency |
| High-level monthly cost estimate (CAD) | ${costEstimate} | |

---

## 3. Workload Context & Classification

### 3.1 Environment Summary

${environmentSummaryTable}

### 3.2 Workload Classification

${WORKLOAD_CLASSIFICATION_PLACEHOLDER}

---

## 4. Current State Architecture (As-Is)

### 4.1 Current Hosting Model

${currentStateContent.hosting}

### 4.2 Current High-Level Architecture (Infra)

${currentStateContent.architecture}

### 4.3 Current High-Level Application Flow/Architecture

${data.applicationFlow}

### 4.4 Assumptions for the Solution

| Items | Descriptions |
|-------|--------------|
| Authentication & Authorization | [Azure AD / Entra ID based auth assumptions] |
| User Interface | [UI stack assumptions based on: ${data.frontendStack || "TBD"}] |
| Data Transformations | [Data flow assumptions] |
| Raw Data Storage | [Storage approach for ${data.databaseStack || "TBD"}] |
| Business Logic & Notifications | [Backend logic assumptions for: ${data.backendStack || "TBD"}] |
| SaaS Integrations | [Any SaaS dependencies] |

### 4.5 Stakeholders

#### ${data.organization} Stakeholders

| Name | Role | Email Address |
|------|------|---------------|
| ${data.infrastructureSupportManager} | Infrastructure Support Manager | |
| ${data.applicationSupportManager} | Application Support Manager | |
| ${data.itOwner} | IT Owner | ${data.technologyOwnerEmail} |
| ${data.businessOwner} | Business Owner | ${data.businessOwnerEmail} |

#### Partner/Vendor Stakeholders

| Name | Role | Email Address |
|------|------|---------------|
| [To be identified] | [Role] | [Email] |

---

## 5. Platform Components (Infrastructure View)

### 5.1 Existing/Current Infra Components

${currentStateContent.existingInfra}

### 5.2 New/Proposed Infra Components

The following table lists all new Azure services provisioned for this solution. SKU/Plan and HA settings are environment-specific (shown in parentheses where they differ). Replace {env} with the environment short name (dev / qa / prod) in resource group names.

${PLATFORM_COMPONENTS_PLACEHOLDER}

---

## 6. Proposed Target State Architecture (To-Be)

### 6.1 Architecture Overview

[Write 400–600 words of ORIGINAL technical prose for this specific workload. Cover ALL six points in full paragraphs — do not use bullet points here:
1. Landing Zone / subscription design: which spoke subscription hosts this workload, how the spoke VNet peers to the McCain Hub VNet, and what shared services (Bastion, VPN/ExpressRoute Gateway, DNS) live in the Hub.
2. Network topology: VNET address spaces, subnet breakdown (App Service delegated subnet, DB delegated subnet, Private Endpoint subnet), inbound traffic path (Cloudflare WAF → App Service built-in LB), outbound path (App Service VNet Integration → Private Endpoints for DB/KV/Storage → Hub firewall for internet egress).
3. Application tier: App Service Plan SKU per environment, runtime stack, deployment slots for Prod (blue/green), VNet outbound integration enabled.
4. Data tier: PostgreSQL Flexible Server in a dedicated delegated subnet, Private Endpoint only (no public access), geo-redundant backups for Prod, locally redundant for Dev/QA.
5. Security boundary: Entra ID authentication at App Service level, Managed Identities for all service-to-service calls (no secrets), NSGs at subnet level (one per subnet), Private DNS Zones for PaaS name resolution.
6. Integration patterns: any external APIs, Service Bus, SaaS connectors, or data pipelines specific to this workload based on the overview below.
Application overview: ${data.applicationOverview}${data.applicationArchitecture ? `\nAdditional architecture context: ${data.applicationArchitecture}` : ""}${data.applicationFlow ? `\nApplication flow: ${data.applicationFlow}` : ""}]${architectureDiagramNote}

### 6.2 Architecture Diagram (High Level)

[ARCHITECTURE_DIAGRAM_PLACEHOLDER]

The architecture follows a ${data.haEnabled ? "multi-zone highly available" : "standard"} deployment pattern across ${regionNames} using Azure Landing Zone principles with hub-spoke network topology and Cloudflare WAF as the shared enterprise edge security service.

---

## 7. Target Solution Detailed Design Components

### 7.1 Network Architecture

**Per-Environment VNet and Subnet Design (subnet CIDRs are TBD — assign from the environment VNet CIDR before deployment):**

${NETWORKING_TABLE_PLACEHOLDER}

**Hub-Spoke Corporate Network Topology:**
- **Shared Hub VNet:** Managed by the McCain network team — contains shared services (Bastion, VPN/ExpressRoute Gateway, DNS servers, shared monitoring). This team must be engaged for VNet peering and firewall rule provisioning.
- **Spoke VNets:** One dedicated spoke VNet per environment, peered to the hub. Each spoke contains workload, database, and private-endpoint subnets.
- **Corporate Shared Firewall:** McCain uses a shared enterprise-grade network firewall (Palo Alto / Fortinet) maintained centrally in the Hub subscription for all projects. A **per-workload dedicated Azure Firewall is NOT deployed** — all inter-spoke and internet-bound traffic is routed through the shared firewall via UDRs (User-Defined Routes). Firewall rules must be requested from the network team.
- **Cloudflare WAF (L7 — Shared):** McCain uses Cloudflare as the enterprise WAF/CDN/DNS platform. Cloudflare WAF is automatically active when a domain is registered under the mccain.com domain umbrella and DNS is configured. No Azure Application Gateway WAF or per-workload WAF is deployed — Cloudflare is the L7 protection layer.
- **Load Balancing:** Azure App Service provides its own built-in load balancer. No Azure Application Gateway or Azure Load Balancer is deployed for this workload unless multi-region active-active is required.
- **NSG Strategy:** Network Security Groups (NSGs) are applied at the subnet level — one NSG per subnet. NSGs provide L4 security (port/protocol) controls as the local enforcement layer.
- ${data.networkPosture === "Internet-Facing" ? "Traffic path (inbound): Internet → Cloudflare WAF (L7) → Corporate Firewall → Hub VNet → VNet Peer → App Service." : "No direct internet ingress — all connectivity via Private Endpoints and hub-spoke internal routing. Private Endpoints for all PaaS services."}
- Azure DDoS Protection ${data.workloadTier === "Tier 0" || data.workloadTier === "Tier 1" ? "Standard enabled on Hub VNet (Enterprise tier — check hub team for existing coverage)." : "Basic (Network DDoS) — Standard DDoS Protection not required for this tier."}
- Azure Private DNS Zones for internal PaaS name resolution (Key Vault, Storage, PostgreSQL, etc.)

**NSG Rules:**

${NSG_RULES_PLACEHOLDER}

### 7.2 Identity & Access Management

**Azure AD / Entra ID Configuration:**
- Managed Identities for all Azure services (no service principal secrets)
- Role-Based Access Control (RBAC) with least-privilege model
- Privileged Identity Management (PIM) for administrative access
- Conditional Access Policies for user authentication
- ${data.networkPosture === "Internal-Only" ? "Azure AD Application Proxy for internal app access" : "Azure AD App Registration for application identity"}

**RBAC Roles by Environment:**

| Role | Scope | Principals |
|------|-------|-----------|
| Owner | Subscription (Dev) | DevOps Team, Infrastructure Support Manager |
| Contributor | Resource Groups | Application Support Manager |
| Reader | All Environments | Business Owner, IT Owner |
| Custom Application Role | App Resources | Application Managed Identity |

${SECURITY_ACCESS_PLACEHOLDER}

### 7.3 Compute & Platform Architecture

**Hosting Platform:** Azure App Service (PaaS) — no IaaS VMs or Kubernetes required for this workload.

**App Service Plan & Web App Configuration (per environment):**

${COMPUTE_SIZING_PLACEHOLDER}

**Scaling Policy:**
- Non-production (Dev/QA): Fixed single instance — auto-scale disabled to control cost. Stop/Start schedules recommended outside business hours.
- Production: Auto-scale enabled — scale-out triggered at CPU > 70% sustained for 5 minutes; scale-in at CPU < 30% sustained for 30 minutes. Minimum 2 instances always active for zero-downtime deployments.

**Platform Configuration:**
- Always On: Enabled on all App Service Plans (prevents cold start for APIs).
- VNet Integration: Enabled on all App Services — outbound traffic routes through the workload subnet to reach Private Endpoints for database, Key Vault, and Storage.
- Managed Identity: User-assigned Managed Identity attached to both Web and API App Services — no passwords or connection strings in application settings.
- HTTPS Only: Enforced at platform level (HTTP redirect to HTTPS).
- TLS Version: Minimum TLS 1.2 enforced.
- Health Check: /healthz endpoint configured for App Service health monitoring.

[Describe any additional compute considerations specific to this workload — e.g., background jobs, scheduled tasks, worker processes, or memory-intensive operations that may require SKU upgrade.]

### 7.4 Data & Storage Architecture

**Database Configuration (per environment):**

${DATABASE_SIZING_PLACEHOLDER}

**Database Additional Settings:**
- SSL/TLS: Enforced (minimum TLS 1.2); certificate validation required for all connections.
- Authentication: Azure Active Directory (Entra ID) authentication preferred; local admin account disabled post-setup.
- Firewall: No public access — connectivity via Private Endpoint only. Subnet delegation to Microsoft.DBforPostgreSQL/flexibleServers required.
- Connection Pooling: Use PgBouncer (built-in with Flexible Server) or connection pool at application layer.
- Maintenance Window: Configured to off-peak hours (Sunday 02:00–04:00 local time).
- CMK (Customer-Managed Key): Evaluated for Prod compliance; Azure Key Vault integration required.

**Storage Account Configuration:**
- Account Name: ${orgSlug}${lobSlug}${appSlug}{env}st (max 24 chars, lowercase, no hyphens — verify global uniqueness)
- SKU: Standard LRS (Dev/QA), Standard GRS (Prod)
- Access: Private Endpoint only (${orgSlug}-cc-${lobSlug}-${appSlug}-blob-{env}-pe) — no public blob access
- Soft Delete: Enabled — blobs: 7 days (Dev/QA), 30 days (Prod); containers: 7 days
- Versioning: Enabled for production
- Lifecycle Policy: Move to Cool tier after 30 days; Archive after 90 days; Delete after 365 days

**Data Classification & Encryption:**
- Classification: Confidential — all data encrypted at rest (AES-256 via Microsoft-managed or CMK) and in transit (TLS 1.2+).
- No data replication outside Canada (Canada Central primary; Canada East for DR only when enabled).

[Describe any application-specific data storage requirements — e.g., file upload types, expected data volume growth rate, query patterns, or connection pooling needs specific to this workload.]

### 7.5 Security Architecture & Controls

**Security Controls:**
- Microsoft Defender for Cloud (Standard tier for ${data.workloadTier === "Tier 0" || data.workloadTier === "Tier 1" ? "all services" : "selected services"})
- Azure Key Vault for secrets, certificates, and encryption keys
  - Name: ${orgSlug}-cc-${lobSlug}-${appSlug}-<env>-kv
  - Soft delete and purge protection enabled
  - Managed Identity access only (no direct key access)
- Microsoft Sentinel for SIEM/SOAR (centralized in Hub subscription)
- Azure Policy for governance and compliance
- Log Analytics Workspace for centralized logging
- Vulnerability Assessment and Security Score monitoring

**Compliance Requirements:**
- Canadian data residency (Canada Central primary, Canada East DR)
- Encryption at rest and in transit
- Access logging and audit trails
- Regular security reviews and penetration testing


### 7.6 Monitoring & Operations

**Environments requiring full monitoring/observability:** ${(data.monitoringRequiredFor ?? ["Prod"]).join(", ")}

**Monitoring Stack${(data.monitoringRequiredFor ?? ["Prod"]).length < data.environmentsRequired.length ? ` (applied to: ${(data.monitoringRequiredFor ?? ["Prod"]).join(", ")})` : ""}:**
- Azure Monitor + Log Analytics Workspace (centralized)
- Application Insights for APM / distributed tracing
- Azure Alerts with action groups for ops and security teams
- Azure Dashboards for real-time operational visibility
- Azure Service Health for platform notifications
${data.environmentsRequired.filter((e: string) => !(data.monitoringRequiredFor ?? ["Prod"]).includes(e)).length > 0 ? `
**Reduced monitoring for non-production environments (${data.environmentsRequired.filter((e: string) => !(data.monitoringRequiredFor ?? ["Prod"]).includes(e)).join(", ")}):**
- Basic Azure Monitor metrics only
- Log Analytics at reduced retention (30 days)
- No Application Insights APM
- Cost-optimized alerting only` : ""}

${MONITORING_OPS_PLACEHOLDER}

### 7.7 Business Continuity & Disaster Recovery

**BCDR Strategy:**

| Parameter | Target |
|-----------|--------|
| Availability Target | ${data.availabilityTarget ?? "99.9%"} |
| Primary Region | Canada Central |
| DR Region | ${data.drEnabled ? "Canada East" : "N/A - No DR configured"} |${data.drEnabled ? `
| RTO | ${data.rto ?? "To be defined"} |
| RPO | ${data.rpo ?? "To be defined"} |` : ""}

**Backup Strategy:**
- Azure Backup: ${data.workloadTier === "Tier 0" || data.workloadTier === "Tier 1" ? "Daily backups, 30-day retention" : "Weekly backups, 14-day retention"}
- Database backups: Automated with point-in-time restore
- Storage replication: ${data.drEnabled ? "GRS (Geo-Redundant Storage) for Prod" : "LRS for Dev, ZRS for Prod"}

${data.drEnabled ? `**DR Configuration:**
- Active-Passive setup between Canada Central (Primary) and Canada East (DR)
- Azure Site Recovery for IaaS workloads
- Azure Traffic Manager or Front Door for DNS-based failover
- Regular DR drills: Quarterly` : "**DR Note:** Disaster Recovery has not been requested for this solution."}

**Zones:**
- ${data.haEnabled ? "Availability Zones enabled: Prod workloads deployed across 3 zones in Canada Central" : "No Availability Zones - Standard deployment"}

### 7.8 DevOps & Release Management

**CI/CD Pipeline (Azure DevOps):**
- Source Control: Azure Repos or GitHub (connected to Azure DevOps)
- Pipeline: Azure Pipelines (YAML-based)
- Artifact: Azure Container Registry or Azure Artifacts
- Deployment: Staged deployments (Dev → QA/UAT → Prod) with approvals

**Branch Strategy:**
- main → Prod
- release/* → QA/UAT
- develop → Dev (auto-deploy)
- feature/* → PR to develop

**Infrastructure as Code:**
- Bicep / Terraform for all Azure resources
- Stored in Azure Repos, peer-reviewed before deployment
- Azure Blueprint or Policy for governance

**Environments:**
${data.environmentsRequired
  .map((env: string) => `- **${env}**: [Deployment gate configuration for ${env}]`)
  .join("\n")}

### 7.9 Risks, Assumptions & Exceptions

| # | Category | Risk / Assumption / Exception | Mitigation / Notes |
|---|----------|-------------------------------|-------------------|
| 1 | Network | Assumption: ExpressRoute/VPN connectivity to on-premises is available | Validate with network team before deployment |
| 2 | Security | Assumption: Azure AD tenant is configured with required licensing | Verify Entra ID P2 licensing for PIM |
| 3 | Cost | Risk: Cost overrun if auto-scaling not properly configured | Implement Azure Cost Management budgets and alerts |
| 4 | Compliance | Assumption: All data classified as Confidential | Validate with CISO/Data Governance team |
| 5 | Migration | ${["Migration", "Cloud Migration", "Application Replacement", "Application Decommissioning"].includes(data.applicationType) ? "Risk: Data migration complexity and downtime" : "Assumption: No legacy data migration required"} | ${["Migration", "Cloud Migration", "Application Replacement", "Application Decommissioning"].includes(data.applicationType) ? "Plan phased migration with cutover window" : "N/A"} |
| 6 | Timeline | Risk: Dependency on network team for VNet peering and firewall rules | Engage network team early in deployment process |

### 7.10 Cost Management & Financial Governance

**Solution Budget:**

${COST_BREAKDOWN_PLACEHOLDER}

**Cost Alerts:**
- Azure Cost Management budget configured per subscription with monthly reset period.
- Alert thresholds: 80% (warning — email to GL Account Owner) and 100% (critical — email + Teams).
- Weekly cost anomaly detection enabled; digest routed to: ${data.glAccountOwnerEmail || data.technologyOwnerEmail || "GL Account Owner"}.

**Reserved Instances:**
- Reserved Instances should be evaluated at the 6-month mark once Prod utilization baseline is established.
- 1-year Reserved Instances are recommended for App Service Plans and Database Flexible Server in Prod.
- Dev/QA workloads should remain on Pay-as-you-go to allow right-sizing flexibility.

**Cost Optimization Recommendations:**
- Dev/QA environments: auto-shutdown schedule outside business hours (estimated 40–60% non-prod savings).
- Right-size all resources based on actual utilization after 30 days in service (use Azure Advisor).
- Storage lifecycle policies: move blobs to Cool tier after 30 days, Archive after 90 days.
- Azure Hybrid Benefit: assess for ${["Migration", "Cloud Migration", "Application Replacement", "Application Decommissioning"].includes(data.applicationType) ? "migrated Windows Server and SQL Server workloads" : "any Windows-based services deployed"}.
- Mandatory resource tags for cost allocation: Environment, Application, CostCenter, Owner, BusinessUnit.
- Azure Policy: deny resource creation without required tags (enforced via built-in policy initiative).

---

## 8. Deployment Architecture

**Deployment Sequence:**
1. Hub Network (VNet, Firewall, Bastion, VPN Gateway)
2. Spoke VNets (per environment) + VNet Peering
3. Shared Services (Key Vault, Log Analytics, Storage Accounts)
4. Identity & RBAC configuration (Managed Identities, role assignments)
5. Compute resources (per environment, Dev first)
6. Database provisioning and Private Endpoint configuration
7. Application deployment (CI/CD pipeline)
8. Monitoring, alerting, and diagnostic settings setup
9. Security baseline validation (Defender for Cloud recommendations)
10. UAT → Production promotion

**Environment Promotion:**
Dev → QA/UAT → Production (each requires sign-off)

### 8.1 Naming & Resource Standards

The following table provides computed resource names for all environments. Use these names directly in IaC templates (Bicep/Terraform):

${NAMING_STANDARDS_PLACEHOLDER}

### 8.2 Deployment Inputs for IaC / Pipeline

The following table captures all key parameters required to deploy this solution. Mark **REQUIRED** items as blockers before deployment can proceed:

${IAC_INPUTS_PLACEHOLDER}

---

*Document generated by Azure Agentic TDD Model on ${new Date().toLocaleDateString("en-CA")}*
*Version 1.0 - Requires review and approval before deployment*`;

    if (persistence) {
      try {
        const insertedRows = await persistence.db
          .insert(persistence.tddSubmissionsTable)
          .values({
            applicationName: data.applicationName,
            organization: data.organization,
            lineOfBusiness: data.lineOfBusiness,
            requestorEmail: data.requestorEmail,
            environments: data.environmentsRequired,
            formData: data,
            status: "in_progress",
          })
          .returning({ id: persistence.tddSubmissionsTable.id });

        const insertedSubmission = insertedRows.at(0);
        if (insertedSubmission) {
          submissionId = insertedSubmission.id;
          req.log.info({ submissionId }, "Saved TDD submission in PostgreSQL");
        }
      } catch (error) {
        req.log.error(
          { error },
          "Failed to persist initial TDD submission; continuing generation",
        );
      }
    } else {
      req.log.warn(
        "PostgreSQL persistence is not enabled. Set DATABASE_URL to store TDD submissions.",
      );
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    let fullContent = "";
    let markdownBlobPath: string | null = null;

    // Send a keepalive comment immediately so Azure App Service knows the
    // connection is alive. We also set up an interval to send periodic
    // keepalives during generation (Azure kills idle SSE after ~230s).
    res.write(": keepalive\n\n");
    const keepaliveInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": keepalive\n\n");
      }
    }, 25_000);

    try {
    const openAiContext = createOpenAiClientContext();
    const modelName = resolveOpenAiModel(openAiContext.usesAzure);
    req.log.info(
      { usesAzure: openAiContext.usesAzure, modelName },
      "Starting TDD generation request (single-pass)",
    );
    const uploadedDiagramBase64 = data.architectureDiagramBase64 as string | undefined;
    const userMessageContent = uploadedDiagramBase64
      ? [
          {
            type: "text" as const,
            text: userPrompt,
          },
          {
            type: "image_url" as const,
            image_url: {
              url: uploadedDiagramBase64,
              detail: "high" as const,
            },
          },
        ]
      : userPrompt;

    // ── Single-pass generation: all sections 1–8 ─────────────────────────────
    const completionParams = buildCompletionParams({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageContent },
      ],
      maxTokens: resolveMaxOutputTokens(openAiContext.usesAzure),
      usesAzure: openAiContext.usesAzure,
      stream: true,
    });
    const stream = await openAiContext.client.chat.completions.create(completionParams);

    let finishReason: string | null = null;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = choice?.delta?.content;
      if (delta) {
        fullContent += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    req.log.info(
      { generatedChars: fullContent.length, finishReason },
      "TDD generation stream complete",
    );

    // Diagnostic: log the raw 80-char context around each placeholder name so
    // we can see exactly what format (backticks, escaped brackets, etc.) the
    // model used.  Remove this block once the injection is confirmed stable.
    for (const name of ALL_PLACEHOLDER_NAMES) {
      const idx = fullContent.indexOf(name.slice(0, 6)); // first 6 chars
      if (idx !== -1) {
        req.log.info(
          { name, rawContext: JSON.stringify(fullContent.slice(Math.max(0, idx - 15), idx + name.length + 15)) },
          "raw-placeholder-context",
        );
      }
    }

    if (finishReason === "content_filter") {
      req.log.warn("Generation was stopped by Azure content filter");
    } else if (finishReason === "length") {
      req.log.warn("Generation was truncated due to token limit — guardrails will fill missing sections");
    }

    const section4Fallback = buildSection4Fallback({
      applicationType: data.applicationType,
      applicationFlow: data.applicationFlow,
      frontendStack: data.frontendStack,
      backendStack: data.backendStack,
      databaseStack: data.databaseStack,
      infrastructureSupportManager: data.infrastructureSupportManager,
      applicationSupportManager: data.applicationSupportManager,
      itOwner: data.itOwner,
      businessOwner: data.businessOwner,
      technologyOwnerEmail: data.technologyOwnerEmail,
      businessOwnerEmail: data.businessOwnerEmail,
      organization: data.organization,
    });

    const section5Fallback = buildSection5Fallback({
      applicationType: data.applicationType,
      applicationFlow: data.applicationFlow,
      frontendStack: data.frontendStack,
      backendStack: data.backendStack,
      databaseStack: data.databaseStack,
    });

    const section6Fallback = buildSection6Fallback({
      applicationName: data.applicationName,
      applicationOverview: data.applicationOverview,
      applicationFlow: data.applicationFlow,
      frontendStack: data.frontendStack,
      backendStack: data.backendStack,
      databaseStack: data.databaseStack,
      networkPosture: data.networkPosture,
      haEnabled: data.haEnabled,
      drEnabled: data.drEnabled,
      environmentsRequired: data.environmentsRequired,
      azureRegions: data.azureRegions,
    });

    const guardrailResult = applyOutputGuardrails(
      fullContent,
      {
        applicationName: data.applicationName,
        networkPosture: data.networkPosture,
        drEnabled: data.drEnabled,
        azureRegions: data.azureRegions,
      },
      {
        platformComponents: azureServicesTable,
        nsgRules: nsgTablesBlock,
        networking: networkingTable,
        securityAccess: securityAccessBlock,
        computeSizing: computeSizingTable,
        databaseSizing: databaseSizingTable,
        monitoringOps: monitoringOperationsBlock,
        costBreakdown: costBreakdownTable,
        namingStandards: namingStandardsTable,
        iacInputs: iacDeploymentInputsTable,
        workloadClassification: workloadClassificationTable,
        section4Fallback,
        section5Fallback,
        section6Fallback,
      },
      data.architectureDiagramBase64 as string | undefined,
    );
    fullContent = guardrailResult.guarded;
    const rebuiltSections = guardrailResult.rebuiltSections;

    // Nuclear fallback: even if normalizePlaceholders + injectPrebuiltTables
    // missed a placeholder (unknown bracket/escape variant from the model), do a
    // brute-force line-level scan for any line that contains just the placeholder
    // name as a substring and replace the whole line with the table.
    const nuclearTableMap: Array<[string, string]> = [
      ["PLATFORM_COMPONENTS_TABLE", azureServicesTable],
      ["NSG_RULES_TABLE", nsgTablesBlock],
      ["NETWORKING_TABLE", networkingTable],
      ["SECURITY_ACCESS_TABLE", securityAccessBlock],
      ["COMPUTE_SIZING_TABLE", computeSizingTable],
      ["DATABASE_SIZING_TABLE", databaseSizingTable],
      ["MONITORING_OPS_TABLE", monitoringOperationsBlock],
      ["COST_BREAKDOWN_TABLE", costBreakdownTable],
      ["NAMING_STANDARDS_TABLE", namingStandardsTable],
      ["IAC_INPUTS_TABLE", iacDeploymentInputsTable],
      ["WORKLOAD_CLASSIFICATION_TABLE", workloadClassificationTable],
    ];
    for (const [name, table] of nuclearTableMap) {
      if (fullContent.includes(name)) {
        req.log.warn({ name }, "Nuclear fallback triggered — placeholder name survived guardrails");
        // Replace every occurrence of a line whose only meaningful content is the placeholder.
        const linePattern = new RegExp(
          `^[\\s\`\\[\\\\]*(${name.replace(/_/g, "(?:\\\\_)?_")})[\\s\`\\]\\\\]*$`,
          "gm",
        );
        fullContent = fullContent.replace(linePattern, () => table);
        // If it still persists (embedded mid-sentence), replace in-line.
        if (fullContent.includes(name)) {
          fullContent = fullContent.replaceAll(name, () => table);
        }
      }
    }

    let markdownBlobUploadError: string | null = null;
    if (fullContent.length > 0) {
      const trackingKey =
        submissionId !== null
          ? String(submissionId)
          : `untracked-${Date.now()}-${toSectionSlug(data.applicationName)}`;
      const uploadResult = await uploadTextBlob(
        `tdd/${trackingKey}/tdd.md`,
        fullContent,
        "text/markdown; charset=utf-8",
      );

      if (uploadResult) {
        markdownBlobPath = uploadResult.blobPath;
      } else {
        const blobStatus = getBlobStorageStatus();
        // Only surface a warning to the user when blob storage was explicitly
        // configured but then failed. If it was never configured (source=missing),
        // it is an optional feature and silently skipping is the correct behaviour.
        if (blobStatus.configured) {
          const looksLikeAuthorizationIssue = Boolean(
            blobStatus.lastUploadError?.toLowerCase().includes("not authorized"),
          );
          const blobHint = looksLikeAuthorizationIssue
            ? " Use an account-key connection string from Storage Account Access Keys, or a SAS with write/create permissions."
            : "";
          markdownBlobUploadError =
            `Azure Blob upload failed. configured=${blobStatus.configured}; container=${blobStatus.containerName}; source=${blobStatus.connectionStringSource}; lastInitError=${blobStatus.lastInitError ?? "none"}; lastUploadError=${blobStatus.lastUploadError ?? "none"}.${blobHint}`;
        }
        req.log.warn(
          { submissionId, trackingKey, blobStatus },
          "Markdown blob upload did not succeed",
        );
      }
    }

    if (persistence && submissionId !== null) {
      try {
        const updateValues: {
          generatedContent: string;
          status: string;
          updatedAt: Date;
          blobPathMarkdown?: string;
          storageProvider?: string;
        } = {
          generatedContent: fullContent,
          status: "completed",
          updatedAt: new Date(),
        };

        if (markdownBlobPath) {
          updateValues.blobPathMarkdown = markdownBlobPath;
          updateValues.storageProvider = "azure_blob";
        }

        await persistence.db
          .update(persistence.tddSubmissionsTable)
          .set(updateValues)
          .where(eq(persistence.tddSubmissionsTable.id, submissionId));
      } catch (error) {
        req.log.error(
          { error, submissionId },
          "Failed to update completed TDD submission in PostgreSQL",
        );
      }
    }

    res.write(
      `data: ${JSON.stringify({
        done: true,
        fullContent,
        submissionId,
        markdownBlobPath,
        markdownBlobUploadError,
        rebuiltSections,
      })}\n\n`,
    );
    clearInterval(keepaliveInterval);
    res.end();
    } catch (error) {
      clearInterval(keepaliveInterval);
      if (persistence && submissionId !== null) {
        try {
          await persistence.db
            .update(persistence.tddSubmissionsTable)
            .set({
              generatedContent: fullContent.length > 0 ? fullContent : null,
              status: "failed",
              updatedAt: new Date(),
            })
            .where(eq(persistence.tddSubmissionsTable.id, submissionId));
        } catch (updateError) {
          req.log.error(
            { updateError, submissionId },
            "Failed to update failed TDD submission in PostgreSQL",
          );
        }
      }

      const userFacingError = toUserFacingGenerationError(error);
      req.log.error({ error, userFacingError }, "Error generating TDD");
      res.write(`data: ${JSON.stringify({ error: userFacingError })}\n\n`);
      res.end();
    }
  } catch (error) {
    const userFacingError = toUserFacingGenerationError(error);
    req.log.error({ error, userFacingError }, "Failed before generation stream started");
    if (!res.headersSent) {
      res.status(500).json({ error: userFacingError });
      return;
    }
    res.end();
  }
});

export default router;
