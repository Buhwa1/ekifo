import { asc, eq, inArray } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { properties, units } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { formatUGX, CYCLE_SHORT } from "@/lib/rules";
import { setUnitStatusAction, updatePriceAction, addUnitAction } from "@/app/actions/owner";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, Select, StatusBadge, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Units" };

const RING = { VACANT: "ring-emerald-300 bg-emerald-50/40", RESERVED: "ring-amber-300 bg-amber-50/50", OCCUPIED: "ring-red-200 bg-red-50/40", UNLISTED: "ring-line bg-slate-50" } as const;

export default async function UnitsPage() {
  const user = await requireRole(["LANDLORD", "ADMIN"], "/owner/units");
  const props = await db.select().from(properties).where(eq(properties.ownerId, user.id)).orderBy(asc(properties.name));
  const all = props.length ? await db.select().from(units).where(inArray(units.propertyId, props.map((p) => p.id))).orderBy(asc(units.label)) : [];

  return (
    <div>
      <PageHeader title="Unit status grid" subtitle="Tap to switch a unit between Vacant, Occupied and Hidden. Reserved units are managed by escrow." />
      <div className="mb-5 flex flex-wrap gap-3 text-xs font-semibold">
        <span className="flex items-center gap-1.5"><i className="size-3 rounded-full bg-emerald-500" /> Vacant</span>
        <span className="flex items-center gap-1.5"><i className="size-3 rounded-full bg-amber-500" /> Reserved (deposit paid)</span>
        <span className="flex items-center gap-1.5"><i className="size-3 rounded-full bg-red-500" /> Occupied</span>
        <span className="flex items-center gap-1.5"><i className="size-3 rounded-full bg-slate-400" /> Hidden</span>
      </div>
      {!props.length ? <Empty title="No properties yet" /> : null}
      {props.map((p) => {
        const list = all.filter((u) => u.propertyId === p.id);
        return (
          <section key={p.id} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 font-bold">{p.name} <StatusBadge status={p.status} /></h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((u) => (
                <Card key={u.id} className={cx("p-3 ring-2 ring-inset", RING[u.status])}>
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-bold">{u.label}</p>
                    <StatusBadge status={u.status} />
                  </div>
                  <p className="tabular text-sm text-muted">{formatUGX(u.priceUgx)}{CYCLE_SHORT[u.cycle]}</p>
                  {u.status !== "RESERVED" ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {u.status !== "VACANT" ? <ActionButton action={setUnitStatusAction.bind(null, u.id, "VACANT")} size="sm" variant="outline">Vacant</ActionButton> : null}
                      {u.status !== "OCCUPIED" ? <ActionButton action={setUnitStatusAction.bind(null, u.id, "OCCUPIED")} size="sm" variant="outline">Occupied</ActionButton> : null}
                      {u.status !== "UNLISTED" ? <ActionButton action={setUnitStatusAction.bind(null, u.id, "UNLISTED")} size="sm" variant="ghost">Hide</ActionButton> : null}
                    </div>
                  ) : <p className="mt-2 text-xs text-amber-800">Deposit in escrow — see Lead inbox.</p>}
                  {u.status !== "OCCUPIED" ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-muted">Edit price</summary>
                      <ActionForm action={updatePriceAction.bind(null, u.id)} className="mt-2 space-y-2">
                        <Input name="priceUgx" inputMode="numeric" defaultValue={u.priceUgx} aria-label="Price" />
                        <Input name="depositUgx" inputMode="numeric" defaultValue={u.depositUgx} aria-label="Deposit" />
                        <SubmitButton size="sm" variant="navy">Save</SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                </Card>
              ))}
              <details className="rounded-[var(--radius-card)] border-2 border-dashed border-line bg-white p-3">
                <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-muted"><Plus className="size-4" /> Add unit</summary>
                <ActionForm action={addUnitAction.bind(null, p.id)} className="mt-2 space-y-2" resetOnSuccess>
                  <Field label="Name"><Input name="label" required /></Field>
                  <Field label="Price"><Input name="priceUgx" inputMode="numeric" required /></Field>
                  <Field label="Deposit"><Input name="depositUgx" inputMode="numeric" required /></Field>
                  <Select name="cycle" defaultValue={list[0]?.cycle ?? "PER_MONTH"} aria-label="Cycle">
                    <option value="PER_SEMESTER">Per semester</option><option value="PER_MONTH">Per month</option><option value="PER_DAY">Per day</option>
                  </Select>
                  <SubmitButton size="sm">Add</SubmitButton>
                </ActionForm>
              </details>
            </div>
          </section>
        );
      })}
    </div>
  );
}
