import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, desc, isNull, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, otpChallenges } from "@/db/schema";
import { config } from "./config";
import { hmac, randomToken, safeEqualHex, sha256, sixDigitCode } from "./crypto";
import { sendSmsNow } from "./notify";
import { normalizeUgPhone } from "./rules";

export const SESSION_COOKIE = "ekifo_session";
const SESSION_DAYS = 30;
const OTP_TTL_MIN = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_COOLDOWN_SEC = 45;
const OTP_MAX_PER_HOUR = 5;

export type SessionUser = typeof users.$inferSelect;
export type Role = SessionUser["role"];

// ─── OTP ─────────────────────────────────────────────────────────────────────
export type OtpRequestResult = { ok: true; phone: string } | { ok: false; error: string; retryAfterSec?: number };

export async function requestOtp(rawPhone: string): Promise<OtpRequestResult> {
  const phone = normalizeUgPhone(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid Ugandan mobile number, e.g. 0772 123 456." };

  // Rate limits live in Postgres so they hold across serverless instances.
  const recent = await db
    .select({ createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), gte(otpChallenges.createdAt, new Date(Date.now() - 3_600_000))))
    .orderBy(desc(otpChallenges.createdAt));
  if (recent.length >= OTP_MAX_PER_HOUR)
    return { ok: false, error: "Too many codes requested. Try again in an hour." };
  if (recent[0]) {
    const waited = (Date.now() - recent[0].createdAt.getTime()) / 1000;
    if (waited < OTP_COOLDOWN_SEC) {
      const retryAfterSec = Math.ceil(OTP_COOLDOWN_SEC - waited);
      return { ok: false, error: `Wait ${retryAfterSec}s before requesting another code.`, retryAfterSec };
    }
  }

  const code = sixDigitCode();
  await db.insert(otpChallenges).values({
    phone,
    codeHash: hmac("otp", `${phone}:${code}`),
    expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
  });
  try {
    await sendSmsNow(phone, `${code} is your FindEkifo code. It expires in ${OTP_TTL_MIN} minutes. Never share it.`);
  } catch (e) {
    console.error("OTP send failed", e);
    return { ok: false, error: "We couldn't send the SMS right now. Please try again." };
  }
  return { ok: true, phone };
}

export type OtpVerifyResult = { ok: true; user: SessionUser; isNew: boolean } | { ok: false; error: string };

export async function verifyOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code." };

  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1)
      .for("update");
    if (!challenge) return { ok: false as const, error: "That code has expired. Request a new one." };
    if (challenge.attempts >= OTP_MAX_ATTEMPTS)
      return { ok: false as const, error: "Too many wrong attempts. Request a new code." };

    if (!safeEqualHex(challenge.codeHash, hmac("otp", `${phone}:${code}`))) {
      await tx.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.id, challenge.id));
      const left = OTP_MAX_ATTEMPTS - challenge.attempts - 1;
      return { ok: false as const, error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Request a new code." };
    }
    await tx.update(otpChallenges).set({ consumedAt: new Date() }).where(eq(otpChallenges.id, challenge.id));

    const isAdmin = config().adminPhones.has(phone);
    const [existing] = await tx.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (existing) {
      if (existing.suspendedAt) return { ok: false as const, error: "This account is suspended. Contact support." };
      if (isAdmin && existing.role !== "ADMIN") {
        const [u] = await tx.update(users).set({ role: "ADMIN" }).where(eq(users.id, existing.id)).returning();
        return { ok: true as const, user: u, isNew: false };
      }
      return { ok: true as const, user: existing, isNew: false };
    }
    const [created] = await tx
      .insert(users)
      .values({ phone, role: isAdmin ? "ADMIN" : "SEEKER" })
      .onConflictDoNothing()
      .returning();
    const user = created ?? (await tx.select().from(users).where(eq(users.phone, phone)))[0];
    return { ok: true as const, user, isNew: Boolean(created) };
  });
}

// ─── Sessions ────────────────────────────────────────────────────────────────
export async function startSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Current user or null. Memoised per request, so layouts and pages share one DB hit. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  if (!row || row.expiresAt < new Date() || row.user.suspendedAt) return null;
  // Sliding expiry, but write at most once a day.
  if (row.expiresAt.getTime() - Date.now() < (SESSION_DAYS - 1) * 86_400_000) {
    await db
      .update(sessions)
      .set({ expiresAt: sql`now() + interval '${sql.raw(String(SESSION_DAYS))} days'` })
      .where(eq(sessions.id, row.sessionId));
  }
  return row.user;
});

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return user;
}

export async function requireRole(roles: Role[], nextPath?: string): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/** Same as requireRole but throws instead of redirecting — for server actions and route handlers. */
export async function assertRole(roles: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthError("Please sign in.");
  if (!roles.includes(user.role)) throw new AuthError("You don't have access to that.");
  return user;
}

export class AuthError extends Error {}
