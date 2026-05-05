import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first proxy hop (Replit's reverse proxy) so that express-rate-limit
// and other middleware can correctly read the client IP from X-Forwarded-For.
app.set("trust proxy", 1);

// Restrict CORS to the configured allowed origin, or reflect the same-origin
// request in development. In production the ALLOWED_ORIGIN env var should be
// set to the exact App Service / Replit domain so cross-site requests are blocked.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
const apiCors = cors({
  origin: allowedOrigin
    ? (origin, cb) => {
        if (!origin || origin === allowedOrigin) cb(null, true);
        else cb(new Error("CORS: origin not allowed"));
      }
    : true,
  credentials: true,
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiCors, router);

// Global error handler for /api routes — always returns JSON, never HTML.
// Must be registered AFTER the router and have exactly 4 parameters.
app.use("/api", (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled API error");
  if (!res.headersSent) {
    const isDev = process.env.NODE_ENV !== "production";
    res.status(500).json({ error: isDev ? (err.message || "Internal server error") : "Internal server error" });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../public");
const frontendEntry = path.join(frontendDir, "index.html");
const hasFrontendBuild = existsSync(frontendEntry);

if (hasFrontendBuild) {
  app.use(express.static(frontendDir));

  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(frontendEntry);
  });
} else {
  logger.warn(
    { frontendDir },
    "Frontend build was not found; serving API routes only",
  );
}

export default app;
