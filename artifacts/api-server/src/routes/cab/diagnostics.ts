import { Router, type IRouter } from "express";
import { createOpenAiClientContext, resolveOpenAiModel, toCompletionText } from "./openai-client.js";
import { requireRole } from "../../middleware/authenticate.js";

const router: IRouter = Router();

// GET /api/cab/diagnostics — admin/architect only: test Azure OpenAI connectivity
router.get("/diagnostics", requireRole("admin", "cloud_architect", "enterprise_architect"), async (req, res) => {
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT
        ? `${process.env.AZURE_OPENAI_ENDPOINT.slice(0, 40)}…` : "NOT SET",
      AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT ?? "NOT SET",
      AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION ?? "(default: 2024-08-01-preview)",
      AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY
        ? `****${process.env.AZURE_OPENAI_API_KEY.slice(-4)}` : "NOT SET",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? `****${process.env.OPENAI_API_KEY.slice(-4)}` : "NOT SET",
    },
  };

  try {
    const ctx = createOpenAiClientContext();
    const model = resolveOpenAiModel(ctx.usesAzure);
    result.provider = ctx.usesAzure ? "Azure OpenAI" : "Standard OpenAI";
    result.resolvedModel = model;

    const startMs = Date.now();
    const response = await Promise.race([
      ctx.client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 10,
        stream: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out after 15s")), 15_000),
      ),
    ]) as Awaited<ReturnType<typeof ctx.client.chat.completions.create>>;

    const latencyMs = Date.now() - startMs;
    const reply = toCompletionText(response.choices[0]?.message?.content ?? "");
    result.status = "ok";
    result.latencyMs = latencyMs;
    result.modelReply = reply.trim();
    result.finishReason = response.choices[0]?.finish_reason ?? "unknown";
    result.usage = response.usage;
    result.diagnosis = "Azure OpenAI connection is working correctly.";

    req.log.info({ model, latencyMs }, "CAB diagnostics: connection OK");
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.status = "error";
    result.error = msg;

    if (msg.includes("DeploymentNotFound") || msg.includes("404")) {
      result.diagnosis = `Deployment not found. The value of AZURE_OPENAI_DEPLOYMENT ('${process.env.AZURE_OPENAI_DEPLOYMENT ?? "not set"}') does not match any deployed model in your Azure OpenAI resource. Go to Azure Portal → Azure OpenAI → Model Deployments to see the exact deployment name.`;
    } else if (msg.includes("Unauthorized") || msg.includes("401") || msg.includes("invalid_api_key")) {
      result.diagnosis = "Authentication failed. AZURE_OPENAI_API_KEY is wrong or expired. Copy the key from Azure Portal → Azure OpenAI → Keys & Endpoint.";
    } else if (msg.includes("ENOTFOUND") || msg.includes("fetch failed") || msg.includes("ECONNREFUSED")) {
      result.diagnosis = `Cannot reach the endpoint. AZURE_OPENAI_ENDPOINT ('${process.env.AZURE_OPENAI_ENDPOINT ?? "not set"}') may be wrong or the Container App has no outbound internet access.`;
    } else if (msg.includes("timed out") || msg.includes("ETIMEDOUT")) {
      result.diagnosis = "Request timed out. The endpoint is reachable but not responding — check quota and model deployment status in Azure Portal.";
    } else if (msg.includes("No AI provider")) {
      result.diagnosis = "No AI provider configured. Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY + AZURE_OPENAI_DEPLOYMENT in Container App → Environment variables.";
    } else {
      result.diagnosis = "Unexpected error — see the error field above. Check Container App logs for more details.";
    }

    req.log.error({ err, msg }, "CAB diagnostics: connection failed");
    res.status(200).json(result); // 200 so the UI can read the diagnosis
  }
});

export default router;
