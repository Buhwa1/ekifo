// Pure business rules — no I/O, so they are unit-tested in lib/rules.test.ts.

export type Cycle = "PER_DAY" | "PER_MONTH" | "PER_SEMESTER" | "PER_HOUR" | "PER_EVENT_SLOT";
export const ALL_CYCLES: Cycle[] = ["PER_SEMESTER", "PER_MONTH", "PER_DAY", "PER_HOUR", "PER_EVENT_SLOT"];
export type Group = "STAY" | "BUSINESS" | "LEISURE";
export type UnitStatus = "VACANT" | "RESERVED" | "OCCUPIED" | "UNLISTED" | "MAINTENANCE" | "UNDER_CONSTRUCTION";

const ugxFmt = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
export const formatUGX = (n: number) => `UGX ${ugxFmt.format(Math.round(n))}`;

export const CYCLE_LABEL: Record<Cycle, string> = {
  PER_DAY: "per day",
  PER_MONTH: "per month",
  PER_SEMESTER: "per semester",
  PER_HOUR: "per hour",
  PER_EVENT_SLOT: "per event slot",
};
export const CYCLE_SHORT: Record<Cycle, string> = { PER_DAY: "/day", PER_MONTH: "/mo", PER_SEMESTER: "/sem", PER_HOUR: "/hr", PER_EVENT_SLOT: "/slot" };
export const isSlotCycle = (c: Cycle) => c === "PER_HOUR" || c === "PER_EVENT_SLOT";

export const GROUP_LABEL: Record<Group, string> = { STAY: "Places to stay", BUSINESS: "Business spaces", LEISURE: "Leisure & events" };
export const GROUP_SHORT: Record<Group, string> = { STAY: "Stay", BUSINESS: "Business", LEISURE: "Leisure" };

/** What seekers see for each unit status. RESERVED is shown as "Booked". */
export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  VACANT: "Vacant",
  RESERVED: "Booked",
  OCCUPIED: "Occupied",
  UNLISTED: "Hidden",
  MAINTENANCE: "Under maintenance",
  UNDER_CONSTRUCTION: "Under construction",
};

// ─── Time-slot bookings ─────────────────────────────────────────────────────
// All times are Kampala (UTC+3, no daylight saving), so plain offset maths is exact.
export const KAMPALA_OFFSET_MS = 3 * 3_600_000;
export const kampalaHour = (d: Date) => new Date(d.getTime() + KAMPALA_OFFSET_MS).getUTCHours();
export const kampalaDate = (d: Date) => new Date(d.getTime() + KAMPALA_OFFSET_MS).toISOString().slice(0, 10);
/** "2026-10-12", 14 → that hour in Kampala as an absolute instant. */
export const kampalaAt = (date: string, hour: number) => new Date(Date.parse(`${date}T00:00:00Z`) + hour * 3_600_000 - KAMPALA_OFFSET_MS);

export interface EventSlot { key: string; label: string; from: number; to: number }
/** Standard event blocks. Only blocks that fit inside a venue's opening hours are offered. */
export const EVENT_SLOTS: EventSlot[] = [
  { key: "morning", label: "Morning", from: 8, to: 12 },
  { key: "afternoon", label: "Afternoon", from: 13, to: 17 },
  { key: "evening", label: "Evening", from: 18, to: 23 },
];
export const slotsFor = (openFrom: number, openTo: number) => EVENT_SLOTS.filter((s) => s.from >= openFrom && s.to <= openTo);

export const MAX_BOOKING_HOURS = 12;
export const MAX_DAYS_AHEAD = 90;

export type SlotCheck = { ok: true; amountUgx: number; hours: number } | { ok: false; reason: string };

/**
 * Validates a requested booking window and prices it. Pure — the server calls this before taking
 * any lock, and the overlap itself is enforced by Postgres.
 */
export function checkSlot(opts: {
  cycle: Cycle; priceUgx: number; start: Date; end: Date; openFrom: number; openTo: number; now: Date;
}): SlotCheck {
  const { cycle, priceUgx, start, end, openFrom, openTo, now } = opts;
  if (!isSlotCycle(cycle)) return { ok: false, reason: "This space isn't booked by the hour." };
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { ok: false, reason: "Pick a valid time." };
  if (start.getTime() % 3_600_000 || end.getTime() % 3_600_000) return { ok: false, reason: "Bookings start and end on the hour." };
  if (start.getTime() < now.getTime() + 30 * 60_000) return { ok: false, reason: "Pick a time at least 30 minutes from now." };
  if (start.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return { ok: false, reason: `You can book up to ${MAX_DAYS_AHEAD} days ahead.` };
  if (kampalaDate(start) !== kampalaDate(new Date(end.getTime() - 1))) return { ok: false, reason: "A booking has to start and end on the same day." };
  const h0 = kampalaHour(start);
  const h1 = h0 + (end.getTime() - start.getTime()) / 3_600_000;
  if (h0 < openFrom || h1 > openTo) return { ok: false, reason: `Open ${fmtHour(openFrom)} to ${fmtHour(openTo)}.` };
  const hours = h1 - h0;
  if (cycle === "PER_HOUR") {
    if (hours > MAX_BOOKING_HOURS) return { ok: false, reason: `Book up to ${MAX_BOOKING_HOURS} hours at a time.` };
    return { ok: true, amountUgx: priceUgx * hours, hours };
  }
  const slot = slotsFor(openFrom, openTo).find((s) => s.from === h0 && s.to === h1);
  if (!slot) return { ok: false, reason: "Pick one of the event slots shown." };
  return { ok: true, amountUgx: priceUgx, hours };
}

export const fmtHour = (h: number) => (h === 0 || h === 24 ? "midnight" : h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`);

/** Commission in whole shillings, always rounded up so the platform never under-collects by a shilling. */
export function commissionFor(amountUgx: number, bps: number): number {
  if (!Number.isInteger(amountUgx) || amountUgx < 0) throw new Error("amount must be a non-negative integer");
  return Math.ceil((amountUgx * bps) / 10_000);
}

/** Rough monthly equivalent, used to decide whether a written agreement is required. */
export function monthlyEquivalent(priceUgx: number, cycle: Cycle): number {
  switch (cycle) {
    case "PER_HOUR":
    case "PER_EVENT_SLOT":
      return 0; // one-off bookings never create a tenancy
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
