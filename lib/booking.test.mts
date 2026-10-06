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

let n = 0;
const phone = () => `+25677${String(Date.now()).slice(-5)}${String(n++).padStart(2, "0")}`;

async function fixture(units = 2) {
  const [owner] = await db.insert(S.users).values({ phone: phone(), name: "Owner", role: "LANDLORD", landlordStatus: "VERIFIED" }).returning();
  const [prop] = await db.insert(S.properties).values({ ownerId: owner.id, name: "Test Hostel", category: "HOSTEL", district: "Kampala", suburb: "Kikoni", address: "Plot 1", status: "LIVE" }).returning();
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
