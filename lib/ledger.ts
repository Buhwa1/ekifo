import { randomUUID } from "node:crypto";
import { and, eq, sql, inArray } from "drizzle-orm";
import type { Tx } from "@/db";
import { ledgerEntries, payouts } from "@/db/schema";

type Account = (typeof ledgerEntries.$inferInsert)["account"];

export interface Leg {
  account: Account;
  amount: number;
  ownerId?: string | null;
}

/**
 * Post one balanced movement. Throws (and so rolls back the caller's transaction) if the legs
 * don't sum to zero — money can't be created or destroyed by a bug elsewhere.
 */
export async function post(
  tx: Tx,
  legs: Leg[],
  ctx: { memo: string; holdId?: string; payoutId?: string },
) {
  if (legs.length < 2) throw new Error("ledger: need at least two legs");
  const total = legs.reduce((s, l) => s + l.amount, 0);
  if (total !== 0) throw new Error(`ledger: unbalanced movement (${total}) — ${ctx.memo}`);
  if (legs.some((l) => !Number.isInteger(l.amount))) throw new Error("ledger: amounts must be integers");
  const txGroup = randomUUID();
  await tx.insert(ledgerEntries).values(
    legs
      .filter((l) => l.amount !== 0)
      .map((l) => ({
        txGroup,
        account: l.account,
        ownerId: l.ownerId ?? null,
        amount: l.amount,
        holdId: ctx.holdId ?? null,
        payoutId: ctx.payoutId ?? null,
        memo: ctx.memo,
      })),
  );
  return txGroup;
}

export async function balance(tx: Tx, account: Account, ownerId?: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(ownerId ? and(eq(ledgerEntries.account, account), eq(ledgerEntries.ownerId, ownerId)) : eq(ledgerEntries.account, account));
  return Number(row.total);
}

/** What a landlord can request right now: earned balance minus payouts already in the pipeline. */
export async function availableForPayout(tx: Tx, landlordId: string): Promise<{ earned: number; inFlight: number; available: number }> {
  const earned = await balance(tx, "LANDLORD_PAYABLE", landlordId);
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${payouts.amountUgx}), 0)` })
    .from(payouts)
    .where(and(eq(payouts.landlordId, landlordId), inArray(payouts.status, ["REQUESTED", "APPROVED"])));
  const inFlight = Number(row.total);
  return { earned, inFlight, available: Math.max(0, earned - inFlight) };
}

/** Integrity check for the admin dashboard and tests: every tx_group must net to zero. */
export async function unbalancedGroups(tx: Tx): Promise<number> {
  const res = await tx.execute(
    sql`select count(*)::int as n from (select tx_group from ledger_entries group by tx_group having sum(amount) <> 0) x`,
  );
  return Number((res.rows[0] as { n: number }).n);
}
