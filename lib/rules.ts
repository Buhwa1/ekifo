// Pure business rules — no I/O, so they are unit-tested in lib/rules.test.ts.

export type Cycle = "PER_DAY" | "PER_MONTH" | "PER_SEMESTER";
export type Category = "HOSTEL" | "ARCADE" | "RESIDENTIAL" | "FLEXI_STAY";

const ugxFmt = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
export const formatUGX = (n: number) => `UGX ${ugxFmt.format(Math.round(n))}`;

export const CYCLE_LABEL: Record<Cycle, string> = {
  PER_DAY: "per day",
  PER_MONTH: "per month",
  PER_SEMESTER: "per semester",
};
export const CYCLE_SHORT: Record<Cycle, string> = { PER_DAY: "/day", PER_MONTH: "/mo", PER_SEMESTER: "/sem" };

export const CATEGORY_LABEL: Record<Category, string> = {
  HOSTEL: "Hostels",
  ARCADE: "Commercial arcades",
  RESIDENTIAL: "Residential rentals",
  FLEXI_STAY: "Flexi-stays",
};

/** Commission in whole shillings, always rounded up so the platform never under-collects by a shilling. */
export function commissionFor(amountUgx: number, bps: number): number {
  if (!Number.isInteger(amountUgx) || amountUgx < 0) throw new Error("amount must be a non-negative integer");
  return Math.ceil((amountUgx * bps) / 10_000);
}

/** Rough monthly equivalent, used to decide whether a written agreement is required. */
export function monthlyEquivalent(priceUgx: number, cycle: Cycle): number {
  switch (cycle) {
    case "PER_DAY":
      return priceUgx * 30;
    case "PER_MONTH":
      return priceUgx;
    case "PER_SEMESTER":
      return Math.round(priceUgx / 4); // ~4-month semester
  }
}

export function requiresWrittenAgreement(priceUgx: number, cycle: Cycle, thresholdUgx: number): boolean {
  return monthlyEquivalent(priceUgx, cycle) >= thresholdUgx;
}

export interface RentChangeRecord {
  oldRentUgx: number;
  newRentUgx: number;
  effectiveAt: Date;
}

export type RentCheck = { ok: true } | { ok: false; reason: string; maxAllowedUgx?: number };

/**
 * Rent increase guard for an ACTIVE tenancy.
 * The cumulative increase over any trailing 12-month window may not exceed capBps of the rent that
 * applied at the start of that window, and the change needs at least noticeDays of notice.
 * Decreases are always allowed.
 */
export function checkRentIncrease(opts: {
  currentRentUgx: number;
  proposedRentUgx: number;
  effectiveAt: Date;
  now: Date;
  history: RentChangeRecord[];
  capBps: number;
  noticeDays: number;
}): RentCheck {
  const { currentRentUgx, proposedRentUgx, effectiveAt, now, history, capBps, noticeDays } = opts;
  if (!Number.isInteger(proposedRentUgx) || proposedRentUgx <= 0)
    return { ok: false, reason: "Rent must be a positive whole number of shillings." };
  if (proposedRentUgx <= currentRentUgx) return { ok: true };

  const minEffective = new Date(now.getTime() + noticeDays * 86_400_000);
  if (effectiveAt < minEffective)
    return { ok: false, reason: `Rent increases need at least ${noticeDays} days' written notice.` };

  // Baseline = rent in force exactly 12 months before the new change takes effect.
  const windowStart = new Date(effectiveAt);
  windowStart.setFullYear(windowStart.getFullYear() - 1);
  const sorted = [...history].sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
  const firstInWindow = sorted.find((c) => c.effectiveAt > windowStart);
  const baseline = firstInWindow ? firstInWindow.oldRentUgx : currentRentUgx;

  const maxAllowed = Math.floor(baseline * (1 + capBps / 10_000));
  if (proposedRentUgx > maxAllowed)
    return {
      ok: false,
      maxAllowedUgx: maxAllowed,
      reason: `That is more than the ${capBps / 100}% annual cap. The most you can charge from that date is ${formatUGX(maxAllowed)}.`,
    };
  return { ok: true };
}

// ─── Phone numbers ───────────────────────────────────────────────────────────
/** Normalises Ugandan numbers ("0772 123456", "256772123456", "+256 772 123 456") to E.164. */
export function normalizeUgPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let local: string;
  if (/^\+256\d{9}$/.test(digits)) local = digits.slice(4);
  else if (/^256\d{9}$/.test(digits)) local = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) local = digits.slice(1);
  else if (/^7\d{8}$/.test(digits)) local = digits;
  else return null;
  if (!/^7\d{8}$/.test(local)) return null; // mobile numbers only
  return `+256${local}`;
}

/** Best-effort network detection from the prefix; the user can always override it. */
export function detectNetwork(e164: string): "MTN" | "AIRTEL" | null {
  const p = e164.slice(4, 6);
  if (["76", "77", "78"].includes(p)) return "MTN";
  if (["70", "74", "75"].includes(p)) return "AIRTEL";
  return null;
}

export const maskPhone = (e164: string) => `${e164.slice(0, 7)}•••${e164.slice(-3)}`;
