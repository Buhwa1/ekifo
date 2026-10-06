import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Clock, Plus, ShieldAlert } from "lucide-react";
import { db } from "@/db";
import { properties, units, visits, holds, ledgerEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { availableForPayout } from "@/lib/ledger";
import { formatUGX, CATEGORY_LABEL } from "@/lib/rules";
import { ButtonLink, Card, Empty, PageHeader, Stat, StatusBadge, imgSrc } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My spaces" };

export default async function OwnerHome({ searchParams }: { searchParams: Promise<{ created?: string; submitted?: string }> }) {
  const user = await requireUser("/owner");
  if (user.role === "SEEKER") redirect("/owner/verify");
  const sp = await searchParams;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const props = await db.select({
    p: properties,
    cover: sql<string | null>`(select m.url from media m where m.property_id = "properties"."id" and m.kind = 'PHOTO' order by m.position limit 1)`,
  }).from(properties).where(eq(properties.ownerId, user.id)).orderBy(desc(properties.createdAt));
  const ids = props.map((x) => x.p.id);

  const [unitStats, [leads], [revenue], wallet] = await Promise.all([
    ids.length ? db.select({ status: units.status, n: count() }).from(units).where(inArray(units.propertyId, ids)).groupBy(units.status) : Promise.resolve([]),
    ids.length
      ? db.select({ n: count() }).from(visits).innerJoin(units, eq(units.id, visits.unitId)).where(and(inArray(units.propertyId, ids), gte(visits.createdAt, monthStart)))
      : Promise.resolve([{ n: 0 }]),
    db.select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.amount} > 0), 0)` }).from(ledgerEntries)
      .where(and(eq(ledgerEntries.account, "LANDLORD_PAYABLE"), eq(ledgerEntries.ownerId, user.id), gte(ledgerEntries.createdAt, monthStart))),
    availableForPayout(db, user.id),
  ]);
  const holdLeads = ids.length
    ? (await db.select({ n: count() }).from(holds).innerJoin(units, eq(units.id, holds.unitId)).where(and(inArray(units.propertyId, ids), gte(holds.createdAt, monthStart), inArray(holds.status, ["HELD", "CONFIRMED"]))))[0].n
    : 0;
  const by = Object.fromEntries(unitStats.map((s) => [s.status, s.n])) as Record<string, number>;
  const total = Object.values(by).reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader
        title="My spaces"
        subtitle={user.name ?? undefined}
        action={user.landlordStatus !== "REJECTED" ? <ButtonLink href="/owner/listings/new"><Plus className="size-4" /> Add new space</ButtonLink> : null}
      />

      {user.landlordStatus === "PENDING" ? (
        <Banner icon={<Clock className="size-5" />} tone="amber">
          {sp.submitted ? "Thanks! " : ""}Your ID is being reviewed — usually within one working day. You can prepare listings now; they go live after approval.
        </Banner>
      ) : user.landlordStatus === "REJECTED" ? (
        <Banner icon={<ShieldAlert className="size-5" />} tone="red">We couldn't verify your documents. <Link href="/owner/verify" className="font-bold underline">Resubmit</Link></Banner>
      ) : null}
      {sp.created ? <Banner tone="green">Listing submitted. Our team reviews photos and documents before it goes live — you'll get an SMS.</Banner> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total units" value={total} hint={`${by.OCCUPIED ?? 0} occupied`} />
        <Stat label="Vacant" value={by.VACANT ?? 0} tone="brand" hint={`${by.RESERVED ?? 0} reserved`} />
        <Stat label="Leads this month" value={leads.n + holdLeads} hint={`${leads.n} visits · ${holdLeads} deposits`} />
        <Stat label="Earned this month" value={formatUGX(Number(revenue.total))} hint={<Link href="/owner/payouts" className="font-semibold text-brand">{formatUGX(wallet.available)} withdrawable</Link>} />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">Listings</h2>
      {props.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {props.map(({ p, cover }) => (
            <Card key={p.id} className="flex min-w-0 gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgSrc(cover, 200)} alt="" className="size-20 shrink-0 rounded-xl object-cover" loading="lazy" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/spaces/${p.id}`} className="truncate font-bold hover:underline">{p.name}</Link>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-sm text-muted">{CATEGORY_LABEL[p.category]} · {p.suburb}</p>
                <p className="mt-1 text-sm"><b>{p.vacantCount}</b> vacant · from {p.minPriceUgx ? formatUGX(p.minPriceUgx) : "—"}</p>
                {p.status === "REJECTED" && p.reviewNote ? <p className="mt-1 text-xs text-danger">{p.reviewNote}</p> : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty title="No listings yet">Add your first hostel, stall or apartment — it takes about five minutes.</Empty>
      )}
    </div>
  );
}

function Banner({ children, icon, tone }: { children: React.ReactNode; icon?: React.ReactNode; tone: "amber" | "red" | "green" }) {
  const c = { amber: "bg-accent-soft text-amber-900", red: "bg-red-50 text-red-800", green: "bg-brand-soft text-emerald-900" }[tone];
  return <div className={`mb-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${c}`}>{icon}<p>{children}</p></div>;
}
