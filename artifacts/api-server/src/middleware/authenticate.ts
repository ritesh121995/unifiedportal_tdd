import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const DEFAULT_JWT_SECRET = "unified-portal-dev-secret-change-in-prod";
const MIN_PRODUCTION_SECRET_LENGTH = 32;
export const JWT_SECRET = getJwtSecret();
export const JWT_EXPIRES_IN = "8h";
export const COOKIE_NAME = "portal_token";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME] ?? extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }
    // "admin" role bypasses all role restrictions
    if (req.user.role === "admin" || roles.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden: insufficient role" });
  };
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function getJwtSecret(): string {
  const configuredSecret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (configuredSecret && configuredSecret.length >= MIN_PRODUCTION_SECRET_LENGTH) {
    return configuredSecret;
  }

  if (isProduction) {
    throw new Error("JWT_SECRET must be set to at least 32 characters before starting in production.");
  }

  return configuredSecret ?? DEFAULT_JWT_SECRET;
}
