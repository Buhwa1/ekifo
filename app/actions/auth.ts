"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requestOtp, verifyOtp, startSession, endSession } from "@/lib/auth";
import type { ActionResult } from "@/lib/errors";

export async function sendCodeAction(fd: FormData): Promise<ActionResult<{ phone: string }>> {
  const r = await requestOtp(String(fd.get("phone") ?? ""));
  return r.ok ? { ok: true, data: { phone: r.phone } } : { ok: false, error: r.error };
}

/** Only allow same-site relative redirects after login (no open redirect). */
function safeNext(raw: unknown, fallback: string) {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}

export async function verifyCodeAction(fd: FormData): Promise<ActionResult> {
  const phone = String(fd.get("phone") ?? "");
  const code = String(fd.get("code") ?? "").replace(/\D/g, "");
  const r = await verifyOtp(phone, code);
  if (!r.ok) return { ok: false, error: r.error };
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (name && !r.user.name) await db.update(users).set({ name }).where(eq(users.id, r.user.id));
  await startSession(r.user.id);
  const home = r.user.role === "ADMIN" ? "/admin" : r.user.role === "LANDLORD" ? "/owner" : "/";
  redirect(safeNext(fd.get("next"), home));
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}
