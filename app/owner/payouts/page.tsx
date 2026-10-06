import { and, desc, eq } from "drizzle-orm";
import { Wallet } from "lucide-react";
import { db } from "@/db";
import { ledgerEntries, payouts } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { config } from "@/lib/config";
import { availableForPayout } from "@/lib/ledger";
import { formatUGX } from "@/lib/rules";
import { requestPayoutAction } from "@/app/actions/owner";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, Select, Stat, StatusBadge, dateFmt } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const user = await requireRole(["LANDLORD", "ADMIN"], "/owner/payouts");
  const cfg = config();
  const [wallet, history, entries] = await Promise.all([
    availableForPayout(db, user.id),
    db.select().from(payouts).where(eq(payouts.landlordId, user.id)).orderBy(desc(payouts.createdAt)).limit(30),
    db.select().from(ledgerEntries).where(and(eq(ledgerEntries.account, "LANDLORD_PAYABLE"), eq(ledgerEntries.ownerId, user.id))).orderBy(desc(ledgerEntries.createdAt)).limit(50),
  ]);

  return (
    <div>
      <PageHeader title="Payouts" subtitle="Deposits land here once tenants confirm move-in, minus the platform fee." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Available to withdraw" value={formatUGX(wallet.available)} tone="brand" />
        <Stat label="Withdrawals in progress" value={formatUGX(wallet.inFlight)} />
        <Stat label="Total balance" value={formatUGX(wallet.earned)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><Wallet className="size-5" /> Request payout</h2>
          {user.landlordStatus !== "VERIFIED" ? (
            <p className="text-sm text-muted">Withdrawals open once your ID is verified.</p>
          ) : (
            <ActionForm action={requestPayoutAction} className="space-y-3" resetOnSuccess>
              <Field label="Amount (UGX)" hint={`Min ${formatUGX(cfg.MIN_PAYOUT_UGX)}`}><Input name="amountUgx" inputMode="numeric" defaultValue={wallet.available || ""} required /></Field>
              <Field label="Send to">
                <Select name="method" defaultValue="MTN"><option value="MTN">MTN Mobile Money</option><option value="AIRTEL">Airtel Money</option><option value="BANK">Bank account</option></Select>
              </Field>
              <Field label="Number or bank details" hint="Mobile Money number, or bank + account no."><Input name="destination" defaultValue={user.phone.replace("+256", "0")} required /></Field>
              <SubmitButton className="w-full" disabled={wallet.available < cfg.MIN_PAYOUT_UGX}>Request payout</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-2 font-bold">Withdrawals</h2>
            {history.length ? (
              <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">Date</th><th className="p-3">To</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {history.map((p) => (
                      <tr key={p.id}><td className="p-3">{dateFmt(p.createdAt)}</td><td className="p-3">{p.method} · {p.destination}</td><td className="tabular p-3 text-right font-semibold">{formatUGX(p.amountUgx)}</td><td className="p-3"><StatusBadge status={p.status} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="No withdrawals yet" />}
          </section>
          <section>
            <h2 className="mb-2 font-bold">Transaction history</h2>
            {entries.length ? (
              <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white text-sm">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 p-3">
                    <span><span className="block font-medium">{e.memo}</span><span className="text-xs text-muted">{dateFmt(e.createdAt)}</span></span>
                    <span className={`tabular font-bold ${e.amount > 0 ? "text-brand" : "text-navy"}`}>{e.amount > 0 ? "+" : "−"}{formatUGX(Math.abs(e.amount))}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty title="No transactions yet" />}
          </section>
        </div>
      </div>
    </div>
  );
}
