import Link from "next/link";
import { count, eq, sql, and, gte } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import { db } from "@/db";
import { landlordVerifications, properties, payouts, flags, holds, users, outbox } from "@/db/schema";
import { balance, unbalancedGroups } from "@/lib/ledger";
import { formatUGX } from "@/lib/rules";
import { Card, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const [kyc, listings, pendingPayouts, openFlags, held, escrow, revenue, newUsers, failedSms, broken] = await Promise.all([
    n(db.select({ n: count() }).from(landlordVerifications).where(eq(landlordVerifications.status, "PENDING"))),
    n(db.select({ n: count() }).from(properties).where(eq(properties.status, "PENDING_REVIEW"))),
    n(db.select({ n: count() }).from(payouts).where(sql`${payouts.status} in ('REQUESTED','APPROVED')`)),
    n(db.select({ n: count() }).from(flags).where(eq(flags.status, "OPEN"))),
    n(db.select({ n: count() }).from(holds).where(eq(holds.status, "HELD"))),
    balance(db, "ESCROW"),
    balance(db, "PLATFORM_REVENUE"),
    n(db.select({ n: count() }).from(users).where(gte(users.createdAt, since))),
    n(db.select({ n: count() }).from(outbox).where(and(eq(outbox.status, "FAILED"), gte(outbox.createdAt, since)))),
    unbalancedGroups(db),
  ]);

  return (
    <div>
      <PageHeader title="Operations" subtitle="What needs attention today." />
      {broken ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"><AlertTriangle className="size-4" /> Ledger integrity: {broken} unbalanced transaction group(s). Stop payouts and investigate.</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Queue href="/admin/verification" label="Landlords to verify" n={kyc} />
        <Queue href="/admin/verification" label="Listings to review" n={listings} />
        <Queue href="/admin/finance" label="Payouts to process" n={pendingPayouts} />
        <Queue href="/admin/flags" label="Open flags" n={openFlags} danger />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Escrow held" value={formatUGX(escrow)} hint={`${held} active reservations`} tone="amber" />
        <Stat label="Platform revenue" value={formatUGX(revenue)} tone="brand" hint="All time" />
        <Stat label="New users (30d)" value={newUsers} />
        <Stat label="Failed SMS (30d)" value={failedSms} hint={failedSms ? "Check SMS provider credit" : "All delivered"} />
      </div>
    </div>
  );
}

function Queue({ href, label, n, danger }: { href: string; label: string; n: number; danger?: boolean }) {
  return (
    <Link href={href}>
      <Card className="p-4 transition hover:ring-2 hover:ring-brand/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className={`mt-1 text-3xl font-extrabold tabular ${n && danger ? "text-danger" : n ? "text-accent" : "text-navy"}`}>{n}</p>
      </Card>
    </Link>
  );
}
