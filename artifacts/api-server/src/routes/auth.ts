import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  signToken,
  verifyToken,
  authenticate,
  COOKIE_NAME,
  JWT_EXPIRES_IN,
  type AuthUser,
} from "../middleware/authenticate.js";
import { loginRateLimiter } from "../middleware/rate-limit.js";

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
};

router.post("/login", loginRateLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const payload: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = signToken(payload);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  res.json({ user: payload });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
