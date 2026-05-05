import { useEffect, useState } from "react";
import {
  Loader2, Save, Plug, Link2, ExternalLink, RefreshCw, Bell,
  Cloud, BookOpen, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getApiBase } from "@/lib/api-base";

type SaveKey =
  | "teams"
  | "leanix"
  | "azure"
  | "confluence";

export default function Integrations() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SaveKey | null>(null);
  const [saved, setSaved] = useState<SaveKey | null>(null);

  const [teamsWebhook, setTeamsWebhook] = useState("");

  const [leanixUrl, setLeanixUrl] = useState("");
  const [leanixToken, setLeanixToken] = useState("");
  const [leanixWorkspace, setLeanixWorkspace] = useState("");
  const [testLeanIXStatus, setTestLeanIXStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");

  const [azureTenantId, setAzureTenantId] = useState("");
  const [azureClientId, setAzureClientId] = useState("");
  const [azureClientSecret, setAzureClientSecret] = useState("");
  const [azureSubscriptionId, setAzureSubscriptionId] = useState("");

  const [confluenceUrl, setConfluenceUrl] = useState("");
  const [confluenceEmail, setConfluenceEmail] = useState("");
  const [confluenceToken, setConfluenceToken] = useState("");
  const [confluenceSpaceKey, setConfluenceSpaceKey] = useState("");
  const [confluenceParentPageId, setConfluenceParentPageId] = useState("");
  const [testConfluenceStatus, setTestConfluenceStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testConfluenceMsg, setTestConfluenceMsg] = useState("");

  useEffect(() => {
    fetch(`${getApiBase()}/api/settings`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const s: Record<string, string> = d.settings ?? {};
        setSettings(s);
        setTeamsWebhook(s["teams_webhook_url"] ?? "");
        setLeanixUrl(s["leanix_api_url"] ?? "");
        setLeanixToken(s["leanix_api_token"] ?? "");
        setLeanixWorkspace(s["leanix_workspace"] ?? "");
        setAzureTenantId(s["azure_tenant_id"] ?? "");
        setAzureClientId(s["azure_client_id"] ?? "");
        setAzureClientSecret(s["azure_client_secret"] ?? "");
        setAzureSubscriptionId(s["azure_subscription_id"] ?? "");
        setConfluenceUrl(s["confluence_url"] ?? "");
        setConfluenceEmail(s["confluence_email"] ?? "");
        setConfluenceToken(s["confluence_api_token"] ?? "");
        setConfluenceSpaceKey(s["confluence_space_key"] ?? "");
        setConfluenceParentPageId(s["confluence_parent_page_id"] ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  const putSetting = (key: string, value: string) =>
    fetch(`${getApiBase()}/api/settings/${key}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });

  const saveGroup = async (key: SaveKey, pairs: [string, string][]) => {
    setSaving(key);
    setSaved(null);
    try {
      await Promise.all(pairs.map(([k, v]) => putSetting(k, v)));
      const updates: Record<string, string> = {};
      pairs.forEach(([k, v]) => (updates[k] = v));
      setSettings((p) => ({ ...p, ...updates }));
      setSaved(key);
      setTimeout(() => setSaved(null), 3000);
    } finally {
      setSaving(null);
    }
  };

  const isAzureConfigured = !!(settings["azure_tenant_id"] && settings["azure_client_id"] && settings["azure_subscription_id"]);
  const isConfluenceConfigured = !!(settings["confluence_url"] && settings["confluence_email"] && settings["confluence_api_token"] && settings["confluence_space_key"]);

  const testConfluence = async () => {
    setTestConfluenceStatus("testing");
    setTestConfluenceMsg("");
    try {
      const r = await fetch(`${getApiBase()}/api/confluence/test`, { method: "POST", credentials: "include" });
      const d = await r.json() as { ok: boolean; error?: string; spacesVisible?: number };
      if (d.ok) {
        setTestConfluenceStatus("ok");
        setTestConfluenceMsg(`Connected — ${d.spacesVisible ?? 0} space(s) visible`);
      } else {
        setTestConfluenceStatus("error");
        setTestConfluenceMsg(d.error ?? "Connection failed");
      }
    } catch {
      setTestConfluenceStatus("error");
      setTestConfluenceMsg("Could not reach Confluence");
    }
    setTimeout(() => setTestConfluenceStatus("idle"), 6000);
  };

  const testLeanIX = () => {
    setTestLeanIXStatus("testing");
    setTimeout(() => {
      setTestLeanIXStatus("ok");
      setTimeout(() => setTestLeanIXStatus("idle"), 4000);
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>Integrations</h1>
        <p className="text-slate-500 text-sm mt-1">Connect the portal to external platforms and notification channels</p>
      </div>

      {/* ─── Microsoft Teams ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Microsoft Teams Notifications</CardTitle>
              <CardDescription>Send status-change alerts to a Teams channel via Incoming Webhook</CardDescription>
            </div>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${settings["teams_webhook_url"] ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {settings["teams_webhook_url"] ? "Active" : "Not configured"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Incoming Webhook URL</Label>
            <Input
              placeholder="https://mccain.webhook.office.com/webhookb2/..."
              value={teamsWebhook}
              onChange={(e) => setTeamsWebhook(e.target.value)}
            />
            <p className="text-xs text-slate-400">
              Create an Incoming Webhook connector in your Teams channel settings.{" "}
              <a href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-500 hover:underline">
                How to set up <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => void saveGroup("teams", [["teams_webhook_url", teamsWebhook]])} disabled={saving === "teams"} style={{ background: "#FFCD00", color: "#1a1a2e" }} className="gap-2">
              {saving === "teams" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving === "teams" ? "Saving…" : "Save Webhook"}
            </Button>
            {saved === "teams" && <span className="text-sm text-green-600 font-medium">✓ Saved!</span>}
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1">
            <p className="font-medium">Notifications sent when:</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-700">
              <li>A new Architecture Review Request is submitted</li>
              <li>EA approves or rejects a request</li>
              <li>TDD generation completes</li>
              <li>IaC deployment starts or finishes</li>
              <li>DevSecOps / FinOps activation</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ─── Azure Subscription ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#0078d4" }}>
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Azure Subscription</CardTitle>
              <CardDescription>Service Principal credentials used to deploy IaC resources from this portal</CardDescription>
            </div>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${isAzureConfigured ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {isAzureConfigured ? "Configured" : "Not configured"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-1">
            <p className="font-semibold text-slate-800">How to create a Service Principal</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>In Azure Portal → Azure Active Directory → App registrations → New registration</li>
              <li>Give it a name (e.g. <code className="bg-slate-100 px-1 rounded">mccain-portal-iac</code>)</li>
              <li>Under Certificates &amp; secrets → New client secret — copy the value immediately</li>
              <li>In your Subscription → IAM → Add role assignment → Contributor → select the app</li>
            </ol>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tenant ID (Directory ID)</Label>
              <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={azureTenantId} onChange={(e) => setAzureTenantId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Subscription ID</Label>
              <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={azureSubscriptionId} onChange={(e) => setAzureSubscriptionId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Client ID (Application ID)</Label>
              <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={azureClientId} onChange={(e) => setAzureClientId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <Input type="password" placeholder="••••••••••••••••••••" value={azureClientSecret} onChange={(e) => setAzureClientSecret(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void saveGroup("azure", [
                ["azure_tenant_id", azureTenantId],
                ["azure_client_id", azureClientId],
                ["azure_client_secret", azureClientSecret],
                ["azure_subscription_id", azureSubscriptionId],
              ])}
              disabled={saving === "azure"}
              style={{ background: "#FFCD00", color: "#1a1a2e" }}
              className="gap-2"
            >
              {saving === "azure" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving === "azure" ? "Saving…" : "Save Credentials"}
            </Button>
            {saved === "azure" && <span className="text-sm text-green-600 font-medium">✓ Azure credentials saved</span>}
          </div>
          <div className="border-t pt-4 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-600">Resources the portal will provision (demo environment only)</p>
            <div className="grid grid-cols-3 gap-2">
              {["Resource Group", "Virtual Network + Subnet", "NSG", "Public IP", "Network Interface", "Windows VM (Standard_B2s)"].map((r) => (
                <span key={r} className="bg-slate-100 rounded px-2 py-1 text-slate-600">{r}</span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Confluence ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#0052CC" }}>
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Confluence</CardTitle>
              <CardDescription>Publish reviewed TDD documents directly to your Confluence space</CardDescription>
            </div>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${isConfluenceConfigured ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {isConfluenceConfigured ? "Connected" : "Not configured"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Confluence Cloud URL</Label>
              <Input placeholder="https://mccainfoods.atlassian.net" value={confluenceUrl} onChange={(e) => setConfluenceUrl(e.target.value)} />
              <p className="text-xs text-slate-400">Your Atlassian Cloud base URL (no trailing slash)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Atlassian Account Email</Label>
              <Input type="email" placeholder="you@mccain.com" value={confluenceEmail} onChange={(e) => setConfluenceEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>API Token</Label>
              <Input type="password" placeholder="••••••••••••••••••••" value={confluenceToken} onChange={(e) => setConfluenceToken(e.target.value)} />
              <p className="text-xs text-slate-400">
                <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-500 hover:underline">
                  Generate an API token <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Space Key</Label>
              <Input placeholder="MCCAIN" value={confluenceSpaceKey} onChange={(e) => setConfluenceSpaceKey(e.target.value)} />
              <p className="text-xs text-slate-400">The Confluence space where TDDs will be published (e.g. MCCAIN, CCoE)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Parent Page ID <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input placeholder="123456789" value={confluenceParentPageId} onChange={(e) => setConfluenceParentPageId(e.target.value)} />
              <p className="text-xs text-slate-400">Numeric ID of the parent page. Find it in the page URL: /wiki/spaces/…/pages/<strong>123456789</strong></p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => void saveGroup("confluence", [
                ["confluence_url", confluenceUrl],
                ["confluence_email", confluenceEmail],
                ["confluence_api_token", confluenceToken],
                ["confluence_space_key", confluenceSpaceKey],
                ["confluence_parent_page_id", confluenceParentPageId],
              ])}
              disabled={saving === "confluence"}
              style={{ background: "#FFCD00", color: "#1a1a2e" }}
              className="gap-2"
            >
              {saving === "confluence" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving === "confluence" ? "Saving…" : "Save Credentials"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void testConfluence()}
              disabled={testConfluenceStatus === "testing" || !confluenceUrl || !confluenceEmail || !confluenceToken}
              className="gap-2"
            >
              {testConfluenceStatus === "testing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Test Connection
            </Button>
            {saved === "confluence" && <span className="text-sm text-green-600 font-medium">✓ Confluence credentials saved</span>}
            {testConfluenceStatus === "ok" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <CheckCircle2 className="w-4 h-4" />{testConfluenceMsg}
              </span>
            )}
            {testConfluenceStatus === "error" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-red-600 font-medium">
                <XCircle className="w-4 h-4" />{testConfluenceMsg}
              </span>
            )}
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1">
            <p className="font-medium">How TDD publishing works</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
              <li>Cloud Architect completes the sign-off review on the TDD</li>
              <li>Click "Publish to Confluence" on the TDD page</li>
              <li>The portal converts the markdown document to Confluence HTML and creates a new page in the configured space</li>
              <li>A link to the published page is returned and shown inline</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* ─── LeanIX Integration ────────────────────────────────────────── */}
      <Card className="relative overflow-hidden">
        <div className="absolute top-3 right-3">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
            Coming Soon
          </span>
        </div>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-slate-200 bg-white p-1">
              <Link2 className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <CardTitle className="text-base">LeanIX Enterprise Architecture</CardTitle>
              <CardDescription>Sync approved applications to the McCain LeanIX Application Portfolio</CardDescription>
            </div>
            <span className={`ml-auto mr-20 text-xs px-2 py-0.5 rounded-full font-medium ${(settings["leanix_api_url"] && settings["leanix_api_token"]) ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {(settings["leanix_api_url"] && settings["leanix_api_token"]) ? "Configured" : "Not configured"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-medium mb-1">Integration under development</p>
            <p>Once active, this integration will automatically register applications in LeanIX when a request reaches <strong>FinOps Active</strong> status.</p>
          </div>
          <div className="space-y-4 opacity-75">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>LeanIX API Host URL</Label>
                <Input placeholder="https://mccain.leanix.net" value={leanixUrl} onChange={(e) => setLeanixUrl(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Workspace Name</Label>
                <Input placeholder="mccain-foods" value={leanixWorkspace} onChange={(e) => setLeanixWorkspace(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>API Token</Label>
              <Input type="password" placeholder="••••••••••••••••••••••••••••••••" value={leanixToken} onChange={(e) => setLeanixToken(e.target.value)} />
              <p className="text-xs text-slate-400">
                <a href="https://docs-eam.leanix.net/docs/authentication" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-500 hover:underline">
                  LeanIX Docs <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={() => void saveGroup("leanix", [["leanix_api_url", leanixUrl], ["leanix_api_token", leanixToken], ["leanix_workspace", leanixWorkspace]])} disabled={saving === "leanix"} style={{ background: "#FFCD00", color: "#1a1a2e" }} className="gap-2">
              {saving === "leanix" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving === "leanix" ? "Saving…" : "Save Credentials"}
            </Button>
            <Button variant="outline" onClick={testLeanIX} disabled={testLeanIXStatus === "testing" || !leanixUrl || !leanixToken} className="gap-2">
              {testLeanIXStatus === "testing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Test Connection
            </Button>
            {saved === "leanix" && <span className="text-sm text-green-600 font-medium">✓ Credentials saved</span>}
            {testLeanIXStatus === "ok" && <span className="text-sm text-amber-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Not yet active — credentials saved for future use</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Plug className="w-3.5 h-3.5 shrink-0" />
            <span>Contact your CCoE team or the McCain LeanIX administrator to obtain credentials.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
