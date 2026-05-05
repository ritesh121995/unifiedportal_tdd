import { Router, type IRouter } from "express";
import {
  createOpenAiClientContext,
  resolveOpenAiModel,
  toCompletionText,
  toUserFacingGenerationError,
} from "./openai-client";

const router: IRouter = Router();

interface RegenerateSectionBody {
  sectionTitle: string;
  currentSectionContent: string;
  fullDocument: string;
  applicationName: string;
}

interface FollowUpBody {
  prompt: string;
  fullDocument: string;
  applicationName: string;
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

function buildFallbackSectionBody(sectionTitle: string): string {
  if (sectionTitle === "7. Target Solution Detailed Design Components") {
    return [
      "### 7.1 Network, Security, and Identity",
      "- Define per-environment VNets/subnets, NSGs, private endpoints, and DNS integration.",
      "- Enforce identity with Entra ID, RBAC least privilege, and managed identities for workloads.",
      "- Apply Key Vault for secrets/certificates and baseline policies for hardening.",
      "",
      "### 7.2 Compute, Data, and Observability",
      "- Select production-ready SKUs for application, data, and integration services per environment.",
      "- Define scaling thresholds, backup/retention posture, and DR replication behavior.",
      "- Implement Azure Monitor + Log Analytics + Application Insights with actionable alerts.",
    ].join("\n");
  }
  if (sectionTitle === "8. Deployment Architecture") {
    return [
      "### Deployment Sequence",
      "1. Provision shared networking and connectivity controls (hub/spoke, NSGs, private endpoints).",
      "2. Deploy shared platform services (Key Vault, Log Analytics, monitoring baselines).",
      "3. Provision data services and private endpoints.",
      "4. Deploy application services in Dev, then promote through QA/UAT to Prod.",
      "5. Apply security baseline checks, operational alerting, and release approvals.",
      "",
      "### Environment Promotion",
      "Dev -> QA/UAT -> Prod with change approvals and rollback checkpoints.",
    ].join("\n");
  }
  return "Section generated with baseline guidance. Review and refine for workload-specific details.";
}

function sanitizeRegeneratedSection(sectionTitle: string, markdown: string): string {
  const cleaned = markdown
    .replaceAll(
      /^\s*\[See full detailed components as outlined previously in each subsection of Section 7\.\]\s*$/gim,
      "",
    )
    .replaceAll(
      /^\s*\[Deployment sequence, naming conventions, and promotion paths as outlined previously in Section 8\.\]\s*$/gim,
      "",
    )
    .replaceAll(/syntax error in text\s*mermaid version\s+\d+\.\d+\.\d+/gim, "")
    .replaceAll(/^.*syntax error in text.*$/gim, "")
    .replaceAll(/^.*mermaid version\s+\d+\.\d+\.\d+.*$/gim, "")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();

  const constrained = enforceSharedEdgeSecurityConstraints(cleaned);
  if (constrained.length < 80) {
    return buildFallbackSectionBody(sectionTitle);
  }
  return constrained;
}

function getBodyStringByKeys(
  body: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = Reflect.get(body, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function parseRegenerateSectionBody(value: unknown): RegenerateSectionBody | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const sectionTitle = getBodyStringByKeys(body, [
    "sectionTitle",
    "sectionHeading",
    "section",
  ]);
  const currentSectionContent = getBodyStringByKeys(body, [
    "currentSectionContent",
    "sectionContent",
    "currentContent",
  ]);
  const fullDocument = getBodyStringByKeys(body, [
    "fullDocument",
    "document",
    "documentContent",
    "content",
  ]);
  const applicationName =
    getBodyStringByKeys(body, ["applicationName", "application", "appName"]) ||
    "Application";

  if (
    sectionTitle.trim().length < 3 ||
    currentSectionContent.trim().length < 10 ||
    fullDocument.trim().length < 50 ||
    applicationName.trim().length === 0
  ) {
    return null;
  }

  return {
    sectionTitle: sectionTitle.trim(),
    currentSectionContent: currentSectionContent.trim(),
    fullDocument,
    applicationName: applicationName.trim(),
  };
}

function parseFollowUpBody(value: unknown): FollowUpBody | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const prompt = getBodyStringByKeys(body, [
    "prompt",
    "followUp",
    "followUpPrompt",
    "message",
    "question",
  ]);
  const fullDocument = getBodyStringByKeys(body, [
    "fullDocument",
    "document",
    "documentContent",
    "content",
  ]);
  const applicationName =
    getBodyStringByKeys(body, ["applicationName", "application", "appName"]) ||
    "Application";

  if (prompt.length < 3 || fullDocument.length < 20) {
    return null;
  }

  return {
    prompt,
    fullDocument,
    applicationName,
  };
}

router.post("/regenerate-section", async (req, res) => {
  const parsedBody = parseRegenerateSectionBody(req.body);
  if (!parsedBody) {
    res.status(400).json({
      error:
        "Invalid request body. Expected sectionTitle/currentSectionContent/fullDocument/applicationName (or supported aliases).",
    });
    return;
  }

  const { sectionTitle, currentSectionContent, fullDocument, applicationName } = parsedBody;

  const systemPrompt = `You are an expert Azure cloud architect improving one section in a Technical Design Document.
Rules:
- Return markdown only (no code fences).
- Improve specificity and implementation detail for Azure services.
- Keep heading names unchanged.
- Keep references consistent with the rest of the document.
- Do not invent confidential or unknown business data.
- Keep tone concise and enterprise-ready.
- Use Cloudflare WAF as the shared enterprise L7 firewall service across all environments.
- Do not propose Azure Application Gateway WAF or a new dedicated Azure Firewall.`;

  const userPrompt = `Improve the following section of the document.

Application: ${applicationName}
Target section title: ${sectionTitle}

Full document context:
---
${fullDocument}
---

Current section content to improve:
---
${currentSectionContent}
---

Return only the improved section body content (without the heading line).`;

  try {
    const openAiContext = createOpenAiClientContext();
    const modelName = resolveOpenAiModel(openAiContext.usesAzure);
    req.log.info(
      { usesAzure: openAiContext.usesAzure, modelName, sectionTitle },
      "Regenerating single TDD section",
    );

    const completionParams = {
      model: modelName,
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userPrompt },
      ],
      max_completion_tokens: 4_000,
      stream: false as const,
    };
    const completion = await openAiContext.client.chat.completions.create(completionParams);

    const regenerated = sanitizeRegeneratedSection(
      sectionTitle,
      toCompletionText(completion.choices[0]?.message?.content),
    );
    if (regenerated.length === 0) {
      res.status(502).json({ error: "Section regeneration returned empty content." });
      return;
    }

    res.json({ sectionTitle, regenerated });
  } catch (error) {
    const userFacingError = toUserFacingGenerationError(error);
    req.log.error({ error, userFacingError, sectionTitle }, "Failed to regenerate section");
    res.status(502).json({ error: userFacingError });
  }
});

router.post("/follow-up", async (req, res) => {
  const parsedBody = parseFollowUpBody(req.body);
  if (!parsedBody) {
    res.status(400).json({
      error:
        "Invalid request body. Expected prompt/followUp + fullDocument (or supported aliases).",
    });
    return;
  }

  const { prompt, fullDocument, applicationName } = parsedBody;
  const systemPrompt = `You are an expert Azure cloud architect answering a follow-up request for a Technical Design Document.
Rules:
- Return markdown only.
- Respect enterprise constraints: shared Cloudflare WAF/L7 edge service is already in place.
- Do not propose Azure Application Gateway WAF.
- Do not propose creating a new dedicated Azure Firewall.
- Keep recommendations specific, actionable, and Azure-aligned.`;
  const userPrompt = `Application: ${applicationName}

Current document context:
---
${fullDocument}
---

Follow-up request:
${prompt}

Return a concise markdown response the architecture team can directly apply.`;

  try {
    const openAiContext = createOpenAiClientContext();
    const modelName = resolveOpenAiModel(openAiContext.usesAzure);
    const followUpParams = {
      model: modelName,
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userPrompt },
      ],
      max_completion_tokens: 3_000,
      stream: false as const,
    };
    const completion = await openAiContext.client.chat.completions.create(followUpParams);

    const responseText = enforceSharedEdgeSecurityConstraints(
      toCompletionText(completion.choices[0]?.message?.content).trim(),
    );
    if (responseText.length === 0) {
      res.status(502).json({ error: "Follow-up response returned empty content." });
      return;
    }

    res.json({
      response: responseText,
      followUpResponse: responseText,
    });
  } catch (error) {
    const userFacingError = toUserFacingGenerationError(error);
    req.log.error({ error, userFacingError }, "Failed to process follow-up");
    res.status(502).json({ error: userFacingError });
  }
});

export default router;
