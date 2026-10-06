import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkRentIncrease, commissionFor, normalizeUgPhone, detectNetwork, requiresWrittenAgreement,
} from "./rules";

const now = new Date("2026-10-01T00:00:00Z");
const in45 = new Date("2026-11-15T00:00:00Z");
const base = { now, capBps: 1000, noticeDays: 30, history: [] };

test("commission rounds up to the shilling", () => {
  assert.equal(commissionFor(100_000, 400), 4_000);
  assert.equal(commissionFor(12_345, 400), 494); // 493.8 → 494
  assert.equal(commissionFor(0, 400), 0);
});

test("rent: decreases always allowed", () => {
  assert.deepEqual(
    checkRentIncrease({ ...base, currentRentUgx: 500_000, proposedRentUgx: 400_000, effectiveAt: now }),
    { ok: true },
  );
});

test("rent: 10% allowed, 10% + 1 shilling refused", () => {
  assert.equal(checkRentIncrease({ ...base, currentRentUgx: 500_000, proposedRentUgx: 550_000, effectiveAt: in45 }).ok, true);
  const r = checkRentIncrease({ ...base, currentRentUgx: 500_000, proposedRentUgx: 550_001, effectiveAt: in45 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.maxAllowedUgx, 550_000);
});

test("rent: notice period enforced", () => {
  const r = checkRentIncrease({
    ...base, currentRentUgx: 500_000, proposedRentUgx: 520_000, effectiveAt: new Date("2026-10-10T00:00:00Z"),
  });
  assert.equal(r.ok, false);
});

test("rent: two small raises inside 12 months cannot be stacked past the cap", () => {
  const history = [{ oldRentUgx: 500_000, newRentUgx: 530_000, effectiveAt: new Date("2026-04-01T00:00:00Z") }];
  const r = checkRentIncrease({ ...base, history, currentRentUgx: 530_000, proposedRentUgx: 560_000, effectiveAt: in45 });
  assert.equal(r.ok, false); // baseline 500k → max 550k
  const ok = checkRentIncrease({ ...base, history, currentRentUgx: 530_000, proposedRentUgx: 550_000, effectiveAt: in45 });
  assert.equal(ok.ok, true);
});

test("rent: an increase older than 12 months resets the baseline", () => {
  const history = [{ oldRentUgx: 400_000, newRentUgx: 440_000, effectiveAt: new Date("2025-06-01T00:00:00Z") }];
  const r = checkRentIncrease({ ...base, history, currentRentUgx: 440_000, proposedRentUgx: 484_000, effectiveAt: in45 });
  assert.equal(r.ok, true);
});

test("phone normalisation", () => {
  assert.equal(normalizeUgPhone("0772 123 456"), "+256772123456");
  assert.equal(normalizeUgPhone("256701234567"), "+256701234567");
  assert.equal(normalizeUgPhone("+256 (0)772"), null);
  assert.equal(normalizeUgPhone("0412345678"), null); // landline
  assert.equal(detectNetwork("+256772123456"), "MTN");
  assert.equal(detectNetwork("+256752123456"), "AIRTEL");
});

test("written agreement threshold uses monthly equivalent", () => {
  assert.equal(requiresWrittenAgreement(500_000, "PER_MONTH", 500_000), true);
  assert.equal(requiresWrittenAgreement(1_200_000, "PER_SEMESTER", 500_000), false); // ~300k/mo
  assert.equal(requiresWrittenAgreement(20_000, "PER_DAY", 500_000), true); // ~600k/mo
});
