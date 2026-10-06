"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { flags, properties, users, sessions } from "@/db/schema";
import { assertRole } from "@/lib/auth";
import { reviewVerification, reviewListing, setPropertySuspended } from "@/lib/listings";
import { reviewPayout, executePayout } from "@/lib/payouts";
import { confirmMoveIn, releaseHold } from "@/lib/booking";
import { audit } from "@/lib/audit";
import { DomainError, run, type ActionResult } from "@/lib/errors";

const admin = () => assertRole(["ADMIN"]);
const note = (fd: FormData) => String(fd.get("note") ?? "").trim() || undefined;

export async function reviewVerificationAction(id: string, approve: boolean, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await reviewVerification(await admin(), id, approve, note(fd));
    revalidatePath("/admin/verification");
  });
}

export async function reviewListingAction(id: string, approve: boolean, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await reviewListing(await admin(), id, approve, note(fd));
    revalidatePath("/admin/verification");
    revalidatePath("/");
  });
}

export async function suspendPropertyAction(id: string, suspend: boolean): Promise<ActionResult> {
  return run(async () => {
    await setPropertySuspended(await admin(), id, suspend);
    revalidatePath("/admin/flags");
    revalidatePath(`/spaces/${id}`);
  });
}

export async function featurePropertyAction(id: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const a = await admin();
    const days = Math.max(0, Math.min(90, Number(fd.get("days") ?? 30)));
    await db.update(properties).set({ featuredUntil: days ? new Date(Date.now() + days * 86_400_000) : null }).where(eq(properties.id, id));
    await audit(db, a.id, "listing.feature", "property", id, { days });
    revalidatePath("/admin/verification");
    revalidatePath("/");
  }, "Saved");
}

export async function suspendUserAction(userId: string, suspend: boolean): Promise<ActionResult> {
  return run(async () => {
    const a = await admin();
    if (a.id === userId) throw new DomainError("You can't suspend yourself.");
    await db.transaction(async (tx) => {
      await tx.update(users).set({ suspendedAt: suspend ? new Date() : null }).where(eq(users.id, userId));
      if (suspend) await tx.delete(sessions).where(eq(sessions.userId, userId)); // sign them out everywhere
      await audit(tx, a.id, suspend ? "user.suspend" : "user.restore", "user", userId);
    });
    revalidatePath("/admin/flags");
  });
}

export async function resolveFlagAction(id: string, outcome: "RESOLVED" | "DISMISSED", fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const a = await admin();
    await db.update(flags).set({ status: outcome, resolution: note(fd) ?? null, resolvedAt: new Date() }).where(eq(flags.id, id));
    await audit(db, a.id, `flag.${outcome.toLowerCase()}`, "flag", id);
    revalidatePath("/admin/flags");
  });
}

export async function payoutReviewAction(id: string, approve: boolean, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await reviewPayout(await admin(), id, approve, note(fd));
    revalidatePath("/admin/finance");
  });
}

export async function payoutExecuteAction(id: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await executePayout(await admin(), id, String(fd.get("reference") ?? "") || undefined);
    revalidatePath("/admin/finance");
  }, "Payout sent");
}

export async function adminConfirmHoldAction(id: string): Promise<ActionResult> {
  return run(async () => {
    await confirmMoveIn(await admin(), id);
    revalidatePath("/admin/finance");
    revalidatePath("/admin/flags");
  }, "Escrow released to landlord");
}

export async function adminRefundHoldAction(id: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await releaseHold(await admin(), id, note(fd) ?? "refunded by FindEkifo support");
    revalidatePath("/admin/finance");
    revalidatePath("/admin/flags");
  }, "Refund issued");
}
