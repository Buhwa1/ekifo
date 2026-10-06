import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { payouts, users, holds, units, properties, payments, ledgerEntries } from "@/db/schema";
import { balance } from "@/lib/ledger";
import { formatUGX } from "@/lib/rules";
import { payoutReviewAction, payoutExecuteAction, adminConfirmHoldAction, adminRefundHoldAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Input, PageHeader, Stat, StatusBadge, dateFmt, dateTimeFmt } from "@/components/ui";
import { availableForPayout } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financial ledger" };

export default async function FinancePage() {
  const [escrow, revenue, paidOut, refunded, queue, active, recentPayments] = await Promise.all([
    balance(db, "ESCROW"),
    balance(db, "PLATFORM_REVENUE"),
    balance(db, "PAYOUT_CLEARING"),
    balance(db, "REFUND_CLEARING"),
    db.select({ p: payouts, u: users }).from(payouts).innerJoin(users, eq(users.id, payouts.landlordId))
      .where(inArray(payouts.status, ["REQUESTED", "APPROVED", "FAILED"])).orderBy(asc(payouts.createdAt)),
    db.select({ h: holds, u: units, p: properties, s: users }).from(holds)
      .innerJoin(units, eq(units.id, holds.unitId)).innerJoin(properties, eq(properties.id, units.propertyId)).innerJoin(users, eq(users.id, holds.seekerId))
      .where(eq(holds.status, "HELD")).orderBy(asc(holds.heldUntil)).limit(50),
    db.select().from(payments).orderBy(desc(payments.createdAt)).limit(25),
  ]);
  const balances = await Promise.all(queue.map((q) => availableForPayout(db, q.p.landlordId)));
  const [pendingFees] = await db.select({ total: sql<string>`coalesce(sum(${holds.commissionUgx}), 0)` }).from(holds).where(eq(holds.status, "HELD"));

  return (
    <div className="space-y-10">
      <PageHeader title="Financial ledger" subtitle="All figures come from the double-entry ledger, never from cached totals." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Escrow held" value={formatUGX(escrow)} tone="amber" hint={`${active.length} active holds`} />
        <Stat label="Platform revenue" value={formatUGX(revenue)} tone="brand" hint={`${formatUGX(Number(pendingFees.total))} pending in escrow`} />
        <Stat label="Paid to landlords" value={formatUGX(paidOut)} />
        <Stat label="Refunded to seekers" value={formatUGX(refunded)} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Payout requests <span className="text-muted">({queue.length})</span></h2>
        {queue.length ? queue.map(({ p, u }, i) => (
          <Card key={p.id} className="mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-bold">{formatUGX(p.amountUgx)} → {p.method} {p.destination}</p>
              <p className="text-sm text-muted">{u.name ?? u.phone} · requested {dateFmt(p.createdAt)} · ledger balance {formatUGX(balances[i].earned)}</p>
              {p.note ? <p className="text-xs text-muted">{p.note}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={p.status} />
              {p.status === "REQUESTED" ? (
                <>
                  <ActionButton action={payoutReviewAction.bind(null, p.id, true)} variant="primary">Approve</ActionButton>
                  <ActionForm action={payoutReviewAction.bind(null, p.id, false)} className="flex gap-1">
                    <Input name="note" placeholder="Reason" className="h-9 w-36" required />
                    <SubmitButton size="sm" variant="danger">Reject</SubmitButton>
                  </ActionForm>
                </>
              ) : p.status === "APPROVED" ? (
                <ActionForm action={payoutExecuteAction.bind(null, p.id)} className="flex gap-1" confirm={`Send ${formatUGX(p.amountUgx)} to ${p.destination}?`}>
                  {p.method === "BANK" ? <Input name="reference" placeholder="Bank ref" className="h-9 w-32" required /> : null}
                  <SubmitButton size="sm" variant="navy">{p.method === "BANK" ? "Mark sent" : "Send now"}</SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          </Card>
        )) : <Empty title="No payouts waiting" />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Escrow — active reservations</h2>
        {active.length ? (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">Space</th><th className="p-3">Tenant</th><th className="p-3 text-right">Amount</th><th className="p-3">Hold ends</th><th className="p-3">Action</th></tr></thead>
              <tbody className="divide-y divide-line">
                {active.map(({ h, u, p, s }) => (
                  <tr key={h.id} className={h.heldUntil && h.heldUntil < new Date() ? "bg-amber-50" : ""}>
                    <td className="p-3">{p.name} · {u.label}</td>
                    <td className="p-3">{s.name ?? ""} {s.phone}</td>
                    <td className="tabular p-3 text-right font-semibold">{formatUGX(h.amountUgx)}</td>
                    <td className="p-3">{h.heldUntil ? dateTimeFmt(h.heldUntil) : "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <ActionButton action={adminConfirmHoldAction.bind(null, h.id)} variant="outline" confirm="Release escrow to the landlord?">Release</ActionButton>
                        <ActionButton action={adminRefundHoldAction.bind(null, h.id)} variant="danger" confirm="Refund the tenant in full?">Refund</ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Nothing in escrow" />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Recent Mobile Money collections</h2>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">When</th><th className="p-3">Reference</th><th className="p-3">From</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {recentPayments.map((x) => (
                <tr key={x.id}><td className="p-3">{dateTimeFmt(x.createdAt)}</td><td className="p-3 font-mono text-xs">{x.txRef}</td><td className="p-3">{x.network} {x.msisdn}</td><td className="tabular p-3 text-right">{formatUGX(x.amountUgx)}</td><td className="p-3"><StatusBadge status={x.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
