// Integration tests for the money path, against a real Postgres (TEST_DATABASE_URL).
// Run: npm test   (creates/migrates the test DB automatically via scripts/test-db.ts)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL!.replace(/\/(\w+)(\?|$)/, "/$1_test$2");
process.env.PAYMENT_PROVIDER = "mock";
process.env.SMS_PROVIDER = "console";

const { db, pool } = await import("@/db");
const S = await import("@/db/schema");
const { eq, and } = await import("drizzle-orm");
const booking = await import("./booking");
const ledger = await import("./ledger");
const payouts = await import("./payouts");
const { DomainError } = await import("./errors");
const { kampalaAt, kampalaDate } = await import("./rules");

let n = 0;
const phone = () => `+25677${String(Date.now()).slice(-5)}${String(n++).padStart(2, "0")}`;

async function fixture(units = 2) {
  const [owner] = await db.insert(S.users).values({ phone: phone(), name: "Owner", role: "LANDLORD", landlordStatus: "VERIFIED" }).returning();
  const [prop] = await db.insert(S.properties).values({ ownerId: owner.id, name: "Test Hostel", type: "hostel", district: "Kampala", suburb: "Kikoni", address: "Plot 1", status: "LIVE" }).returning();
  const us = await db.insert(S.units).values(Array.from({ length: units }, (_, i) => ({ propertyId: prop.id, label: `R${i}`, priceUgx: 900_000, cycle: "PER_SEMESTER" as const, depositUgx: 100_000 }))).returning();
  const seekers = await db.insert(S.users).values(Array.from({ length: 5 }, () => ({ phone: phone(), name: "Seeker" }))).returning();
  return { owner, prop, units: us, seekers };
}
const asActor = (u: typeof S.users.$inferSelect) => ({ ...u, role: u.role });
const paid = (amountUgx: number) => ({ outcome: "SUCCESSFUL" as const, amountUgx, currency: "UGX", providerRef: "P1" });
const txRefFor = async (holdId: string) => (await db.select().from(S.payments).where(eq(S.payments.holdId, holdId)))[0].txRef;

before(async () => {
  await db.execute((await import("drizzle-orm")).sql`select 1`);
});
after(async () => pool.end());

test("only one of five concurrent seekers can start a hold on the same unit", async () => {
  const f = await fixture(1);
  const results = await Promise.allSettled(
    f.seekers.map((s) => booking.createHold(asActor(s), { unitId: f.units[0].id, msisdn: "+256772000111", network: "MTN" })),
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1);
  for (const r of results) if (r.status === "rejected") assert.ok(r.reason instanceof DomainError, String(r.reason));
});

test("payment → HELD → move-in releases escrow minus commission, idempotently", async () => {
  const f = await fixture(1);
  const { holdId } = await booking.createHold(asActor(f.seekers[0]), { unitId: f.units[0].id, msisdn: "+256772000111", network: "MTN" });
  const ref = await txRefFor(holdId);

  await booking.settlePayment(ref, paid(100_000));
  await booking.settlePayment(ref, paid(100_000)); // duplicate webhook
  const [h] = await db.select().from(S.holds).where(eq(S.holds.id, holdId));
  assert.equal(h.status, "HELD");
  const [u] = await db.select().from(S.units).where(eq(S.units.id, f.units[0].id));
  assert.equal(u.status, "RESERVED");
  const escrowRows = await db.select().from(S.ledgerEntries).where(and(eq(S.ledgerEntries.holdId, holdId), eq(S.ledgerEntries.account, "ESCROW")));
  assert.equal(escrowRows.length, 1, "duplicate settlement must not double-post");

  await assert.rejects(() => booking.confirmMoveIn(asActor(f.owner), holdId), DomainError); // landlord can't release own escrow
  await booking.confirmMoveIn(asActor(f.seekers[0]), holdId);
  await booking.confirmMoveIn(asActor(f.seekers[0]), holdId); // double tap

  assert.equal(await ledger.balance(db, "LANDLORD_PAYABLE", f.owner.id), 96_000);
  const t = await db.select().from(S.tenancies).where(eq(S.tenancies.holdId, holdId));
  assert.equal(t.length, 1);
  assert.equal(t[0].requiresWritten, false); // 900k/semester ≈ 225k/month
});

test("landlord release refunds the seeker and frees the unit", async () => {
  const f = await fixture(1);
  const { holdId } = await booking.createHold(asActor(f.seekers[1]), { unitId: f.units[0].id, msisdn: "+256772000111", network: "MTN" });
  await booking.settlePayment(await txRefFor(holdId), paid(100_000));
  await booking.releaseHold(asActor(f.owner), holdId, "Unit needs repairs");
  const [h] = await db.select().from(S.holds).where(eq(S.holds.id, holdId));
  const [u] = await db.select().from(S.units).where(eq(S.units.id, f.units[0].id));
  assert.equal(h.status, "REFUNDED");
  assert.equal(u.status, "VACANT");
  const legs = await db.select().from(S.ledgerEntries).where(eq(S.ledgerEntries.holdId, holdId));
  assert.equal(legs.reduce((s, l) => s + (l.account === "ESCROW" ? l.amount : 0), 0), 0, "escrow for this hold is empty");
});

test("failed payment expires the hold so someone else can book", async () => {
  const f = await fixture(1);
  const a = await booking.createHold(asActor(f.seekers[0]), { unitId: f.units[0].id, msisdn: "+256772000111", network: "MTN" });
  await booking.settlePayment(await txRefFor(a.holdId), { outcome: "FAILED", amountUgx: null, currency: null, providerRef: null });
  const b = await booking.createHold(asActor(f.seekers[1]), { unitId: f.units[0].id, msisdn: "+256772000222", network: "MTN" });
  assert.ok(b.holdId);
});

test("late payment after the unit was taken is refunded automatically", async () => {
  const f = await fixture(1);
  const a = await booking.createHold(asActor(f.seekers[0]), { unitId: f.units[0].id, msisdn: "+256772000111", network: "MTN" });
  const refA = await txRefFor(a.holdId);
  await booking.releaseHold(asActor(f.seekers[0]), a.holdId, "changed mind"); // cancel while pending
  const b = await booking.createHold(asActor(f.seekers[1]), { unitId: f.units[0].id, msisdn: "+256772000222", network: "MTN" });
  await booking.settlePayment(await txRefFor(b.holdId), paid(100_000));
  await booking.settlePayment(refA, paid(100_000)); // A's money finally arrives

  const [ha] = await db.select().from(S.holds).where(eq(S.holds.id, a.holdId));
  const [hb] = await db.select().from(S.holds).where(eq(S.holds.id, b.holdId));
  assert.equal(hb.status, "HELD");
  assert.notEqual(ha.status, "HELD");
  const refund = await db.select().from(S.ledgerEntries).where(and(eq(S.ledgerEntries.holdId, a.holdId), eq(S.ledgerEntries.account, "REFUND_CLEARING")));
  assert.equal(refund[0]?.amount, 100_000);
});

test("underpayment is never accepted", async () => {
  const f = await fixture(1);
  const a = await booking.createHold(asActor(f.seekers[0]), { unitId: f.units[0].id, msisdn: "+256772000111", network: "MTN" });
  await booking.settlePayment(await txRefFor(a.holdId), paid(1_000));
  const [h] = await db.select().from(S.holds).where(eq(S.holds.id, a.holdId));
  assert.equal(h.status, "EXPIRED");
});

test("payouts can't exceed the balance, even when requested concurrently", async () => {
  const f = await fixture(2);
  for (const [i, unit] of f.units.entries()) {
    const { holdId } = await booking.createHold(asActor(f.seekers[i]), { unitId: unit.id, msisdn: "+256772000111", network: "MTN" });
    await booking.settlePayment(await txRefFor(holdId), paid(100_000));
    await booking.confirmMoveIn(asActor(f.seekers[i]), holdId);
  }
  // balance 192,000. Two concurrent 150k requests: exactly one may pass.
  const rs = await Promise.allSettled([1, 2].map(() => payouts.requestPayout(f.owner, { amountUgx: 150_000, method: "MTN", destination: "0772123456" })));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);

  const [admin] = await db.insert(S.users).values({ phone: phone(), role: "ADMIN" }).returning();
  const id = (rs.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<string>).value;
  await payouts.reviewPayout(admin, id, true);
  await payouts.executePayout(admin, id);
  assert.equal(await ledger.balance(db, "LANDLORD_PAYABLE", f.owner.id), 42_000);
});

test("ledger is balanced across every movement", async () => {
  assert.equal(await ledger.unbalancedGroups(db), 0);
});

// ─── Time-slot bookings ──────────────────────────────────────────────────────
async function turf() {
  const [owner] = await db.insert(S.users).values({ phone: phone(), name: "Turf owner", role: "LANDLORD", landlordStatus: "VERIFIED" }).returning();
  const [prop] = await db.insert(S.properties).values({ ownerId: owner.id, name: "Test Turf", type: "turf_sports", district: "Kampala", suburb: "Kyanja", address: "Plot 9", status: "LIVE", openFrom: 6, openTo: 23 }).returning();
  const [pitch] = await db.insert(S.units).values({ propertyId: prop.id, label: "Pitch A", priceUgx: 80_000, cycle: "PER_HOUR", depositUgx: 80_000 }).returning();
  const seekers = await db.insert(S.users).values(Array.from({ length: 4 }, () => ({ phone: phone(), name: "Player" }))).returning();
  const day = kampalaDate(new Date(Date.now() + 3 * 86_400_000));
  return { owner, prop, pitch, seekers, at: (h: number) => kampalaAt(day, h) };
}

test("slots: four people racing for 6–8pm on one pitch — exactly one wins", async () => {
  const t = await turf();
  const rs = await Promise.allSettled(t.seekers.map((s) =>
    booking.createHold(asActor(s), { unitId: t.pitch.id, msisdn: "+256772000111", network: "MTN", startsAt: t.at(18), endsAt: t.at(20) })));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of rs) if (r.status === "rejected") assert.ok(r.reason instanceof DomainError, String(r.reason));
});

test("slots: overlapping refused, back-to-back allowed, priced per hour", async () => {
  const t = await turf();
  const a = await booking.createHold(asActor(t.seekers[0]), { unitId: t.pitch.id, msisdn: "+256772000111", network: "MTN", startsAt: t.at(18), endsAt: t.at(20) });
  await assert.rejects(() => booking.createHold(asActor(t.seekers[1]), { unitId: t.pitch.id, msisdn: "+256772000222", network: "MTN", startsAt: t.at(19), endsAt: t.at(21) }), DomainError);
  const b = await booking.createHold(asActor(t.seekers[1]), { unitId: t.pitch.id, msisdn: "+256772000222", network: "MTN", startsAt: t.at(20), endsAt: t.at(22) });
  const [ha] = await db.select().from(S.holds).where(eq(S.holds.id, a.holdId));
  const [hb] = await db.select().from(S.holds).where(eq(S.holds.id, b.holdId));
  assert.equal(ha.amountUgx, 160_000);
  assert.equal(hb.amountUgx, 160_000);
});

test("slots: a failed payment frees the window", async () => {
  const t = await turf();
  const a = await booking.createHold(asActor(t.seekers[0]), { unitId: t.pitch.id, msisdn: "+256772000111", network: "MTN", startsAt: t.at(9), endsAt: t.at(10) });
  await booking.settlePayment(await txRefFor(a.holdId), { outcome: "FAILED", amountUgx: null, currency: null, providerRef: null });
  const b = await booking.createHold(asActor(t.seekers[1]), { unitId: t.pitch.id, msisdn: "+256772000222", network: "MTN", startsAt: t.at(9), endsAt: t.at(10) });
  assert.ok(b.holdId);
});

test("slots: paid booking leaves the unit bookable and is released to the venue after the slot", async () => {
  const t = await turf();
  const a = await booking.createHold(asActor(t.seekers[0]), { unitId: t.pitch.id, msisdn: "+256772000111", network: "MTN", startsAt: t.at(7), endsAt: t.at(8) });
  await booking.settlePayment(await txRefFor(a.holdId), paid(80_000));
  const [u] = await db.select().from(S.units).where(eq(S.units.id, t.pitch.id));
  assert.equal(u.status, "VACANT", "a time booking must not lock the whole pitch");
  await assert.rejects(() => booking.confirmMoveIn(asActor(t.seekers[0]), a.holdId), DomainError); // not started yet

  // Pretend the slot happened two days ago, then run the sweep.
  await db.update(S.holds).set({ heldUntil: new Date(Date.now() - 60_000) }).where(eq(S.holds.id, a.holdId));
  await booking.sweepHolds();
  const [h] = await db.select().from(S.holds).where(eq(S.holds.id, a.holdId));
  assert.equal(h.status, "CONFIRMED");
  assert.equal(await ledger.balance(db, "LANDLORD_PAYABLE", t.owner.id), 80_000 - 3_200);
  assert.equal((await db.select().from(S.tenancies).where(eq(S.tenancies.holdId, a.holdId))).length, 0, "no tenancy for a one-off booking");
});

test("slots: an open dispute stops the automatic release", async () => {
  const t = await turf();
  const a = await booking.createHold(asActor(t.seekers[2]), { unitId: t.pitch.id, msisdn: "+256772000111", network: "MTN", startsAt: t.at(11), endsAt: t.at(12) });
  await booking.settlePayment(await txRefFor(a.holdId), paid(80_000));
  await booking.openDispute(asActor(t.seekers[2]), a.holdId, "The pitch was waterlogged and unusable.");
  await db.update(S.holds).set({ heldUntil: new Date(Date.now() - 60_000) }).where(eq(S.holds.id, a.holdId));
  await booking.sweepHolds();
  const [h] = await db.select().from(S.holds).where(eq(S.holds.id, a.holdId));
  assert.equal(h.status, "HELD");
});

test("slots: maintenance blocks new bookings", async () => {
  const t = await turf();
  await db.update(S.units).set({ status: "MAINTENANCE" }).where(eq(S.units.id, t.pitch.id));
  await assert.rejects(
    () => booking.createHold(asActor(t.seekers[3]), { unitId: t.pitch.id, msisdn: "+256772000111", network: "MTN", startsAt: t.at(15), endsAt: t.at(16) }),
    /maintenance/,
  );
});

test("ledger stays balanced after slot bookings", async () => {
  assert.equal(await ledger.unbalancedGroups(db), 0);
});
