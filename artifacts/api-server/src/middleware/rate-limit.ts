import rateLimit from "express-rate-limit";

const isProduction = process.env.NODE_ENV === "production";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

const generateWindowMs = parsePositiveInt(
  process.env.TDD_GENERATE_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
const generateMax = parsePositiveInt(
  process.env.TDD_GENERATE_RATE_LIMIT_MAX,
  isProduction ? 20 : 100,
);

export const tddGenerateRateLimiter = rateLimit({
  windowMs: generateWindowMs,
  limit: generateMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many generation requests. Please try again later." },
});

// Login brute-force protection: max 10 attempts per 15 minutes per IP.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 10 : 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});
