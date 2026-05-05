import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getBlobStorageStatus } from "../lib/blob-storage";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  const blob = getBlobStorageStatus();
  res.json({
    ...data,
    blob,
  });
});

export default router;
