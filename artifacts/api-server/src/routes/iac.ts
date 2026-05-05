import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authenticate";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.execute(sql`SELECT value FROM portal_settings WHERE key = ${key} LIMIT 1`);
  const row = rows.rows[0] as Record<string, string> | undefined;
  return row?.value ?? null;
}

async function appendLog(deploymentId: number, line: string) {
  const ts = new Date().toISOString().slice(11, 19);
  await db.execute(sql`
    UPDATE iac_deployments
    SET log = COALESCE(log || E'\n', '') || ${`[${ts}] ${line}`}
    WHERE id = ${deploymentId}
  `);
}

async function setStatus(deploymentId: number, status: string, extra: Record<string, unknown> = {}) {
  const completedAt = ["succeeded", "failed"].includes(status) ? new Date() : null;
  if (completedAt) {
    await db.execute(sql`
      UPDATE iac_deployments SET status = ${status}, completed_at = ${completedAt.toISOString()} WHERE id = ${deploymentId}
    `);
  } else {
    await db.execute(sql`UPDATE iac_deployments SET status = ${status} WHERE id = ${deploymentId}`);
  }
  if (extra.error) {
    await db.execute(sql`UPDATE iac_deployments SET error = ${extra.error as string} WHERE id = ${deploymentId}`);
  }
  if (extra.resources) {
    await db.execute(sql`UPDATE iac_deployments SET resources = ${JSON.stringify(extra.resources)}::jsonb WHERE id = ${deploymentId}`);
  }
}

async function runAzureDeployment(deploymentId: number, opts: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  resourceGroup: string;
  appName: string;
  region: string;
  adminPassword: string;
}) {
  const { tenantId, clientId, clientSecret, subscriptionId, resourceGroup, appName, region, adminPassword } = opts;
  const appShort = appName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "app";
  const pfx = `mf-${appShort}-demo`;

  try {
    const { ClientSecretCredential } = await import("@azure/identity");
    const { ResourceManagementClient } = await import("@azure/arm-resources");
    const { NetworkManagementClient } = await import("@azure/arm-network");
    const { ComputeManagementClient } = await import("@azure/arm-compute");

    const cred = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const resClient = new ResourceManagementClient(cred, subscriptionId);
    const netClient = new NetworkManagementClient(cred, subscriptionId);
    const compClient = new ComputeManagementClient(cred, subscriptionId);

    const tags = {
      Application: appName,
      Environment: "demo",
      Owner: "CCoE-Platform",
      ManagedBy: "Portal",
      Repo: "mccain-iac-demo",
    };

    await setStatus(deploymentId, "provisioning");

    await appendLog(deploymentId, "Creating Resource Group…");
    await resClient.resourceGroups.createOrUpdate(resourceGroup, { location: region, tags });
    await appendLog(deploymentId, `✓ Resource Group: ${resourceGroup}`);

    await appendLog(deploymentId, "Creating Virtual Network…");
    const vnetName = `${pfx}-vnet`;
    await (await netClient.virtualNetworks.beginCreateOrUpdate(resourceGroup, vnetName, {
      location: region, tags,
      addressSpace: { addressPrefixes: ["10.100.0.0/16"] },
    })).pollUntilDone();
    await appendLog(deploymentId, `✓ VNet: ${vnetName}`);

    await appendLog(deploymentId, "Creating Subnet…");
    const subnetName = "demo-subnet";
    await (await netClient.subnets.beginCreateOrUpdate(resourceGroup, vnetName, subnetName, {
      addressPrefix: "10.100.1.0/24",
    })).pollUntilDone();
    await appendLog(deploymentId, `✓ Subnet: ${subnetName}`);

    await appendLog(deploymentId, "Creating Network Security Group…");
    const nsgName = `${pfx}-nsg`;
    await (await netClient.networkSecurityGroups.beginCreateOrUpdate(resourceGroup, nsgName, {
      location: region, tags,
      securityRules: [
        { name: "AllowRDP", priority: 1001, direction: "Inbound", access: "Allow", protocol: "Tcp", sourcePortRange: "*", destinationPortRange: "3389", sourceAddressPrefix: "*", destinationAddressPrefix: "*" },
        { name: "DenyAllInbound", priority: 4096, direction: "Inbound", access: "Deny", protocol: "*", sourcePortRange: "*", destinationPortRange: "*", sourceAddressPrefix: "*", destinationAddressPrefix: "*" },
      ],
    })).pollUntilDone();
    await appendLog(deploymentId, `✓ NSG: ${nsgName}`);

    await appendLog(deploymentId, "Creating Public IP…");
    const pipName = `${pfx}-pip`;
    const pipResult = await (await netClient.publicIPAddresses.beginCreateOrUpdate(resourceGroup, pipName, {
      location: region, tags,
      publicIPAllocationMethod: "Static",
      sku: { name: "Standard" },
    })).pollUntilDone();
    await appendLog(deploymentId, `✓ Public IP: ${pipName} — ${pipResult.ipAddress ?? "pending"}`);

    await appendLog(deploymentId, "Creating Network Interface…");
    const nicName = `${pfx}-nic`;
    const subnetResult = await netClient.subnets.get(resourceGroup, vnetName, subnetName);
    const nsgResult = await netClient.networkSecurityGroups.get(resourceGroup, nsgName);
    const pipRef = await netClient.publicIPAddresses.get(resourceGroup, pipName);
    await (await netClient.networkInterfaces.beginCreateOrUpdate(resourceGroup, nicName, {
      location: region, tags,
      networkSecurityGroup: { id: nsgResult.id },
      ipConfigurations: [{
        name: "primary",
        subnet: { id: subnetResult.id },
        privateIPAllocationMethod: "Dynamic",
        publicIPAddress: { id: pipRef.id },
      }],
    })).pollUntilDone();
    await appendLog(deploymentId, `✓ NIC: ${nicName}`);

    await appendLog(deploymentId, "Provisioning Virtual Machine (this takes a few minutes)…");
    const vmName = `${pfx}-vm`;
    const nicRef = await netClient.networkInterfaces.get(resourceGroup, nicName);
    const vmResult = await (await compClient.virtualMachines.beginCreateOrUpdate(resourceGroup, vmName, {
      location: region, tags,
      hardwareProfile: { vmSize: "Standard_B2s" },
      osProfile: {
        computerName: vmName.slice(0, 15),
        adminUsername: "mccainadmin",
        adminPassword,
        windowsConfiguration: { enableAutomaticUpdates: true },
      },
      storageProfile: {
        osDisk: { caching: "ReadWrite", managedDisk: { storageAccountType: "StandardSSD_LRS" }, diskSizeGB: 128, createOption: "FromImage" },
        imageReference: { publisher: "MicrosoftWindowsServer", offer: "WindowsServer", sku: "2022-Datacenter", version: "latest" },
      },
      networkProfile: { networkInterfaces: [{ id: nicRef.id, primary: true }] },
      identity: { type: "SystemAssigned" },
    })).pollUntilDone();
    await appendLog(deploymentId, `✓ VM: ${vmName} (${vmResult.provisioningState ?? "created"})`);

    const finalPip = await netClient.publicIPAddresses.get(resourceGroup, pipName);
    const resources = {
      resourceGroup,
      vnet: vnetName,
      subnet: subnetName,
      nsg: nsgName,
      publicIp: finalPip.ipAddress ?? "allocated",
      nic: nicName,
      vm: vmName,
      vmSize: "Standard_B2s",
      os: "Windows Server 2022",
    };

    await setStatus(deploymentId, "succeeded", { resources });
    await appendLog(deploymentId, `✓ Deployment complete — Public IP: ${resources.publicIp}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, deploymentId }, "IaC deployment failed");
    await setStatus(deploymentId, "failed", { error: msg });
    await appendLog(deploymentId, `✗ Deployment failed: ${msg}`);
  }
}

router.post("/deploy", authenticate, requireRole("admin", "cloud_architect"), async (req, res) => {
  try {
    const { appName, region = "canadacentral", requestId, adminPassword } = req.body as {
      appName: string; region?: string; requestId?: number; adminPassword: string;
    };

    if (!appName || !adminPassword) {
      res.status(400).json({ error: "appName and adminPassword are required" });
      return;
    }

    const tenantId = await getSetting("azure_tenant_id");
    const clientId = await getSetting("azure_client_id");
    const clientSecret = await getSetting("azure_client_secret");
    const subscriptionId = await getSetting("azure_subscription_id");

    if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
      res.status(400).json({ error: "Azure subscription is not configured. Go to Integrations → Azure to set it up." });
      return;
    }

    const appShort = appName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "app";
    const resourceGroup = `mf-${appShort}-demo-rg`;

    const result = await db.execute(sql`
      INSERT INTO iac_deployments (request_id, subscription_id, resource_group, app_name, region, status)
      VALUES (${requestId ?? null}, ${subscriptionId}, ${resourceGroup}, ${appName}, ${region}, 'pending')
      RETURNING id
    `);
    const deploymentId = (result.rows[0] as Record<string, number>).id;

    void runAzureDeployment(deploymentId, {
      tenantId, clientId, clientSecret, subscriptionId,
      resourceGroup, appName, region, adminPassword,
    }).catch(() => {});

    res.json({ deploymentId, resourceGroup, status: "pending" });
  } catch (err) {
    logger.error({ err }, "Failed to start deployment");
    res.status(500).json({ error: "Failed to start deployment" });
  }
});

router.get("/deploy/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.execute(sql`
      SELECT id, request_id, subscription_id, resource_group, app_name, region, status, resources, log, error, started_at, completed_at
      FROM iac_deployments WHERE id = ${Number(id)} LIMIT 1
    `);
    if (!result.rows[0]) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }
    res.json({ deployment: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "Failed to get deployment");
    res.status(500).json({ error: "Failed to get deployment" });
  }
});

router.get("/deployments", authenticate, async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT id, request_id, resource_group, app_name, region, status, resources, error, started_at, completed_at
      FROM iac_deployments ORDER BY started_at DESC LIMIT 20
    `);
    res.json({ deployments: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to list deployments");
    res.status(500).json({ error: "Failed to list deployments" });
  }
});

export default router;
