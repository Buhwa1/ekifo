import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Store, Plus } from "lucide-react";
import { db } from "@/db";
import { businesses, properties, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { setBusinessStatusAction } from "@/app/actions/business";
import { ActionButton } from "@/components/action-form";
import { ButtonLink, Empty, PageHeader, Section, StatusBadge, dateFmt, imgSrc } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Directory" };

export default async function OwnerDirectory() {
  const user = await requireRole(["LANDLORD", "ADMIN"], "/owner/directory");
  const rows = await db
    .select({ b: businesses, mall: properties.name, mallId: properties.id, by: users.name, byPhone: users.phone })
    .from(businesses).innerJoin(properties, eq(properties.id, businesses.propertyId)).innerJoin(users, eq(users.id, businesses.ownerId))
    .where(eq(properties.ownerId, user.id))
    .orderBy(sql`case ${businesses.status} when 'PENDING' then 0 when 'PUBLISHED' then 1 else 2 end`, asc(properties.name), asc(businesses.unitLabel), desc(businesses.createdAt));
  const pending = rows.filter((r) => r.b.status === "PENDING");
  const rest = rows.filter((r) => r.b.status !== "PENDING");

  const row = ({ b, mall, by, byPhone }: (typeof rows)[number]) => (
    <li key={b.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgSrc(b.photos[0], 160)} alt="" className="size-16 shrink-0 rounded-[12px] bg-line object-cover" loading="lazy" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <Link href={`/directory/${b.slug}`} className="hover:underline">{b.name}</Link>
          <span className="rounded-[6px] bg-navy px-1.5 py-0.5 text-xs font-bold text-white">{b.unitLabel}</span>
          <StatusBadge status={b.status} />
        </p>
        <p className="text-sm text-muted">{b.category}, {mall}. Added by {by ?? byPhone} on {dateFmt(b.createdAt)}</p>
      </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-20 sm:pl-0">
        {b.status !== "PUBLISHED" ? <ActionButton action={setBusinessStatusAction.bind(null, b.id, "PUBLISHED")} variant="primary">{b.status === "PENDING" ? "Approve" : "Show again"}</ActionButton> : null}
        {b.status !== "HIDDEN" ? (
          <ActionButton action={setBusinessStatusAction.bind(null, b.id, "HIDDEN")} variant="ghost"
            confirm={{ title: `Hide ${b.name}?`, body: "It disappears from the public directory. The owner can still see and edit it.", confirmLabel: "Hide it", danger: true }}>
            {b.status === "PENDING" ? "Decline" : "Hide"}
          </ActionButton>
        ) : null}
      </div>
    </li>
  );

  return (
    <div className="space-y-10">
      <PageHeader
        title="Directory"
        subtitle="Shops listed inside your malls and arcades. Approve the ones that really trade here."
        action={<ButtonLink href="/directory/new" variant="amber"><Plus className="size-4" aria-hidden /> Add a business</ButtonLink>}
      />
      <Section title="Waiting for your approval" count={pending.length || undefined}>
        {pending.length ? <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">{pending.map(row)}</ul>
          : <p className="rounded-[var(--radius-card)] bg-white px-4 py-5 text-sm text-muted ring-1 ring-line">Nothing to approve. Tenants who rent through FindEkifo are approved automatically.</p>}
      </Section>
      <Section title="In your buildings" count={rest.length || undefined}>
        {rest.length ? <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">{rest.map(row)}</ul> : (
          <Empty icon={<Store className="size-5" />} title="No shops listed yet">Share your mall's page with your tenants. They can add their shop with its room number from there.</Empty>
        )}
      </Section>
    </div>
  );
}
