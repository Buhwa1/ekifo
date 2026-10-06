"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { createListing, listingInput, setUnitStatus, submitVerification, verificationInput, updateUnitPrice, addUnit, unitInput, type ListingInput } from "@/lib/listings";
import { updateVisit } from "@/lib/visits";
import { releaseHold } from "@/lib/booking";
import { requestPayout } from "@/lib/payouts";
import { proposeRentChange, endTenancy } from "@/lib/tenancy";
import { DomainError, run, type ActionResult } from "@/lib/errors";

const owner = () => assertRole(["LANDLORD", "ADMIN"]);
const anyone = () => assertRole(["SEEKER", "LANDLORD", "ADMIN"]);

export async function submitVerificationAction(fd: FormData): Promise<ActionResult> {
  const res = await run(async () => {
    const user = await anyone();
    const parsed = verificationInput.safeParse(Object.fromEntries(fd));
    if (!parsed.success) throw new DomainError(parsed.error.issues[0].message);
    await submitVerification(user, parsed.data);
  });
  if (!res.ok) return res;
  redirect("/owner?submitted=1");
}

export type WizardResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createListingAction(input: ListingInput): Promise<WizardResult> {
  const parsed = listingInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: parsed.error.issues[0].message, fieldErrors };
  }
  const res = await run(async () => createListing(await owner(), parsed.data));
  if (!res.ok) return res;
  revalidatePath("/owner");
  return { ok: true, id: res.data! };
}

export async function setUnitStatusAction(unitId: string, status: "VACANT" | "OCCUPIED" | "UNLISTED"): Promise<ActionResult> {
  return run(async () => {
    await setUnitStatus(await owner(), unitId, status);
    revalidatePath("/owner/units");
    revalidatePath("/owner");
  });
}

export async function updatePriceAction(unitId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await updateUnitPrice(await owner(), unitId, Number(fd.get("priceUgx")), Number(fd.get("depositUgx")));
    revalidatePath("/owner/units");
  }, "Saved");
}

export async function addUnitAction(propertyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const parsed = unitInput.safeParse(Object.fromEntries(fd));
    if (!parsed.success) throw new DomainError(parsed.error.issues[0].message);
    await addUnit(await owner(), propertyId, parsed.data);
    revalidatePath("/owner/units");
  }, "Unit added");
}

export async function ownerVisitAction(visitId: string, next: "CONFIRMED" | "DECLINED" | "RESCHEDULED" | "COMPLETED" | "NO_SHOW", fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const date = String(fd.get("date") ?? "");
    const time = String(fd.get("time") ?? "");
    const slot = next === "RESCHEDULED" && date && time ? new Date(`${date}T${time}:00+03:00`) : undefined;
    await updateVisit(await owner(), visitId, next, slot);
    revalidatePath("/owner/leads");
  });
}

export async function ownerReleaseHoldAction(holdId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const reason = String(fd.get("reason") ?? "").trim() || "released by landlord";
    await releaseHold(await owner(), holdId, reason);
    revalidatePath("/owner/leads");
    revalidatePath("/owner/units");
  }, "Reservation released and the tenant refunded.");
}

export async function requestPayoutAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const method = String(fd.get("method"));
    if (!["MTN", "AIRTEL", "BANK"].includes(method)) throw new DomainError("Pick where to send the money.");
    await requestPayout(await owner(), {
      amountUgx: Math.floor(Number(String(fd.get("amountUgx")).replace(/[, ]/g, ""))),
      method: method as "MTN" | "AIRTEL" | "BANK",
      destination: String(fd.get("destination") ?? ""),
    });
    revalidatePath("/owner/payouts");
  }, "Withdrawal requested. You'll get an SMS when it's sent.");
}

export async function rentChangeAction(tenancyId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const effective = new Date(`${String(fd.get("effectiveAt"))}T00:00:00+03:00`);
    await proposeRentChange(await owner(), tenancyId, Math.floor(Number(String(fd.get("newRent")).replace(/[, ]/g, ""))), effective);
    revalidatePath("/owner/tenancies");
  }, "Notice sent to the tenant by SMS.");
}

export async function endTenancyAction(tenancyId: string): Promise<ActionResult> {
  return run(async () => {
    await endTenancy(await owner(), tenancyId);
    revalidatePath("/owner/tenancies");
    revalidatePath("/owner/units");
  }, "Tenancy ended. The unit is vacant again.");
}
