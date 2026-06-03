export interface NamingInput {
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
}

const ORG_SHORT_FORMS: Record<string, string> = {
  "mccain foods":         "mf",
  "mccain":               "mf",
  "mccain foods ccoe":    "mf",
  "ccoe":                 "mf",
  "mccain foods ltd":     "mf",
  "mccain foods limited": "mf",
  "day & ross":           "dr",
  "day and ross":         "dr",
};

const LOB_SHORT_FORMS: Record<string, string> = {
  "digital agriculture":    "da",
  "digital manufacturing":  "dm",
  "digital technology":     "dt",
  "growth":                 "dg",
  "finance":                "fin",
  "supply chain":           "sc",
  "human resources":        "hr",
  "information technology": "it",
  "it":                     "it",
};

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function normalizeAlphaNumeric(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "")
    .replaceAll(/^-+|-+$/g, "");
}

export function normalizeNamingSegment(value: string): string {
  return normalizeToken(value);
}

export function sanitizeNamingSegment(value: string): string {
  return normalizeToken(value);
}

export function resolveOrgShortForm(organization: string): string {
  const key = organization.trim().toLowerCase();
  const mapped = ORG_SHORT_FORMS[key];
  if (mapped) return mapped;
  // Fall back: initials of each word (e.g. "Acme Corp" → "ac")
  const initials = organization
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toLowerCase() ?? "")
    .join("");
  return initials || normalizeAlphaNumeric(organization).slice(0, 4);
}

export function resolveLobShortForm(lineOfBusiness: string): string {
  const key = lineOfBusiness.trim().toLowerCase();
  const mapped = LOB_SHORT_FORMS[key];
  if (mapped) {
    return mapped;
  }
  return normalizeAlphaNumeric(lineOfBusiness);
}

export function getLobShortCode(lineOfBusiness: string): string {
  return resolveLobShortForm(lineOfBusiness);
}

export function getLobCode(lineOfBusiness: string): string {
  return resolveLobShortForm(lineOfBusiness);
}

export function buildNamingParts(input: NamingInput): {
  org: string;
  lobShort: string;
  app: string;
} {
  return {
    org:      resolveOrgShortForm(input.organization),
    lobShort: resolveLobShortForm(input.lineOfBusiness),
    app:      normalizeToken(input.applicationName),
  };
}

export function buildServiceNameTemplate(
  input: NamingInput,
  environment: string,
): string {
  const parts = buildNamingParts(input);
  const env = normalizeToken(environment);
  return `${parts.org}-cc-${parts.lobShort}-${parts.app}-${env}-<service-name>`;
}

export function buildSubscriptionName(
  input: NamingInput,
  environment: string,
): string {
  const parts = buildNamingParts(input);
  const env = normalizeToken(environment);
  return `${parts.org}-${parts.lobShort}-${parts.app}-${env}-sub`;
}

export function buildFoundationResourceGroupName(
  input: NamingInput,
  environment: string,
): string {
  const parts = buildNamingParts(input);
  const env = normalizeToken(environment);
  return `${parts.org}-cc-${parts.lobShort}-${parts.app}-foundation-${env}-rg`;
}

export function buildWorkloadResourceGroupName(
  input: NamingInput,
  environment: string,
): string {
  const parts = buildNamingParts(input);
  const env = normalizeToken(environment);
  return `${parts.org}-cc-${parts.lobShort}-${parts.app}-db-${env}-rg`;
}

export function buildVnetName(input: NamingInput, environment: string): string {
  const parts = buildNamingParts(input);
  const env = normalizeToken(environment);
  return `${parts.org}-cc-${parts.lobShort}-${parts.app}-${env}-vnet`;
}

export function buildSubnetNameTemplate(
  input: NamingInput,
  environment: string,
): string {
  const parts = buildNamingParts(input);
  const env = normalizeToken(environment);
  return `${parts.org}-cc-${parts.lobShort}-${parts.app}-${env}-snet`;
}

export function buildEnvironmentNaming(input: {
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  environment: string;
  serviceName: string;
}): {
  serviceName: string;
  subscriptionName: string;
  resourceGroupFoundation: string;
  resourceGroupDb: string;
  vnetName: string;
  subnetName: string;
} {
  const baseInput: NamingInput = {
    organization: input.organization,
    lineOfBusiness: input.lineOfBusiness,
    applicationName: input.applicationName,
  };

  return {
    serviceName: buildServiceNameTemplate(baseInput, input.environment).replace(
      "<service-name>",
      normalizeToken(input.serviceName),
    ),
    subscriptionName: buildSubscriptionName(baseInput, input.environment),
    resourceGroupFoundation: buildFoundationResourceGroupName(
      baseInput,
      input.environment,
    ),
    resourceGroupDb: buildWorkloadResourceGroupName(baseInput, input.environment),
    vnetName: buildVnetName(baseInput, input.environment),
    subnetName: buildSubnetNameTemplate(baseInput, input.environment),
  };
}

export function buildNamingConventionLines(data: {
  organization: string;
  lineOfBusiness: string;
  applicationName: string;
  environments: string[];
}): string {
  const input: NamingInput = {
    organization: data.organization,
    lineOfBusiness: data.lineOfBusiness,
    applicationName: data.applicationName,
  };

  return data.environments
    .map((environment) => {
      return `
**Environment: ${environment}**
- Azure Service Name Template: ${buildServiceNameTemplate(input, environment)}
- Subscription: ${buildSubscriptionName(input, environment)}
- Resource Group (Foundation/Landing Zone): ${buildFoundationResourceGroupName(input, environment)}
- Resource Group (Database/Services): ${buildWorkloadResourceGroupName(input, environment)}
- VNet: ${buildVnetName(input, environment)}
- Subnet Template: ${buildSubnetNameTemplate(input, environment)}`;
    })
    .join("\n");
}

export function sanitizeNamePart(value: string): string {
  return normalizeToken(value);
}
