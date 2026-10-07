"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedSpaces, holds, reviews, units } from "@/db/schema";
import { assertRole } from "@/lib/auth";
import { createHold, confirmMoveIn, releaseHold, openDispute } from "@/lib/booking";
import { requestVisit, updateVisit } from "@/lib/visits";
import { reportListing } from "@/lib/listings";
import { refreshRating } from "@/lib/inventory";
import { DomainError, run, type ActionResult } from "@/lib/errors";
import { normalizeUgPhone } from "@/lib/rules";

const ANY = ["SEEKER", "LANDLORD", "ADMIN"] as const;
const me = () => assertRole([...ANY]);

/** "2026-10-12" + "14:30" entered in Kampala → absolute instant. */
const kampala = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`);

export async function requestVisitAction(unitId: string, propertyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await me();
    await requestVisit(user, { unitId, slot: kampala(String(fd.get("date")), String(fd.get("time"))), note: String(fd.get("note") ?? "") });
    revalidatePath("/me");
  }, "Visit requested. The landlord gets an SMS and will confirm shortly.");
}

export async function reserveAction(unitId: string, fd: FormData): Promise<ActionResult> {
  let holdId = "";
  const res = await run(async () => {
    const user = await me();
    const msisdn = normalizeUgPhone(String(fd.get("msisdn") ?? ""));
    if (!msisdn) throw new DomainError("Enter the Mobile Money number to charge.");
    const network = fd.get("network") === "AIRTEL" ? "AIRTEL" : "MTN";
    if (fd.get("terms") !== "on") throw new DomainError("Please accept the escrow terms.");
    const moveIn = String(fd.get("moveIn") ?? "");
    const start = String(fd.get("start") ?? "");
    const end = String(fd.get("end") ?? "");
    ({ holdId } = await createHold(user, {
      unitId, msisdn, network,
      moveInDate: moveIn ? kampala(moveIn, "09:00") : undefined,
      startsAt: start ? new Date(start) : undefined,
      endsAt: end ? new Date(end) : undefined,
    }));
  });
  if (!res.ok) return res;
  redirect(`/holds/${holdId}`);
}

export async function confirmMoveInAction(holdId: string): Promise<ActionResult> {
  return run(async () => {
    await confirmMoveIn(await me(), holdId);
    revalidatePath("/me");
  }, "Confirmed. Thanks for letting us know.");
}

export async function cancelHoldAction(holdId: string): Promise<ActionResult> {
  return run(async () => {
    await releaseHold(await me(), holdId, "cancelled by tenant");
    revalidatePath("/me");
  }, "Cancelled. Any money paid is on its way back to you.");
}

export async function disputeAction(holdId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const reason = String(fd.get("reason") ?? "").trim();
    if (reason.length < 10) throw new DomainError("Describe the problem in a sentence or two.");
    await openDispute(await me(), holdId, reason);
  }, "Dispute opened. Your deposit stays in escrow while our team reviews it.");
}

export async function seekerVisitAction(visitId: string, next: "CANCELLED" | "CONFIRMED"): Promise<ActionResult> {
  return run(async () => {
    await updateVisit(await me(), visitId, next);
    revalidatePath("/me");
  });
}

export async function toggleSaveAction(propertyId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await me();
    const del = await db.delete(savedSpaces).where(and(eq(savedSpaces.userId, user.id), eq(savedSpaces.propertyId, propertyId))).returning();
    if (!del.length) await db.insert(savedSpaces).values({ userId: user.id, propertyId }).onConflictDoNothing();
    revalidatePath(`/spaces/${propertyId}`);
    revalidatePath("/me");
  });
}

export async function reportAction(propertyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await reportListing(await me(), propertyId, String(fd.get("reason") ?? ""));
  }, "Thanks — our team will review this listing.");
}

export async function reviewAction(holdId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await me();
    const stars = Number(fd.get("stars"));
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new DomainError("Pick 1 to 5 stars.");
    const [row] = await db.select({ hold: holds, propertyId: units.propertyId }).from(holds).innerJoin(units, eq(units.id, holds.unitId)).where(eq(holds.id, holdId));
    if (!row || row.hold.seekerId !== user.id || row.hold.status !== "CONFIRMED") throw new DomainError("You can review places you've moved into.");
    await db.transaction(async (tx) => {
      await tx.insert(reviews).values({ propertyId: row.propertyId, authorId: user.id, holdId, stars, comment: String(fd.get("comment") ?? "").slice(0, 600) || null })
        .onConflictDoUpdate({ target: reviews.holdId, set: { stars, comment: String(fd.get("comment") ?? "").slice(0, 600) || null } });
      await refreshRating(tx, row.propertyId);
    });
    revalidatePath("/me");
  }, "Thanks for the review!");
}
