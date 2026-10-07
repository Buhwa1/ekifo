import { and, eq, inArray, ne, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { properties, units, media, users, landlordVerifications, flags, holds } from "@/db/schema";
import { DomainError } from "./errors";
import { refreshPropertyStats } from "./inventory";
import { enqueueSms } from "./notify";
import { audit } from "./audit";
import { hmac } from "./crypto";
import { typeMap } from "./types";
import { isSlotCycle, type Cycle } from "./rules";

export { unitInput, mediaInput, listingInput, verificationInput, type ListingInput } from "./listing-schema";
import { ugx, unitInput, listingInput, type ListingInput, type verificationInput } from "./listing-schema";

// ─── Landlord verification ───────────────────────────────────────────────────
export async function submitVerification(user: { id: string; landlordStatus: string }, input: z.infer<typeof verificationInput>) {
  if (user.landlordStatus === "VERIFIED") throw new DomainError("You're already verified.");
  const ninHash = hmac("nin", input.nin);
  await db.transaction(async (tx) => {
    const reuse = await tx
      .select({ userId: landlordVerifications.userId })
      .from(landlordVerifications)
      .where(and(eq(landlordVerifications.ninHash, ninHash), ne(landlordVerifications.userId, user.id)))
      .limit(1);
    const [v] = await tx.insert(landlordVerifications).values({
      userId: user.id,
      fullName: input.fullName,
      ninHash,
      ninLast4: input.nin.slice(-4),
      ninPhotoUrl: input.ninPhotoUrl,
      selfieUrl: input.selfieUrl,
      authorityDocUrl: input.authorityDocUrl,
    }).returning({ id: landlordVerifications.id });
    if (reuse.length)
      await tx.insert(flags).values({ kind: "USER_REPORT", reason: `NIN ending ${input.nin.slice(-4)} is already used by another account (${reuse[0].userId}). Verification ${v.id}.` });
    await tx.update(users).set({ role: sql`case when ${users.role} = 'ADMIN' then 'ADMIN'::role else 'LANDLORD'::role end`, landlordStatus: "PENDING", name: input.fullName }).where(eq(users.id, user.id));
    await audit(tx, user.id, "landlord.submit_verification", "user", user.id);
  });
}

export async function reviewVerification(admin: { id: string }, verificationId: string, approve: boolean, note?: string) {
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(landlordVerifications).where(eq(landlordVerifications.id, verificationId)).for("update");
    if (!v || v.status !== "PENDING") throw new DomainError("Already reviewed.");
    const status = approve ? "VERIFIED" : "REJECTED";
    await tx.update(landlordVerifications).set({ status, reviewerId: admin.id, reviewNote: note ?? null, reviewedAt: new Date() }).where(eq(landlordVerifications.id, v.id));
    const [u] = await tx.update(users).set({ landlordStatus: status }).where(eq(users.id, v.userId)).returning();
    await enqueueSms(tx, u.phone, approve
      ? "FindEkifo: you're now a Verified Landlord. Your listings will go live once each one is reviewed."
      : `FindEkifo: we couldn't verify your documents${note ? `: ${note}` : ""}. Please resubmit in the app.`);
    await audit(tx, admin.id, `landlord.${approve ? "verify" : "reject"}`, "user", v.userId, { note });
  });
}

// ─── Listings ────────────────────────────────────────────────────────────────
type Actor = { id: string; role: string; landlordStatus: string };

/**
 * Create a listing. Landlords list for themselves (goes to review). Admins can list on behalf of
 * an onboarded client with onBehalfOf — those go live immediately, since the admin is the reviewer.
 */
export async function createListing(actor: Actor, input: ListingInput, onBehalfOf?: string) {
  let ownerId = actor.id;
  let ownerStatus = actor.landlordStatus;
  if (onBehalfOf && onBehalfOf !== actor.id) {
    if (actor.role !== "ADMIN") throw new DomainError("Only FindEkifo staff can list for someone else.");
    const [client] = await db.select().from(users).where(eq(users.id, onBehalfOf));
    if (!client) throw new DomainError("That client doesn't exist.");
    ownerId = client.id;
    ownerStatus = client.landlordStatus;
  }
  if (actor.role !== "ADMIN" && (ownerStatus === "NONE" || ownerStatus === "REJECTED"))
    throw new DomainError("Submit your ID verification before listing.");

  const types = await typeMap();
  const type = types.get(input.type);
  if (!type || !type.active) throw new DomainError("Pick a type of space from the list.");
  for (const [i, u] of input.units.entries())
    if (!type.cycles.includes(u.cycle as Cycle))
      throw new DomainError(`Unit ${i + 1}: a ${type.name.toLowerCase()} can't be charged ${u.cycle.toLowerCase().replace("per_", "per ").replace("_", " ")}.`);

  if (input.parentId) {
    if (!type.canBeChild) throw new DomainError(`A ${type.name.toLowerCase()} can't sit inside another listing.`);
    const [parent] = await db.select().from(properties).where(eq(properties.id, input.parentId));
    if (!parent || parent.ownerId !== ownerId) throw new DomainError("Pick one of your own buildings as the parent.");
    if (parent.parentId) throw new DomainError("Spaces can only be one level deep.");
    if (!types.get(parent.type)?.canHaveChildren) throw new DomainError(`${parent.name} can't contain other spaces.`);
  }

  const adminListing = actor.role === "ADMIN";
  return db.transaction(async (tx) => {
    const { units: unitRows, media: mediaRows, ...details } = input;
    const [p] = await tx.insert(properties).values({
      ...details, parentId: details.parentId ?? null, ownerId,
      status: adminListing ? "LIVE" : "PENDING_REVIEW",
      publishedAt: adminListing ? new Date() : null,
    }).returning({ id: properties.id });
    await tx.insert(units).values(unitRows.map((u) => ({
      ...u,
      // Slot bookings are paid in full up front, so the "deposit" is the price itself.
      depositUgx: isSlotCycle(u.cycle as Cycle) ? u.priceUgx : u.depositUgx!,
      sizeSqft: u.sizeSqft ?? null, beds: u.beds ?? null, propertyId: p.id,
    })));
    await tx.insert(media).values(mediaRows.map((m, i) => ({ ...m, publicId: m.publicId ?? null, checksum: m.checksum ?? null, propertyId: p.id, position: i })));
    await refreshPropertyStats(tx, p.id);

    // Duplicate-image scam check: same file already on someone else's listing.
    const sums = mediaRows.map((m) => m.checksum).filter((c): c is string => Boolean(c));
    const urls = mediaRows.map((m) => m.url);
    const dupes = await tx
      .select({ propertyId: media.propertyId, ownerId: properties.ownerId })
      .from(media)
      .innerJoin(properties, eq(properties.id, media.propertyId))
      .where(and(
        ne(media.propertyId, p.id),
        ne(properties.ownerId, ownerId),
        sums.length ? sql`(${inArray(media.checksum, sums)} or ${inArray(media.url, urls)})` : inArray(media.url, urls),
      ))
      .limit(5);
    if (dupes.length)
      await tx.insert(flags).values({
        kind: "DUPLICATE_MEDIA",
        propertyId: p.id,
        reason: `Photos match ${dupes.length} image(s) on another landlord's listing (${[...new Set(dupes.map((d) => d.propertyId))].join(", ")}).`,
      });
    await audit(tx, actor.id, "listing.create", "property", p.id, { units: unitRows.length, duplicates: dupes.length, onBehalfOf: onBehalfOf ?? null });
    return p.id;
  });
}

export async function reviewListing(admin: { id: string }, propertyId: string, approve: boolean, note?: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ p: properties, owner: users })
      .from(properties)
      .innerJoin(users, eq(users.id, properties.ownerId))
      .where(eq(properties.id, propertyId))
      .for("update", { of: properties });
    if (!row) throw new DomainError("Listing not found.");
    if (approve && row.owner.landlordStatus !== "VERIFIED") throw new DomainError("Verify the landlord's ID first.");
    await tx.update(properties).set({
      status: approve ? "LIVE" : "REJECTED",
      reviewNote: note ?? null,
      publishedAt: approve ? (row.p.publishedAt ?? new Date()) : row.p.publishedAt,
    }).where(eq(properties.id, propertyId));
    await enqueueSms(tx, row.owner.phone, approve
      ? `FindEkifo: ${row.p.name} is now live. Seekers can book visits and reserve units.`
      : `FindEkifo: ${row.p.name} wasn't approved${note ? `: ${note}` : ""}. Edit and resubmit.`);
    await audit(tx, admin.id, `listing.${approve ? "approve" : "reject"}`, "property", propertyId, { note });
  });
}

export async function setPropertySuspended(admin: { id: string }, propertyId: string, suspended: boolean) {
  await db.transaction(async (tx) => {
    await tx.update(properties).set({ status: suspended ? "SUSPENDED" : "LIVE" }).where(eq(properties.id, propertyId));
    await audit(tx, admin.id, suspended ? "listing.suspend" : "listing.restore", "property", propertyId);
  });
}

/**
 * Owner toggles a unit. RESERVED is controlled by the escrow system only, and a unit with a live
 * reservation can't be flipped — that would strand a seeker's deposit.
 */
export type OwnerSettableStatus = "VACANT" | "OCCUPIED" | "UNLISTED" | "MAINTENANCE" | "UNDER_CONSTRUCTION";

export async function setUnitStatus(owner: { id: string; role: string }, unitId: string, status: OwnerSettableStatus) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ unit: units, ownerId: properties.ownerId })
      .from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(eq(units.id, unitId))
      .for("update", { of: units });
    if (!row || (row.ownerId !== owner.id && owner.role !== "ADMIN")) throw new DomainError("Unit not found.");
    const live = await tx.select({ id: holds.id }).from(holds)
      .where(and(eq(holds.unitId, unitId), inArray(holds.status, ["PENDING_PAYMENT", "HELD"]))).limit(1);
    if (live.length)
      throw new DomainError(isSlotCycle(row.unit.cycle)
        ? "This space has upcoming paid bookings. Cancel them from your Lead inbox first."
        : "This unit has an active reservation. Resolve it from your Lead inbox first.");
    await tx.update(units).set({ status }).where(eq(units.id, unitId));
    await refreshPropertyStats(tx, row.unit.propertyId);
    await audit(tx, owner.id, "unit.status", "unit", unitId, { from: row.unit.status, to: status });
  });
}

export async function updateUnitPrice(owner: { id: string }, unitId: string, priceUgx: number, depositUgx: number | null) {
  const parsed = z.object({ priceUgx: ugx, depositUgx: ugx }).safeParse({ priceUgx, depositUgx: depositUgx || priceUgx });
  if (!parsed.success) throw new DomainError(parsed.error.issues[0].message);
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ unit: units, ownerId: properties.ownerId }).from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId)).where(eq(units.id, unitId)).for("update", { of: units });
    if (!row || row.ownerId !== owner.id) throw new DomainError("Unit not found.");
    if (row.unit.status === "OCCUPIED")
      throw new DomainError("Occupied unit — change rent through the tenancy so the legal cap and notice period apply.");
    const slot = isSlotCycle(row.unit.cycle);
    await tx.update(units).set({ priceUgx: parsed.data.priceUgx, depositUgx: slot ? parsed.data.priceUgx : parsed.data.depositUgx }).where(eq(units.id, unitId));
    await refreshPropertyStats(tx, row.unit.propertyId);
  });
}

export async function addUnit(owner: { id: string }, propertyId: string, input: z.infer<typeof unitInput>) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(properties).where(and(eq(properties.id, propertyId), eq(properties.ownerId, owner.id)));
    if (!p) throw new DomainError("Listing not found.");
    const type = (await typeMap()).get(p.type);
    if (type && !type.cycles.includes(input.cycle as Cycle)) throw new DomainError(`A ${type.name.toLowerCase()} can't be charged that way.`);
    const clash = await tx.select({ id: units.id }).from(units).where(and(eq(units.propertyId, propertyId), sql`lower(${units.label}) = lower(${input.label})`));
    if (clash.length) throw new DomainError("A unit with that name already exists.");
    await tx.insert(units).values({ ...input, depositUgx: isSlotCycle(input.cycle as Cycle) ? input.priceUgx : (input.depositUgx ?? input.priceUgx), sizeSqft: input.sizeSqft ?? null, beds: input.beds ?? null, propertyId });
    await refreshPropertyStats(tx, propertyId);
  });
}

export async function reportListing(reporter: { id: string }, propertyId: string, reason: string) {
  if (reason.trim().length < 10) throw new DomainError("Tell us a little more (at least 10 characters).");
  const open = await db.select({ id: flags.id }).from(flags)
    .where(and(eq(flags.propertyId, propertyId), eq(flags.status, "OPEN"), eq(flags.reporterId, reporter.id)))
    .limit(1);
  if (open.length) throw new DomainError("You've already reported this listing. Our team is on it.");
  await db.insert(flags).values({ kind: "USER_REPORT", propertyId, reporterId: reporter.id, reason: reason.trim().slice(0, 1000) });
}
