import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { CalendarClock, Clock, KeyRound, Plus, ShieldAlert, Wallet, CheckCircle2 } from "lucide-react";
import { db } from "@/db";
import { properties, units, visits, holds, ledgerEntries, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { availableForPayout } from "@/lib/ledger";
import { config } from "@/lib/config";
import { formatUGX } from "@/lib/rules";
import { typeMap } from "@/lib/types";
import { fmtWindow } from "@/lib/booking";
import { ButtonLink, Empty, Meter, Section, Stat, StatusBadge, cx, dateTimeFmt, imgSrc } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My spaces" };


/** Midnight on the 1st of the current month in Kampala, as a UTC instant. */
function kampalaMonthStart() {
  const k = new Date(Date.now() + 3 * 3600_000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 3 * 3600_000);
}

export default async function OwnerHome({ searchParams }: { searchParams: Promise<{ created?: string; submitted?: string }> }) {
  const user = await requireUser("/owner");
  if (user.role === "SEEKER") redirect("/owner/verify");
  const sp = await searchParams;
  const cfg = config();
  const monthStart = kampalaMonthStart();

  const props = await db.select({
    p: properties,
    cover: sql<string | null>`(select m.url from media m where m.property_id = "properties"."id" and m.kind = 'PHOTO' order by m.position limit 1)`,
    total: sql<number>`(select count(*)::int from units u where u.property_id = "properties"."id" and u.status <> 'UNLISTED')`,
    occupied: sql<number>`(select count(*)::int from units u where u.property_id = "properties"."id" and u.status in ('OCCUPIED','RESERVED'))`,
  }).from(properties).where(eq(properties.ownerId, user.id)).orderBy(desc(properties.createdAt));
  const ids = props.map((x) => x.p.id);
  const mine = ids.length ? inArray(units.propertyId, ids) : sql`false`;

  const [types, unitStats, [visitLeads], [holdLeads], [revenue], wallet, newVisits, heldNow] = await Promise.all([
    typeMap(),
    db.select({ status: units.status, n: count() }).from(units).where(mine).groupBy(units.status),
    db.select({ n: count() }).from(visits).innerJoin(units, eq(units.id, visits.unitId)).where(and(mine, gte(visits.createdAt, monthStart))),
    db.select({ n: count() }).from(holds).innerJoin(units, eq(units.id, holds.unitId)).where(and(mine, gte(holds.createdAt, monthStart), inArray(holds.status, ["HELD", "CONFIRMED"]))),
    db.select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.amount} > 0), 0)` }).from(ledgerEntries)
      .where(and(eq(ledgerEntries.account, "LANDLORD_PAYABLE"), eq(ledgerEntries.ownerId, user.id), gte(ledgerEntries.createdAt, monthStart))),
    availableForPayout(db, user.id),
    db.select({ v: visits, label: units.label, prop: properties.name, who: users.name, phone: users.phone }).from(visits)
      .innerJoin(units, eq(units.id, visits.unitId)).innerJoin(properties, eq(properties.id, units.propertyId)).innerJoin(users, eq(users.id, visits.seekerId))
      .where(and(mine, eq(visits.status, "REQUESTED"))).orderBy(asc(visits.slotStart)).limit(5),
    db.select({ h: holds, label: units.label, prop: properties.name, who: users.name }).from(holds)
      .innerJoin(units, eq(units.id, holds.unitId)).innerJoin(properties, eq(properties.id, units.propertyId)).innerJoin(users, eq(users.id, holds.seekerId))
      .where(and(mine, eq(holds.status, "HELD"), lt(holds.createdAt, new Date()))).orderBy(asc(sql`coalesce(${holds.startsAt}, ${holds.heldUntil})`)).limit(6),
  ]);
  const by = Object.fromEntries(unitStats.map((s) => [s.status, s.n])) as Record<string, number>;
  const total = (by.VACANT ?? 0) + (by.RESERVED ?? 0) + (by.OCCUPIED ?? 0);
  const attention = newVisits.length + heldNow.length + (wallet.available >= cfg.MIN_PAYOUT_UGX ? 1 : 0);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold sm:text-[34px]">{user.name ? `Hello, ${user.name.split(" ")[0]}` : "My spaces"}</h1>
          <p className="mt-1 text-muted">{total ? `${by.VACANT ?? 0} of ${total} units free right now` : "Let's get your first space listed."}</p>
        </div>
        {user.landlordStatus !== "REJECTED" ? <ButtonLink href="/owner/listings/new"><Plus className="size-4" aria-hidden /> Add a space</ButtonLink> : null}
      </div>

      {user.landlordStatus === "PENDING" ? (
        <Banner icon={<Clock className="size-5" />} tone="amber">
          {sp.submitted ? "Thanks for sending your documents. " : ""}We're checking your ID — usually within one working day. You can add spaces now; they go live once approved.
        </Banner>
      ) : user.landlordStatus === "REJECTED" ? (
        <Banner icon={<ShieldAlert className="size-5" />} tone="red">We couldn't verify your documents. <Link href="/owner/verify" className="font-bold underline">Send them again</Link></Banner>
      ) : null}
      {sp.created ? <Banner icon={<CheckCircle2 className="size-5" />} tone="green">Your space is in review. We check photos and documents before it goes live and will text you.</Banner> : null}

      {/* What needs doing — the reason a landlord opens the app */}
      <Section title="Needs your attention" count={attention || undefined}>
        {attention ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">
            {newVisits.map(({ v, label, prop, who }) => (
              <Todo key={v.id} href="/owner/leads" icon={<CalendarClock className="size-5" />} tone="blue"
                title={`${who ?? "Someone"} wants to view ${label}`} meta={`${prop}, ${dateTimeFmt(v.slotStart)}`} action="Reply" />
            ))}
            {heldNow.map(({ h, label, prop, who }) => (
              h.startsAt && h.endsAt ? (
                <Todo key={h.id} href="/owner/leads" icon={<CalendarClock className="size-5" />} tone="blue"
                  title={`${who ?? "A guest"} booked ${label}`} meta={`${prop}, ${fmtWindow(h.startsAt, h.endsAt)}, paid ${formatUGX(h.amountUgx)}`} action="Get it ready" />
              ) : (
                <Todo key={h.id} href="/owner/leads" icon={<KeyRound className="size-5" />} tone="amber"
                  title={`${who ?? "A tenant"} paid ${formatUGX(h.amountUgx)} to hold ${label}`} meta={`${prop}${h.heldUntil ? `, held until ${dateTimeFmt(h.heldUntil)}` : ""}`} action="Prepare the room" />
              )
            ))}
            {wallet.available >= cfg.MIN_PAYOUT_UGX ? (
              <Todo href="/owner/payouts" icon={<Wallet className="size-5" />} tone="green" title={`${formatUGX(wallet.available)} ready to withdraw`} meta="Send it to MTN, Airtel or your bank" action="Withdraw" />
            ) : null}
          </ul>
        ) : (
          <p className="rounded-[var(--radius-card)] bg-white px-4 py-5 text-sm text-muted ring-1 ring-line">You're all caught up. New visit requests and deposits will show here and arrive by SMS.</p>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Free units" value={by.VACANT ?? 0} tone="brand" hint={`${by.RESERVED ?? 0} reserved, ${by.OCCUPIED ?? 0} occupied`} />
        <Stat label="Occupancy" value={total ? `${Math.round((((by.OCCUPIED ?? 0) + (by.RESERVED ?? 0)) / total) * 100)}%` : "—"} hint={`${total} listed units`} />
        <Stat label="Leads this month" value={visitLeads.n + holdLeads.n} hint={`${visitLeads.n} visits, ${holdLeads.n} deposits`} />
        <Stat label="Earned this month" value={formatUGX(Number(revenue.total))} hint="After FindEkifo's fee" />
      </div>

      <Section title="Your spaces" count={props.length || undefined}>
        {props.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {props.map(({ p, cover, total: t, occupied }) => (
              <Link key={p.id} href={`/spaces/${p.id}`} className="flex min-w-0 gap-4 rounded-[var(--radius-card)] bg-white p-3 ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-lift)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgSrc(cover, 240)} alt="" className="size-[88px] shrink-0 rounded-[12px] object-cover" loading="lazy" />
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold">{p.name}</p>
                    {p.status !== "LIVE" ? <StatusBadge status={p.status} /> : null}
                  </div>
                  <p className="text-sm text-muted">{types.get(p.type)?.name ?? "Space"} in {p.suburb}{p.parentId ? ", inside another listing" : ""}</p>
                  <div className="mt-2.5 flex items-center gap-3">
                    <Meter value={occupied} max={t} label={`${p.name} occupancy`} className="max-w-36" />
                    <span className={cx("shrink-0 text-xs font-semibold", p.vacantCount ? "text-brand-ink" : "text-muted")}>{p.vacantCount ? `${p.vacantCount} free` : "Full"}</span>
                  </div>
                  {p.status === "REJECTED" && p.reviewNote ? <p className="mt-1.5 text-xs font-medium text-danger">{p.reviewNote}</p> : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty icon={<Plus className="size-5" />} title="No spaces yet" action={user.landlordStatus !== "REJECTED" ? <ButtonLink href="/owner/listings/new">Add your first space</ButtonLink> : null}>
            Add a hostel, apartment block, shop stall or short-stay room. It takes about five minutes with your phone camera.
          </Empty>
        )}
      </Section>
    </div>
  );
}

function Todo({ href, icon, title, meta, action, tone }: { href: string; icon: React.ReactNode; title: string; meta: string; action: string; tone: "blue" | "amber" | "green" }) {
  const t = { blue: "bg-sky-soft text-sky-ink", amber: "bg-accent-soft text-accent-ink", green: "bg-brand-soft text-brand-ink" }[tone];
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", t)} aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          <span className="block truncate text-sm text-muted">{meta}</span>
        </span>
        <span className="hidden shrink-0 text-sm font-semibold text-brand-ink sm:inline">{action}</span>
      </Link>
    </li>
  );
}

function Banner({ children, icon, tone }: { children: React.ReactNode; icon?: React.ReactNode; tone: "amber" | "red" | "green" }) {
  const c = { amber: "bg-accent-soft text-accent-ink", red: "bg-red-50 text-red-800", green: "bg-brand-soft text-brand-ink" }[tone];
  return <div className={`flex items-start gap-2.5 rounded-[var(--radius-card)] px-4 py-3.5 text-sm ${c}`}>{icon}<p>{children}</p></div>;
}
