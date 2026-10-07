import { sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { allTypes, TYPE_ICONS, type PropertyType } from "@/lib/types";
import { ALL_CYCLES, CYCLE_LABEL, GROUP_LABEL, type Group } from "@/lib/rules";
import { createTypeAction, updateTypeAction, setTypeActiveAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { TypeIcon } from "@/components/type-icon";
import { Badge, Field, GROUP_STYLE, Input, PageHeader, Select, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Property types" };

export default async function TypesPage() {
  const [types, counts] = await Promise.all([
    allTypes(),
    db.execute(sql`select type, count(*)::int as n from properties group by type`).then((r) => new Map((r.rows as Array<{ type: string; n: number }>).map((x) => [x.type, x.n]))),
  ]);
  const groups: Group[] = ["STAY", "BUSINESS", "LEISURE"];

  return (
    <div className="space-y-10">
      <PageHeader title="Property types" subtitle="What owners can list. Add a type and it appears in the listing form and search right away." />

      <details className="group rounded-[var(--radius-card)] bg-white ring-1 ring-line" open={types.length === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-display text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-full bg-brand text-ink"><Plus className="size-4" aria-hidden /></span> Add a property type
        </summary>
        <div className="border-t border-line p-5">
          <ActionForm action={createTypeAction} resetOnSuccess><TypeFields /><SubmitButton className="mt-5">Add type</SubmitButton></ActionForm>
        </div>
      </details>

      {groups.map((g) => (
        <section key={g}>
          <h2 className={cx("mb-3 flex items-center gap-2 text-lg font-bold", GROUP_STYLE[g].text)}><span className={cx("size-2.5 rounded-full", GROUP_STYLE[g].dot)} aria-hidden /> {GROUP_LABEL[g]}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">
            {types.filter((t) => t.group === g).map((t) => (
              <li key={t.slug} className={cx(!t.active && "bg-surface/60")}>
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
                    <span className={cx("grid size-10 shrink-0 place-items-center rounded-[12px]", GROUP_STYLE[g].chip)}><TypeIcon name={t.icon} className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
                        {t.name}
                        {!t.active ? <Badge>Hidden</Badge> : null}
                        {t.canHaveChildren ? <Badge tone="blue">Can contain spaces</Badge> : null}
                        {t.canBeChild ? <Badge tone="slate">Can sit inside a venue</Badge> : null}
                      </span>
                      <span className="block text-sm text-muted">
                        {t.bookingMode === "SLOT" ? "Booked by time" : "Rented / reserved"}. {t.cycles.map((c) => CYCLE_LABEL[c]).join(", ")}. {counts.get(t.slug) ?? 0} listings.
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-navy">Edit</span>
                  </summary>
                  <div className="border-t border-line bg-surface/40 p-4">
                    <ActionForm action={updateTypeAction.bind(null, t.slug)}><TypeFields t={t} /><div className="mt-5 flex flex-wrap gap-2"><SubmitButton size="sm" variant="navy">Save changes</SubmitButton></div></ActionForm>
                    <div className="mt-3">
                      <ActionButton action={setTypeActiveAction.bind(null, t.slug, !t.active)} variant={t.active ? "ghost" : "primary"}
                        confirm={t.active ? { title: `Hide “${t.name}” from new listings?`, body: "Existing listings stay live. Owners just can't pick it for new ones.", confirmLabel: "Hide type" } : undefined}>
                        {t.active ? "Hide from new listings" : "Enable again"}
                      </ActionButton>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TypeFields({ t }: { t?: PropertyType }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name"><Input name="name" required defaultValue={t?.name} placeholder="Co-working space" /></Field>
      <Field label="Plural"><Input name="plural" required defaultValue={t?.plural} placeholder="Co-working spaces" /></Field>
      <Field label="Group">
        <Select name="group" defaultValue={t?.group ?? "BUSINESS"}>
          <option value="STAY">Places to stay</option><option value="BUSINESS">Business spaces</option><option value="LEISURE">Leisure & events</option>
        </Select>
      </Field>
      <Field label="How it's booked" hint={t ? "Can't change once listings exist." : undefined}>
        <Select name="bookingMode" defaultValue={t?.bookingMode ?? "LEASE"}>
          <option value="LEASE">Rented or reserved (deposit, long stay)</option>
          <option value="SLOT">Booked by time (hourly or event slot)</option>
        </Select>
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-semibold">Ways to charge</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_CYCLES.map((c) => (
            <label key={c} className="relative cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ring-line-strong has-[:checked]:bg-navy has-[:checked]:text-white has-[:checked]:ring-navy">
              <input type="checkbox" name="cycles" value={c} defaultChecked={t?.cycles.includes(c)} className="sr-only" />
              {CYCLE_LABEL[c].replace(/^per/, "Per")}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="What one bookable unit is called"><Input name="unitNoun" required defaultValue={t?.unitNoun ?? "Unit"} placeholder="Desk" /></Field>
      <Field label="Icon">
        <Select name="icon" defaultValue={t?.icon ?? "building"}>{TYPE_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</Select>
      </Field>
      <Field label="Short description" className="sm:col-span-2"><Input name="description" defaultValue={t?.description} maxLength={200} /></Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="canHaveChildren" defaultChecked={t?.canHaveChildren} className="size-5 accent-[var(--color-navy)]" /> Can contain other spaces (like a hotel or mall)</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="canBeChild" defaultChecked={t?.canBeChild} className="size-5 accent-[var(--color-navy)]" /> Can sit inside a venue, or stand alone (like a pool or rooftop)</label>
      </div>
      <input type="hidden" name="sort" value={t?.sort ?? 200} />
    </div>
  );
}
