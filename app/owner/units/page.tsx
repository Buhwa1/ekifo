import { asc, eq, inArray, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { properties, units } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { CYCLE_SHORT } from "@/lib/rules";
import { updatePriceAction, addUnitAction } from "@/app/actions/owner";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { UnitStatusSelect } from "@/components/unit-status-select";
import { typeMap } from "@/lib/types";
import { isSlotCycle, CYCLE_LABEL, type Cycle } from "@/lib/rules";
import { Empty, Field, Input, Meter, Select, StatusBadge, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Units" };

const STRIPE = {
  VACANT: "before:bg-brand", RESERVED: "before:bg-accent", OCCUPIED: "before:bg-danger", UNLISTED: "before:bg-slate-300",
  MAINTENANCE: "before:bg-accent-dark", UNDER_CONSTRUCTION: "before:bg-sky",
} as const;
const ugx = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });

export default async function UnitsPage() {
  const user = await requireRole(["LANDLORD", "ADMIN"], "/owner/units");
  const [props, types] = await Promise.all([db.select().from(properties).where(eq(properties.ownerId, user.id)).orderBy(asc(properties.name)), typeMap()]);
  const all = props.length
    ? await db.select().from(units).where(inArray(units.propertyId, props.map((p) => p.id))).orderBy(sql`length(${units.label})`, asc(units.label))
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[30px] font-bold">Units</h1>
        <p className="mt-1 max-w-2xl text-muted">Keep this up to date so people only see what's really available. Booked units have money in escrow and change by themselves.</p>
      </div>

      {!props.length ? <Empty title="No spaces yet">Add a space first, then manage its units here.</Empty> : null}

      <div className="space-y-10">
        {props.map((p) => {
          const list = all.filter((u) => u.propertyId === p.id);
          const type = types.get(p.type);
          const listed = list.filter((u) => u.status !== "UNLISTED");
          const busy = listed.filter((u) => u.status === "OCCUPIED" || u.status === "RESERVED").length;
          return (
            <section key={p.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">{p.name} <span className="text-sm font-medium text-muted">{type?.name}</span> {p.status !== "LIVE" ? <StatusBadge status={p.status} /> : null}</h2>
                <div className="flex w-full items-center gap-3 text-sm text-muted sm:w-auto">
                  <Meter value={busy} max={listed.length} label={`${p.name} occupancy`} className="w-full sm:w-28" />
                  <span className="shrink-0 whitespace-nowrap tabular">{listed.length - busy} free of {listed.length}</span>
                </div>
              </div>

              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((u) => (
                  <li key={u.id} data-status={u.status}
                    className={cx("relative overflow-hidden rounded-[14px] bg-white p-3.5 pl-5 ring-1 ring-line before:absolute before:inset-y-0 before:left-0 before:w-1.5", STRIPE[u.status])}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{u.label}</p>
                        <p className="text-sm text-muted tabular">UGX {ugx.format(u.priceUgx)}{CYCLE_SHORT[u.cycle]}</p>
                      </div>
                      {u.status === "RESERVED" ? <StatusBadge status="RESERVED" /> : null}
                    </div>

                    {u.status === "RESERVED" ? (
                      <p className="mt-3 text-[13px] text-accent-ink">Booked: a tenant has paid a deposit. Manage it in the Lead inbox.</p>
                    ) : (
                      <div className="mt-3"><UnitStatusSelect unitId={u.id} status={u.status} label={u.label} /></div>
                    )}

                    {u.status !== "OCCUPIED" && u.status !== "RESERVED" ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">Change price</summary>
                        <ActionForm action={updatePriceAction.bind(null, u.id)} className="mt-2 grid grid-cols-2 gap-2">
                          <Field label="Price"><Input name="priceUgx" inputMode="numeric" defaultValue={u.priceUgx} className="h-9" /></Field>
                          {isSlotCycle(u.cycle) ? null : <Field label="Deposit"><Input name="depositUgx" inputMode="numeric" defaultValue={u.depositUgx} className="h-9" /></Field>}
                          <div className="col-span-2"><SubmitButton size="sm" variant="navy">Save price</SubmitButton></div>
                        </ActionForm>
                      </details>
                    ) : null}
                  </li>
                ))}

                <li>
                  <details className="h-full rounded-[14px] border-2 border-dashed border-line-strong bg-white/60 p-3.5">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><Plus className="size-4" aria-hidden /> Add a {(type?.unitNoun ?? "unit").toLowerCase()}</summary>
                    <ActionForm action={addUnitAction.bind(null, p.id)} className="mt-3 grid grid-cols-2 gap-2" resetOnSuccess>
                      <Field label="Name" className="col-span-2"><Input name="label" required placeholder={`${type?.unitNoun ?? "Room"} ${list.length + 1}`} /></Field>
                      <Field label="Price (UGX)"><Input name="priceUgx" inputMode="numeric" required /></Field>
                      {type?.bookingMode === "SLOT" ? null : <Field label="Deposit (UGX)"><Input name="depositUgx" inputMode="numeric" required /></Field>}
                      <Field label="Charged" className="col-span-2">
                        <Select name="cycle" defaultValue={list[0]?.cycle ?? type?.cycles[0]}>
                          {(type?.cycles ?? (["PER_MONTH"] as const)).map((c) => <option key={c} value={c}>{CYCLE_LABEL[c as Cycle].replace(/^per/, "Per")}</option>)}
                        </Select>
                      </Field>
                      <div className="col-span-2"><SubmitButton size="sm">Add {(type?.unitNoun ?? "unit").toLowerCase()}</SubmitButton></div>
                    </ActionForm>
                  </details>
                </li>
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
