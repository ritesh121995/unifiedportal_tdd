import { Router, type IRouter } from "express";
import { PreviewNamingBody } from "@workspace/api-zod";
import {
  buildNamingParts,
  buildServiceNameTemplate,
  buildSubscriptionName,
  buildFoundationResourceGroupName,
  buildWorkloadResourceGroupName,
  buildVnetName,
  buildSubnetNameTemplate,
  resolveLobShortForm,
} from "./naming-conventions";

const router: IRouter = Router();

router.post("/naming-preview", (req, res) => {
  const parseResult = PreviewNamingBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { organization, lineOfBusiness, applicationName, environments, region } = parseResult.data;

  const parts = buildNamingParts({
    organization,
    lineOfBusiness,
    applicationName,
  });
  const lobShortCode = resolveLobShortForm(lineOfBusiness);

  const result: Record<string, object> = {};

  for (const env of environments) {
    result[env] = {
      subscriptionName: buildSubscriptionName(
        { organization, lineOfBusiness, applicationName },
        env,
      ),
      resourceGroupFoundation: buildFoundationResourceGroupName(
        { organization, lineOfBusiness, applicationName },
        env,
      ),
      resourceGroupDb: buildWorkloadResourceGroupName(
        { organization, lineOfBusiness, applicationName },
        env,
      ),
      vnetName: buildVnetName({ organization, lineOfBusiness, applicationName }, env),
      subnetName: buildSubnetNameTemplate(
        { organization, lineOfBusiness, applicationName },
        env,
      ),
      serviceNameExample: buildServiceNameTemplate(
        { organization, lineOfBusiness, applicationName },
        env,
      ),
      lobShortCode,
      region,
      normalizedOrg: parts.org,
      normalizedAppName: parts.app,
    };
  }

  res.json({ environments: result });
});

export default router;
