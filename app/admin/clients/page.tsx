import Link from "next/link";
import { desc, eq, ilike, or, sql, inArray } from "drizzle-orm";
import { Plus, Search, UserPlus } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { onboardClientAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ButtonLink, Field, Input, PageHeader, Section, StatusBadge, Textarea, cx, dateFmt, inputClass, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = q?.trim().slice(0, 40);
  const like = term ? `%${term.replace(/[%_\\]/g, "")}%` : null;
  const clients = await db
    .select({
      u: users,
      listings: sql<number>`(select count(*)::int from properties p where p.owner_id = ${users.id})`,
      live: sql<number>`(select count(*)::int from properties p where p.owner_id = ${users.id} and p.status = 'LIVE')`,
    })
    .from(users)
    .where(like ? or(ilike(users.name, like), ilike(users.phone, like))! : inArray(users.role, ["LANDLORD"]))
    .orderBy(desc(users.createdAt))
    .limit(60);

  return (
    <div className="space-y-10">
      <PageHeader title="Clients" subtitle="Landlords, mall managers and venue owners. Set someone up yourself, then list their spaces for them." />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="h-fit rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line">
          <p className="flex items-center gap-2 font-display text-lg font-bold"><UserPlus className="size-5 text-brand-ink" aria-hidden /> Onboard a client</p>
          <p className="mt-1 text-sm text-muted">They'll get an SMS explaining how to sign in with their number.</p>
          <ActionForm action={onboardClientAction} className="mt-4 space-y-4" resetOnSuccess>
            <Field label="Full name"><Input name="name" required autoComplete="off" placeholder="Agnes Namubiru" /></Field>
            <Field label="Mobile number"><Input name="phone" type="tel" inputMode="tel" required placeholder="0772 123 456" /></Field>
            <label className="flex items-start gap-3 rounded-[var(--radius-control)] bg-surface px-3.5 py-3 text-sm">
              <input type="checkbox" name="verifiedInPerson" className="mt-0.5 size-5 shrink-0 accent-[var(--color-navy)]" />
              <span><b>I've checked their ID and ownership documents in person.</b> They become a verified owner straight away. This is recorded in the audit log.</span>
            </label>
            <Field label="Note for the audit log" hint="Optional. E.g. where you met, which documents you saw.">
              <Textarea name="note" maxLength={300} className="min-h-16" />
            </Field>
            <SubmitButton className="w-full">Set up client</SubmitButton>
          </ActionForm>
        </section>

        <Section title={term ? `Results for “${term}”` : "Owners"} count={clients.length || undefined}
          action={
            <form action="/admin/clients" className="relative w-56" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input name="q" defaultValue={term} placeholder="Name or phone" className={cx(inputClass, "h-9 pl-9 text-sm")} />
            </form>
          }>
          {clients.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">
              {clients.map(({ u, listings, live }) => (
                <li key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy font-display text-sm font-bold text-white">
                    {(u.name ?? "?").split(" ").map((x) => x[0]).slice(0, 2).join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">{u.name ?? "No name yet"} <StatusBadge status={u.landlordStatus} />{u.suspendedAt ? <StatusBadge status="SUSPENDED" /> : null}</p>
                    <p className="text-sm text-muted tabular">{u.phone}. {listings} listing{listings === 1 ? "" : "s"}{listings ? `, ${live} live` : ""}. Joined {dateFmt(u.createdAt)}</p>
                  </div>
                  </div>
                  <ButtonLink href={`/owner/listings/new?for=${u.id}`} variant="outline" size="sm" className="self-start sm:self-auto"><Plus className="size-4" aria-hidden /> List a space for them</ButtonLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[var(--radius-card)] bg-white px-4 py-5 text-sm text-muted ring-1 ring-line">
              {term ? <>Nobody matches. <Link href="/admin/clients" className="font-semibold text-ink underline">Show all owners</Link></> : "No owners yet. Onboard your first client on the left."}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
