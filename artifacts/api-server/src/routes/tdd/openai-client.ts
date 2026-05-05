import OpenAI, { AzureOpenAI } from "openai";

// ─── Azure OpenAI environment variables (preferred for Azure deployments) ────
// AZURE_OPENAI_API_KEY        — Key from Azure Portal → Azure OpenAI → Keys & Endpoint
// AZURE_OPENAI_ENDPOINT       — e.g. https://<resource>.openai.azure.com/
// AZURE_OPENAI_DEPLOYMENT     — Deployment name you gave the model (e.g. "gpt-4o")
// AZURE_OPENAI_API_VERSION    — API version (defaults to "2024-08-01-preview")
//
// ─── Standard OpenAI environment variables (fallback / local dev) ─────────
// OPENAI_API_KEY              — Key from platform.openai.com/api-keys
//
// ─── Replit AI Integrations (automatic when using the Replit integration) ──
// AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL, etc.
// ──────────────────────────────────────────────────────────────────────────

const AZURE_API_VERSION_DEFAULT = "2024-08-01-preview";
const OPENAI_MODEL_DEFAULT = "gpt-4o";

export interface OpenAiClientContext {
  client: OpenAI;
  usesAzure: boolean;
}

export function createOpenAiClientContext(): OpenAiClientContext {
  // ── Azure OpenAI ──────────────────────────────────────────────────────────
  const azureEndpoint =
    process.env.AZURE_OPENAI_ENDPOINT ??
    process.env.AI_INTEGRATIONS_OPENAI_ENDPOINT;

  if (azureEndpoint) {
    const apiKey =
      process.env.AZURE_OPENAI_API_KEY ??
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "AZURE_OPENAI_ENDPOINT is set but AZURE_OPENAI_API_KEY is missing. " +
        "Add it in Azure Portal → Azure OpenAI → Keys & Endpoint.",
      );
    }

    const apiVersion =
      process.env.AZURE_OPENAI_API_VERSION ??
      process.env.AI_INTEGRATIONS_OPENAI_API_VERSION ??
      AZURE_API_VERSION_DEFAULT;

    return {
      client: new AzureOpenAI({ apiKey, endpoint: azureEndpoint, apiVersion }),
      usesAzure: true,
    };
  }

  // ── Standard OpenAI (or Replit AI Integrations proxy) ────────────────────
  const apiKey =
    process.env.OPENAI_API_KEY ??
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "No AI provider configured. " +
      "For Azure OpenAI: set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY + AZURE_OPENAI_DEPLOYMENT. " +
      "For standard OpenAI: set OPENAI_API_KEY.",
    );
  }

  // Optional custom base URL (Replit AI Integrations proxy or Azure AI Foundry)
  const baseURL =
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??
    process.env.OPENAI_BASE_URL;

  return {
    client: new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) }),
    usesAzure: false,
  };
}

export function resolveOpenAiModel(usesAzure: boolean): string {
  if (usesAzure) {
    return (
      process.env.AZURE_OPENAI_DEPLOYMENT ??
      process.env.AI_INTEGRATIONS_OPENAI_MODEL ??
      OPENAI_MODEL_DEFAULT
    );
  }

  return (
    process.env.AI_INTEGRATIONS_OPENAI_MODEL ??
    OPENAI_MODEL_DEFAULT
  );
}

export function toUserFacingGenerationError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to generate TDD document";
  }

  const message = error.message;

  if (
    message.includes("DeploymentNotFound") ||
    message.includes("The API deployment for this resource does not exist") ||
    message.includes("404 Resource not found")
  ) {
    return "Azure OpenAI deployment was not found. Verify AZURE_OPENAI_DEPLOYMENT matches the deployment name in Azure Portal.";
  }

  if (
    message.includes("invalid_api_key") ||
    message.includes("Unauthorized") ||
    message.includes("401")
  ) {
    return "Azure OpenAI authentication failed. Verify AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in App Service Configuration.";
  }

  if (
    message.includes("fetch failed") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED")
  ) {
    return "Could not reach the AI endpoint. Check AZURE_OPENAI_ENDPOINT and ensure the App Service has outbound internet access.";
  }

  if (message.includes("content_filter") || message.includes("content management policy")) {
    return "Azure OpenAI content filter blocked the request. Review input or adjust Azure AI content filter settings.";
  }

  if (message.includes("rate limit") || message.includes("429") || message.includes("Too Many Requests")) {
    return "Azure OpenAI rate limit reached. Wait a moment and retry, or increase your deployment's TPM quota in Azure Portal.";
  }

  if (message.includes("timeout") || message.includes("ETIMEDOUT") || message.includes("ESOCKETTIMEDOUT")) {
    return "Azure OpenAI request timed out. The model may be overloaded — retry in a few seconds.";
  }

  return message;
}

export function toCompletionText(
  content: OpenAI.Chat.Completions.ChatCompletionMessage["content"],
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = content as Array<{ type: string; text?: string }>;
    return parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  }

  return "";
}
