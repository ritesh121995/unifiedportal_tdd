import { Router, type IRouter } from "express";
import { AnalyzeCidrBody } from "@workspace/api-zod";
import { sanitizeNamePart } from "./naming-conventions";

const router: IRouter = Router();

function ipToNum(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + Number.parseInt(octet, 10), 0) >>> 0
  );
}

function numToIp(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join(".");
}

function parseCidr(cidr: string): { networkAddress: number; prefix: number; totalHosts: number } {
  const [ip, prefixStr] = cidr.split("/");
  const prefix = Number.parseInt(prefixStr, 10);
  const networkAddress = ipToNum(ip) & (~((1 << (32 - prefix)) - 1) >>> 0);
  const totalHosts = Math.pow(2, 32 - prefix) - 2;
  return { networkAddress, prefix, totalHosts };
}

router.post("/subnet-analysis", (req, res) => {
  const parseResult = AnalyzeCidrBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { cidr, environments, applicationName, organization, lineOfBusiness } = parseResult.data;

  let networkAddress: number;
  let prefix: number;
  let totalHosts: number;

  try {
    ({ networkAddress, prefix, totalHosts } = parseCidr(cidr));
  } catch {
    res.status(400).json({ error: "Invalid CIDR format" });
    return;
  }

  const org = sanitizeNamePart(organization).replaceAll("-", "");
  const lob = sanitizeNamePart(lineOfBusiness).replaceAll("-", "");
  const appName = sanitizeNamePart(applicationName).replaceAll("-", "");

  // Calculate subnets - divide into env-based subnets + foundation subnet
  const subnets: Array<{ name: string; cidr: string; purpose: string; size: number }> = [];
  const recommendations: string[] = [];

  // Foundation/landing zone subnet is always first (always /27 = 32 hosts)
  const foundationPrefix = Math.min(prefix + 4, 28);
  const subnetSize = Math.pow(2, 32 - foundationPrefix);
  let currentAddress = networkAddress;

  // Foundation subnet
  subnets.push({
    name: `${org}-cc-${lob}-${appName}-foundation-snet`,
    cidr: `${numToIp(currentAddress)}/${foundationPrefix}`,
    purpose: "Foundation/Landing Zone resources (Azure Bastion, Azure Firewall, Management VMs)",
    size: subnetSize - 5, // Azure reserves 5 addresses
  });
  currentAddress += subnetSize;

  // Per-environment subnets
  for (const env of environments) {
    const envLower = env.toLowerCase();
    if (currentAddress >= networkAddress + Math.pow(2, 32 - prefix)) break;
    subnets.push({
      name: `${org}-cc-${lob}-${appName}-${envLower}-snet`,
      cidr: `${numToIp(currentAddress)}/${foundationPrefix}`,
      purpose: `${env} environment workloads`,
      size: subnetSize - 5,
    });
    currentAddress += subnetSize;
  }

  // Database subnet (if environments include prod)
  if (environments.includes("Prod") && currentAddress < networkAddress + Math.pow(2, 32 - prefix)) {
    subnets.push({
      name: `${org}-cc-${lob}-${appName}-db-snet`,
      cidr: `${numToIp(currentAddress)}/${foundationPrefix}`,
      purpose: "Database/Data tier resources",
      size: subnetSize - 5,
    });
    currentAddress += subnetSize;
  }

  // Gateway subnet (if applicable)
  if (currentAddress < networkAddress + Math.pow(2, 32 - prefix)) {
    subnets.push({
      name: "GatewaySubnet",
      cidr: `${numToIp(currentAddress)}/${Math.min(foundationPrefix, 27)}`,
      purpose: "Azure VPN/ExpressRoute Gateway",
      size: subnetSize - 5,
    });
  }

  recommendations.push(`Total available hosts in CIDR ${cidr}: ${totalHosts}`);
  recommendations.push(`Recommended subnet prefix: /${foundationPrefix} (${subnetSize - 5} usable hosts per subnet)`);
  recommendations.push(`${subnets.length} subnets planned across ${environments.length} environment(s) + foundation`);
  recommendations.push("Azure reserves 5 IP addresses per subnet (network, broadcast, gateway, DHCP, future use)");
  recommendations.push("Ensure NSGs are applied to each subnet for network segmentation");
  if (prefix <= 16) {
    recommendations.push("Consider using /24 subnets per environment for adequate IP address space growth");
  }

  res.json({
    vnetCidr: cidr,
    totalHosts,
    subnets,
    recommendations,
  });
});

export default router;
