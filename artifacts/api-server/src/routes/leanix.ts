import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { getSetting } from "./settings.js";

const router = Router();
router.use(authenticate);

interface LeanIXTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface LeanIXUser {
  displayName: string;
  email: string;
}

interface LeanIXSubscriptionRole {
  name: string;
}

interface LeanIXSubscription {
  user: LeanIXUser;
  roles: LeanIXSubscriptionRole[];
}

interface LeanIXLifecyclePhase {
  phase: string;
  startDate: string | null;
}

interface LeanIXTag {
  name: string;
}

interface LeanIXInitiativeNode {
  id: string;
  displayName: string;
  description: string | null;
  lifecycle?: { phases: LeanIXLifecyclePhase[] } | null;
  subscriptions: { edges: { node: LeanIXSubscription }[] };
  tags: LeanIXTag[];
}

interface LeanIXGraphQLResponse {
  data?: {
    allFactSheets?: {
      edges: { node: LeanIXInitiativeNode }[];
    };
  };
  errors?: { message: string }[];
}

export interface MappedInitiative {
  id: string;
  displayName: string;
  description: string;
  businessOwner: string;
  businessOwnerEmail: string;
  itOwner: string;
  itOwnerEmail: string;
  targetGoLiveDate: string;
  tags: string[];
  lifecyclePhase: string;
}

async function getLeanIXToken(host: string, apiToken: string): Promise<string> {
  const tokenUrl = `${host}/services/mtm/v1/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: "apitoken",
    client_secret: apiToken,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LeanIX auth failed (${res.status}): ${text}`);
  }

  const data = await res.json() as LeanIXTokenResponse;
  return data.access_token;
}

function mapInitiative(node: LeanIXInitiativeNode): MappedInitiative {
  const subscriptions = node.subscriptions.edges.map((e) => e.node);

  const responsible = subscriptions.find((s) =>
    s.roles.some((r) => ["Responsible", "BusinessOwner", "Business Owner"].includes(r.name))
  );
  const itOwnerSub = subscriptions.find((s) =>
    s.roles.some((r) => ["IT Owner", "ITOwner", "Technical Owner"].includes(r.name))
  );

  // Pick a go-live date: prefer "phaseIn" or "active" phase start date
  const PHASE_PRIORITY = ["phaseIn", "active", "plan", "endOfLife"];
  let targetGoLiveDate = "";
  if (node.lifecycle?.phases) {
    for (const priority of PHASE_PRIORITY) {
      const found = node.lifecycle.phases.find((p) => p.phase === priority && p.startDate);
      if (found?.startDate) {
        // Convert from LeanIX ISO date string to YYYY-MM-DD
        targetGoLiveDate = found.startDate.slice(0, 10);
        break;
      }
    }
  }

  // Current lifecycle phase (last active phase)
  const lifecyclePhase =
    node.lifecycle?.phases?.find((p) => ["active", "phaseIn"].includes(p.phase))?.phase ??
    node.lifecycle?.phases?.[0]?.phase ??
    "";

  return {
    id: node.id,
    displayName: node.displayName,
    description: node.description ?? "",
    businessOwner: responsible?.user.displayName ?? "",
    businessOwnerEmail: responsible?.user.email ?? "",
    itOwner: itOwnerSub?.user.displayName ?? "",
    itOwnerEmail: itOwnerSub?.user.email ?? "",
    targetGoLiveDate,
    tags: node.tags.map((t) => t.name),
    lifecyclePhase,
  };
}

const INITIATIVES_GQL = `
{
  allFactSheets(
    filter: { facetFilters: [{ facetKey: "FactSheetTypes", operator: OR, keys: ["Initiative"] }] }
    first: 100
  ) {
    edges {
      node {
        id
        displayName
        description
        ... on Initiative {
          lifecycle {
            phases {
              phase
              startDate
            }
          }
        }
        subscriptions {
          edges {
            node {
              user {
                displayName
                email
              }
              roles {
                name
              }
            }
          }
        }
        tags {
          name
        }
      }
    }
  }
}
`;

/**
 * GET /api/leanix/initiatives
 * Returns a list of LeanIX Initiatives mapped to portal request form fields.
 * Requires leanix_api_url and leanix_api_token to be configured in portal settings.
 */
router.get("/initiatives", async (_req, res) => {
  try {
    const [apiUrl, apiToken] = await Promise.all([
      getSetting("leanix_api_url"),
      getSetting("leanix_api_token"),
    ]);

    if (!apiUrl || !apiToken) {
      res.status(503).json({
        error: "LeanIX is not configured. Go to Settings → Integrations to add your LeanIX credentials.",
        notConfigured: true,
      });
      return;
    }

    const host = apiUrl.replace(/\/$/, "");
    const token = await getLeanIXToken(host, apiToken);

    const gqlUrl = `${host}/services/pathfinder/v1/graphql`;
    const gqlRes = await fetch(gqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: INITIATIVES_GQL }),
    });

    if (!gqlRes.ok) {
      const text = await gqlRes.text();
      throw new Error(`LeanIX GraphQL request failed (${gqlRes.status}): ${text}`);
    }

    const gqlData = await gqlRes.json() as LeanIXGraphQLResponse;

    if (gqlData.errors?.length) {
      throw new Error(`LeanIX GraphQL error: ${gqlData.errors.map((e) => e.message).join(", ")}`);
    }

    const edges = gqlData.data?.allFactSheets?.edges ?? [];
    const initiatives = edges.map((e) => mapInitiative(e.node));

    res.json({ initiatives });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch LeanIX initiatives";
    console.error("[leanix]", message);
    res.status(502).json({ error: message });
  }
});

export default router;
