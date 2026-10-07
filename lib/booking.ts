// Hold (reservation) lifecycle and escrow. This is the money path — every state change happens
// inside a transaction with the relevant rows locked, and every transition is idempotent.
//
// Two kinds of hold share this machinery:
//   LEASE  (hostel room, flat, stall): a deposit reserves the whole unit until the tenant moves in.
//   SLOT   (turf, pool, rooftop, garden…): the full price books a time window on the unit.
//
//   PENDING_PAYMENT ──paid──▶ HELD ──moved in / slot happened / admin──▶ CONFIRMED (escrow → owner)
//        │                     │
//        │ failed / timed out  └──owner releases / seeker cancels in window / admin──▶ REFUNDED
//        ▼
//     EXPIRED / CANCELLED  (a late successful payment on these is revived or refunded automatically)
//
// Double booking is impossible at the database level: a partial unique index allows one live
// LEASE hold per unit, and an exclusion constraint forbids overlapping live SLOT windows.

import { randomBytes } from "node:crypto";
import { and, eq, lt, gt, inArray, sql, count, isNull, isNotNull, ne } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { holds, payments, units, properties, users, tenancies, flags } from "@/db/schema";
import { config } from "./config";
import { DomainError, isUniqueViolation } from "./errors";
import { paymentProvider, type VerifyResult } from "./payments";
import { post } from "./ledger";
import { enqueueSms } from "./notify";
import { refreshPropertyStats } from "./inventory";
import { audit } from "./audit";
import { checkSlot, commissionFor, fmtHour, kampalaHour, formatUGX, isSlotCycle, requiresWrittenAgreement, type UnitStatus } from "./rules";

const MAX_ACTIVE_HOLDS_PER_SEEKER = 3;
const MAX_UPCOMING_SLOTS_PER_SEEKER = 6;
/** After a slot ends, the seeker has this long to raise a problem before the venue is paid. */
const SLOT_RELEASE_AFTER_MS = 24 * 3_600_000;
const LIVE = ["PENDING_PAYMENT", "HELD", "CONFIRMED"] as const;

type Actor = { id: string; role: "SEEKER" | "LANDLORD" | "ADMIN" };
type Hold = typeof holds.$inferSelect;

const isSlot = (h: Pick<Hold, "startsAt">) => h.startsAt !== null;
const kampala = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleString("en-UG", { timeZone: "Africa/Kampala", ...opts });
/** "Sat 10 Oct, 6pm–8pm" */
export const fmtWindow = (s: Date, e: Date) =>
  `${kampala(s, { weekday: "short", day: "numeric", month: "short" })}, ${fmtHour(kampalaHour(s))}–${fmtHour(kampalaHour(e))}`;

const isExclusionViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return (err?.cause?.code ?? err?.code) === "23P01";
};

const unavailable: Partial<Record<UnitStatus, string>> = {
  RESERVED: "Sorry — this space was just booked.",
  OCCUPIED: "Sorry — this space is taken.",
  MAINTENANCE: "This space is closed for maintenance right now.",
  UNDER_CONSTRUCTION: "This space is still under construction.",
  UNLISTED: "This space isn't available.",
};

// ─── Create ──────────────────────────────────────────────────────────────────
export async function createHold(
  seeker: Actor & { phone: string; name: string | null },
  input: { unitId: string; msisdn: string; network: "MTN" | "AIRTEL"; moveInDate?: Date; startsAt?: Date; endsAt?: Date },
): Promise<{ holdId: string }> {
  const cfg = config();

  // A previous seeker may have abandoned a payment on this unit; settle that first so it frees up.
  const stale = await db
    .select({ id: holds.id })
    .from(holds)
    .where(and(eq(holds.unitId, input.unitId), eq(holds.status, "PENDING_PAYMENT"), lt(holds.paymentDeadline, new Date())));
  for (const s of stale) await reconcileHold(s.id, { force: true });

  let holdId: string;
  let txRef: string;
  let amount: number;
  try {
    ({ holdId, txRef, amount } = await db.transaction(async (tx) => {
      // Locking the unit row serialises every booking attempt on it.
      const [row] = await tx
        .select({ unit: units, property: properties })
        .from(units)
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .where(eq(units.id, input.unitId))
        .for("update", { of: units });
      if (!row) throw new DomainError("That space no longer exists.");
      if (row.property.status !== "LIVE") throw new DomainError("This listing isn't open for bookings right now.");
      if (row.property.ownerId === seeker.id) throw new DomainError("You can't book your own space.");
      if (row.unit.status !== "VACANT") throw new DomainError(unavailable[row.unit.status] ?? "This space isn't available.");

      const slot = isSlotCycle(row.unit.cycle);
      let amountUgx = row.unit.depositUgx;
      let window: { startsAt: Date; endsAt: Date } | null = null;

      if (slot) {
        if (!input.startsAt || !input.endsAt) throw new DomainError("Pick a date and time first.");
        const check = checkSlot({ cycle: row.unit.cycle, priceUgx: row.unit.priceUgx, start: input.startsAt, end: input.endsAt, openFrom: row.property.openFrom, openTo: row.property.openTo, now: new Date() });
        if (!check.ok) throw new DomainError(check.reason);
        amountUgx = check.amountUgx;
        window = { startsAt: input.startsAt, endsAt: input.endsAt };

        const clash = await tx.select({ id: holds.id }).from(holds).where(and(
          eq(holds.unitId, row.unit.id), inArray(holds.status, [...LIVE]),
          lt(holds.startsAt, window.endsAt), gt(holds.endsAt, window.startsAt),
        )).limit(1);
        if (clash.length) throw new DomainError("That time was just booked. Pick another slot.");

        const [{ n }] = await tx.select({ n: count() }).from(holds).where(and(
          eq(holds.seekerId, seeker.id), inArray(holds.status, ["PENDING_PAYMENT", "HELD"]), isNotNull(holds.startsAt),
        ));
        if (n >= MAX_UPCOMING_SLOTS_PER_SEEKER) throw new DomainError(`You already have ${n} upcoming bookings. Let some happen first.`);
      } else {
        const [{ n }] = await tx.select({ n: count() }).from(holds).where(and(
          eq(holds.seekerId, seeker.id), inArray(holds.status, ["PENDING_PAYMENT", "HELD"]), isNull(holds.startsAt),
        ));
        if (n >= MAX_ACTIVE_HOLDS_PER_SEEKER) throw new DomainError(`You already have ${n} active reservations. Confirm or cancel one first.`);
      }

      const [hold] = await tx
        .insert(holds)
        .values({
          unitId: row.unit.id,
          seekerId: seeker.id,
          amountUgx,
          commissionUgx: commissionFor(amountUgx, cfg.COMMISSION_BPS),
          paymentDeadline: new Date(Date.now() + cfg.HOLD_PAYMENT_WINDOW_MIN * 60_000),
          moveInDate: slot ? null : input.moveInDate ?? null,
          startsAt: window?.startsAt ?? null,
          endsAt: window?.endsAt ?? null,
        })
        .returning({ id: holds.id });

      const ref = `EKF-${hold.id.slice(0, 8)}-${randomBytes(4).toString("hex")}`.toUpperCase();
      await tx.insert(payments).values({ holdId: hold.id, provider: paymentProvider().name, txRef: ref, amountUgx, msisdn: input.msisdn, network: input.network });
      await audit(tx, seeker.id, "hold.create", "hold", hold.id, { unitId: row.unit.id, amountUgx, window });
      return { holdId: hold.id, txRef: ref, amount: amountUgx };
    }));
  } catch (e) {
    if (isUniqueViolation(e, "one_active_hold_per_unit"))
      throw new DomainError("Someone is completing a payment for this space right now. Try again in a few minutes or pick another unit.");
    if (isExclusionViolation(e)) throw new DomainError("That time was just booked. Pick another slot.");
    throw e;
  }

  // Call the provider OUTSIDE the transaction: never hold row locks across a network call.
  const res = await paymentProvider()
    .charge({ txRef, amountUgx: amount, msisdn: input.msisdn, network: input.network, customerName: seeker.name ?? "FindEkifo user" })
    .catch((e) => ({ providerRef: null, outcome: "FAILED" as const, message: String(e) }));

  if (res.outcome === "FAILED") {
    await settlePayment(txRef, { outcome: "FAILED", amountUgx: null, currency: null, providerRef: res.providerRef, raw: res });
    throw new DomainError(res.message ? `Mobile Money said: ${res.message}` : "The payment couldn't be started. Check the number and try again.");
  }
  await db.update(payments).set({ providerRef: res.providerRef }).where(eq(payments.txRef, txRef));
  if (res.outcome === "SUCCESSFUL") await reconcilePaymentRef(txRef);
  return { holdId };
}

// ─── Settle (webhook / poll / job all land here) ────────────────────────────
export async function settlePayment(txRef: string, v: VerifyResult): Promise<void> {
  if (v.outcome === "PENDING") return;
  const cfg = config();
  const afterCommit: Array<() => Promise<void>> = [];

  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.txRef, txRef)).for("update");
    if (!payment || payment.status !== "PENDING") return; // unknown or already settled → idempotent no-op
    const [hold] = await tx.select().from(holds).where(eq(holds.id, payment.holdId)).for("update");
    const [unit] = await tx.select().from(units).where(eq(units.id, hold.unitId)).for("update");
    const [prop] = await tx.select().from(properties).where(eq(properties.id, unit.propertyId));
    const [seeker] = await tx.select().from(users).where(eq(users.id, hold.seekerId));
    const slot = isSlot(hold);

    if (v.outcome === "FAILED") {
      await tx.update(payments).set({ status: "FAILED", providerRef: v.providerRef ?? payment.providerRef, raw: v.raw ?? null, failureText: "Declined or timed out" }).where(eq(payments.id, payment.id));
      if (hold.status === "PENDING_PAYMENT") await tx.update(holds).set({ status: "EXPIRED" }).where(eq(holds.id, hold.id));
      await enqueueSms(tx, seeker.phone, `FindEkifo: your payment for ${prop.name} (${unit.label}) didn't go through. No money was taken. You can try again in the app.`);
      return;
    }

    // SUCCESSFUL — but never trust the provider blindly about the amount.
    if ((v.amountUgx !== null && v.amountUgx < payment.amountUgx) || (v.currency && v.currency !== "UGX")) {
      await tx.update(payments).set({ status: "FAILED", raw: v.raw ?? null, failureText: `Amount/currency mismatch: ${v.amountUgx} ${v.currency}` }).where(eq(payments.id, payment.id));
      await tx.insert(flags).values({ kind: "CANCELLATION_DISPUTE", holdId: hold.id, propertyId: prop.id, reason: `Payment ${txRef} reported ${v.amountUgx} ${v.currency}, expected ${payment.amountUgx} UGX. Investigate before refunding.` });
      if (hold.status === "PENDING_PAYMENT") await tx.update(holds).set({ status: "EXPIRED" }).where(eq(holds.id, hold.id));
      return;
    }

    await tx.update(payments).set({ status: "SUCCESSFUL", providerRef: v.providerRef ?? payment.providerRef, raw: v.raw ?? null }).where(eq(payments.id, payment.id));
    await post(tx, [
      { account: "MOBILE_MONEY_CLEARING", amount: -payment.amountUgx },
      { account: "ESCROW", amount: payment.amountUgx },
    ], { memo: `${slot ? "Booking" : "Deposit"} received ${txRef}`, holdId: hold.id });

    let canHold = false;
    if (hold.status === "PENDING_PAYMENT") canHold = true;
    else if (hold.status === "EXPIRED" || hold.status === "CANCELLED") {
      // Late payment on a lapsed hold: revive it only if nobody else took the unit/window meanwhile.
      const others = await tx.select({ id: holds.id }).from(holds).where(and(
        eq(holds.unitId, unit.id), ne(holds.id, hold.id),
        slot
          ? and(inArray(holds.status, [...LIVE]), lt(holds.startsAt, hold.endsAt!), gt(holds.endsAt, hold.startsAt!))!
          : and(inArray(holds.status, ["PENDING_PAYMENT", "HELD"]), isNull(holds.startsAt))!,
      )).limit(1);
      canHold = others.length === 0 && (!slot || hold.startsAt!.getTime() > Date.now());
    }

    const [owner] = await tx.select().from(users).where(eq(users.id, prop.ownerId));
    if (canHold && unit.status === "VACANT" && prop.status === "LIVE") {
      if (slot) {
        const window = fmtWindow(hold.startsAt!, hold.endsAt!);
        await tx.update(holds).set({ status: "HELD", paidAt: new Date(), heldUntil: new Date(hold.endsAt!.getTime() + SLOT_RELEASE_AFTER_MS) }).where(eq(holds.id, hold.id));
        await enqueueSms(tx, seeker.phone, `FindEkifo: booked! ${unit.label} at ${prop.name}, ${window}. ${formatUGX(payment.amountUgx)} is held safely until after your booking.`);
        await enqueueSms(tx, owner.phone, `FindEkifo: new booking for ${unit.label} at ${prop.name}, ${window}. Paid ${formatUGX(payment.amountUgx)}. Guest: ${seeker.name ?? ""} ${seeker.phone}.`);
      } else {
        const heldUntil = new Date(Date.now() + cfg.HOLD_DURATION_HOURS * 3_600_000);
        await tx.update(holds).set({ status: "HELD", heldUntil, paidAt: new Date() }).where(eq(holds.id, hold.id));
        await tx.update(units).set({ status: "RESERVED" }).where(eq(units.id, unit.id));
        await refreshPropertyStats(tx, prop.id);
        await enqueueSms(tx, seeker.phone, `FindEkifo: ${unit.label} at ${prop.name} is reserved for you until ${kampala(heldUntil, { dateStyle: "medium", timeStyle: "short" })}. Your ${formatUGX(payment.amountUgx)} is held safely in escrow.`);
        await enqueueSms(tx, owner.phone, `FindEkifo: ${unit.label} at ${prop.name} has been reserved with a ${formatUGX(payment.amountUgx)} deposit. Tenant: ${seeker.phone}. Funds release when they confirm move-in.`);
      }
      await audit(tx, null, "hold.held", "hold", hold.id, { txRef });
    } else {
      // Money arrived but we can't give them the space → refund in the same transaction.
      if (hold.status === "PENDING_PAYMENT") await tx.update(holds).set({ status: "EXPIRED" }).where(eq(holds.id, hold.id));
      afterCommit.push(await refundEscrow(tx, hold.id, payment.amountUgx, "Space no longer available when payment arrived"));
      await enqueueSms(tx, seeker.phone, `FindEkifo: your payment for ${prop.name} arrived after the space was taken. ${formatUGX(payment.amountUgx)} is being refunded to ${payment.msisdn}.`);
    }
  });

  for (const job of afterCommit) await job();
}

/** Ask the provider for the truth about a payment and settle it. Used by the status page, webhooks and jobs. */
export async function reconcilePaymentRef(txRef: string) {
  const v = await paymentProvider().verify(txRef);
  await settlePayment(txRef, v);
  return v.outcome;
}

/**
 * Reconcile a hold's pending payment. With force, a payment still pending after the deadline
 * (plus a grace period for slow USSD prompts) is closed out as failed.
 */
export async function reconcileHold(holdId: string, opts: { force?: boolean } = {}) {
  const pending = await db.select().from(payments).where(and(eq(payments.holdId, holdId), eq(payments.status, "PENDING")));
  for (const p of pending) {
    const outcome = await reconcilePaymentRef(p.txRef);
    if (outcome === "PENDING" && opts.force) {
      const [h] = await db.select().from(holds).where(eq(holds.id, holdId));
      if (h && h.paymentDeadline.getTime() + 5 * 60_000 < Date.now())
        await settlePayment(p.txRef, { outcome: "FAILED", amountUgx: null, currency: null, providerRef: null, raw: { reason: "timed out" } });
    }
  }
}

// ─── Escrow release ──────────────────────────────────────────────────────────
/**
 * Pay the owner: the tenant confirms move-in (LEASE), the guest confirms the booking happened
 * (SLOT), an admin resolves it, or the sweep auto-releases a slot after its dispute window.
 */
export async function confirmMoveIn(actor: Actor | null, holdId: string) {
  const cfg = config();
  await db.transaction(async (tx) => {
    const [hold] = await tx.select().from(holds).where(eq(holds.id, holdId)).for("update");
    if (!hold) throw new DomainError("Booking not found.");
    if (actor && actor.role !== "ADMIN" && hold.seekerId !== actor.id) throw new DomainError("Only the person who paid can confirm this.");
    if (hold.status === "CONFIRMED") return;
    if (hold.status !== "HELD") throw new DomainError("This booking can't be confirmed in its current state.");
    const slot = isSlot(hold);
    if (slot && actor && actor.role !== "ADMIN" && hold.startsAt!.getTime() > Date.now())
      throw new DomainError("You can confirm once your booking has started.");

    const [unit] = await tx.select().from(units).where(eq(units.id, hold.unitId)).for("update");
    const [prop] = await tx.select().from(properties).where(eq(properties.id, unit.propertyId));
    const [owner] = await tx.select().from(users).where(eq(users.id, prop.ownerId));

    await tx.update(holds).set({ status: "CONFIRMED" }).where(eq(holds.id, hold.id));
    await post(tx, [
      { account: "ESCROW", amount: -hold.amountUgx },
      { account: "LANDLORD_PAYABLE", ownerId: owner.id, amount: hold.amountUgx - hold.commissionUgx },
      { account: "PLATFORM_REVENUE", amount: hold.commissionUgx },
    ], { memo: `${slot ? "Booking completed" : "Move-in confirmed"}: ${prop.name} ${unit.label}`, holdId: hold.id });

    if (!slot) {
      await tx.update(units).set({ status: "OCCUPIED" }).where(eq(units.id, unit.id));
      await tx.insert(tenancies).values({
        holdId: hold.id, unitId: unit.id, tenantId: hold.seekerId, landlordId: owner.id,
        rentUgx: unit.priceUgx, cycle: unit.cycle, depositUgx: hold.amountUgx,
        startDate: hold.moveInDate ?? new Date(),
        requiresWritten: requiresWrittenAgreement(unit.priceUgx, unit.cycle, cfg.WRITTEN_AGREEMENT_THRESHOLD),
      }).onConflictDoNothing();
      await refreshPropertyStats(tx, prop.id);
    }
    await enqueueSms(tx, owner.phone, `FindEkifo: ${slot ? "booking completed" : "move-in confirmed"} for ${unit.label} at ${prop.name}. ${formatUGX(hold.amountUgx - hold.commissionUgx)} is now in your payout balance.`);
    await audit(tx, actor?.id ?? null, slot ? "hold.slot_release" : "hold.confirm", "hold", hold.id);
  });
}

/** Cancel a booking and refund in full. */
export async function releaseHold(actor: Actor, holdId: string, reason: string) {
  const cfg = config();
  const job = await db.transaction(async (tx) => {
    const [hold] = await tx.select().from(holds).where(eq(holds.id, holdId)).for("update");
    if (!hold) throw new DomainError("Booking not found.");
    if (hold.status === "REFUNDED") return null;
    const [unit] = await tx.select().from(units).where(eq(units.id, hold.unitId)).for("update");
    const [prop] = await tx.select().from(properties).where(eq(properties.id, unit.propertyId));
    const slot = isSlot(hold);

    if (hold.status === "PENDING_PAYMENT") {
      if (actor.role !== "ADMIN" && hold.seekerId !== actor.id) throw new DomainError("Not allowed.");
      await tx.update(holds).set({ status: "CANCELLED" }).where(eq(holds.id, hold.id));
      await audit(tx, actor.id, "hold.cancel_pending", "hold", hold.id);
      return null; // a payment completing later is refunded automatically by settlePayment
    }
    if (hold.status !== "HELD") throw new DomainError("This booking can no longer be cancelled here. Contact support.");

    const isSeeker = hold.seekerId === actor.id;
    const isOwner = prop.ownerId === actor.id;
    if (actor.role !== "ADMIN" && !isSeeker && !isOwner) throw new DomainError("Not allowed.");
    if (isSeeker && actor.role !== "ADMIN") {
      if (slot) {
        if (hold.startsAt!.getTime() - Date.now() < cfg.FREE_CANCEL_HOURS * 3_600_000)
          throw new DomainError(`Free cancellation ends ${cfg.FREE_CANCEL_HOURS} hours before the booking starts. Tell us what happened and we'll review it.`);
      } else if (Date.now() - (hold.paidAt ?? hold.createdAt).getTime() > cfg.FREE_CANCEL_HOURS * 3_600_000) {
        throw new DomainError(`Free cancellation ends ${cfg.FREE_CANCEL_HOURS}h after payment. Open a dispute and our team will review it.`);
      }
    }
    if (slot && isOwner && actor.role !== "ADMIN" && hold.endsAt!.getTime() < Date.now())
      throw new DomainError("This booking has already happened. Contact support if something went wrong.");

    await tx.update(holds).set({ status: "REFUNDED" }).where(eq(holds.id, hold.id));
    if (!slot) {
      await tx.update(units).set({ status: "VACANT" }).where(and(eq(units.id, unit.id), eq(units.status, "RESERVED")));
      await refreshPropertyStats(tx, prop.id);
    }
    const [seeker] = await tx.select().from(users).where(eq(users.id, hold.seekerId));
    await enqueueSms(tx, seeker.phone, `FindEkifo: your booking for ${unit.label} at ${prop.name}${slot ? ` (${fmtWindow(hold.startsAt!, hold.endsAt!)})` : ""} was cancelled (${reason}). ${formatUGX(hold.amountUgx)} is being refunded to your Mobile Money.`);
    await audit(tx, actor.id, "hold.release", "hold", hold.id, { reason });
    return refundEscrow(tx, hold.id, hold.amountUgx, reason);
  });
  if (job) await job();
}

/**
 * Book the refund in the ledger (inside tx) and return a job that sends the money after commit.
 * If the disbursement fails, an admin flag is raised — the ledger already shows we owe it.
 */
async function refundEscrow(tx: Tx, holdId: string, amountUgx: number, reason: string) {
  await post(tx, [
    { account: "ESCROW", amount: -amountUgx },
    { account: "REFUND_CLEARING", amount: amountUgx },
  ], { memo: `Refund: ${reason}`, holdId });
  const [paid] = await tx.select().from(payments).where(and(eq(payments.holdId, holdId), eq(payments.status, "SUCCESSFUL"))).limit(1);
  return async () => {
    if (!paid) return;
    const res = await paymentProvider()
      .disburse({ reference: `RFD-${holdId}`, amountUgx, msisdn: paid.msisdn, network: paid.network, beneficiaryName: "FindEkifo refund", narration: "FindEkifo refund" })
      .catch((e) => ({ ok: false, message: String(e) }));
    if (!res.ok)
      await db.insert(flags).values({ kind: "CANCELLATION_DISPUTE", holdId, reason: `Refund of ${formatUGX(amountUgx)} to ${paid.msisdn} failed: ${res.message}. Send manually.` });
  };
}

// ─── Availability (for the time picker) ─────────────────────────────────────
/** Live booked windows on these units between two instants. */
export async function bookedWindows(unitIds: string[], from: Date, to: Date) {
  if (!unitIds.length) return [];
  return db
    .select({ unitId: holds.unitId, startsAt: holds.startsAt, endsAt: holds.endsAt })
    .from(holds)
    .where(and(inArray(holds.unitId, unitIds), inArray(holds.status, [...LIVE]), isNotNull(holds.startsAt), lt(holds.startsAt, to), gt(holds.endsAt, from)));
}

// ─── Disputes ────────────────────────────────────────────────────────────────
export async function openDispute(actor: Actor, holdId: string, reason: string) {
  const [hold] = await db.select().from(holds).where(eq(holds.id, holdId));
  if (!hold || hold.seekerId !== actor.id) throw new DomainError("Booking not found.");
  if (hold.status !== "HELD") throw new DomainError("Only active bookings can be disputed.");
  const [unit] = await db.select().from(units).where(eq(units.id, hold.unitId));
  await db.insert(flags).values({ kind: "CANCELLATION_DISPUTE", holdId, propertyId: unit.propertyId, reporterId: actor.id, reason: reason.slice(0, 1000) });
}

// ─── Background job ──────────────────────────────────────────────────────────
export async function sweepHolds() {
  // 1. Payments the seeker never approved → reverify, then close out.
  const overdue = await db.select({ id: holds.id }).from(holds)
    .where(and(eq(holds.status, "PENDING_PAYMENT"), lt(holds.paymentDeadline, new Date()))).limit(100);
  for (const h of overdue) await reconcileHold(h.id, { force: true }).catch((e) => console.error("reconcile", h.id, e));

  // 2. Recent pending payments → poll, in case a webhook was lost.
  const pending = await db.select({ txRef: payments.txRef }).from(payments)
    .where(and(eq(payments.status, "PENDING"), sql`${payments.createdAt} > now() - interval '1 hour'`)).limit(100);
  for (const p of pending) await reconcilePaymentRef(p.txRef).catch((e) => console.error("poll", p.txRef, e));

  // 3. Time-slot bookings past their dispute window → pay the venue, unless someone raised a problem.
  const due = await db.select({ id: holds.id }).from(holds).where(and(
    eq(holds.status, "HELD"), isNotNull(holds.startsAt), lt(holds.heldUntil, new Date()),
    sql`not exists (select 1 from flags f where f.hold_id = ${holds.id} and f.status = 'OPEN')`,
  )).limit(100);
  for (const h of due) await confirmMoveIn(null, h.id).catch((e) => console.error("auto-release", h.id, e));

  // 4. Long-stay holds past their window without move-in → one admin flag per hold.
  const lapsed = await db.select({ id: holds.id, unitId: holds.unitId }).from(holds)
    .where(and(eq(holds.status, "HELD"), isNull(holds.startsAt), lt(holds.heldUntil, new Date())));
  for (const h of lapsed) {
    const exists = await db.select({ id: flags.id }).from(flags).where(and(eq(flags.holdId, h.id), eq(flags.kind, "NON_RESPONSIVE"))).limit(1);
    if (exists.length) continue;
    const [u] = await db.select({ propertyId: units.propertyId }).from(units).where(eq(units.id, h.unitId));
    await db.insert(flags).values({ kind: "NON_RESPONSIVE", holdId: h.id, propertyId: u.propertyId, reason: "Reservation passed its hold window without move-in confirmation. Contact both parties, then confirm or refund." });
  }
  return { overdue: overdue.length, polled: pending.length, released: due.length, lapsed: lapsed.length };
}

