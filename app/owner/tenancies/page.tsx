import { desc, eq, inArray } from "drizzle-orm";
import { FileText } from "lucide-react";
import { db } from "@/db";
import { tenancies, units, properties, users, rentChanges } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { config } from "@/lib/config";
import { currentRent } from "@/lib/tenancy";
import { formatUGX, CYCLE_LABEL } from "@/lib/rules";
import { rentChangeAction, endTenancyAction } from "@/app/actions/owner";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, buttonClass, dateFmt } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tenancies" };

export default async function TenanciesPage() {
  const user = await requireRole(["LANDLORD", "ADMIN"], "/owner/tenancies");
  const cfg = config();
  const rows = await db.select({ t: tenancies, u: units, p: properties, tenant: users }).from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId)).innerJoin(properties, eq(properties.id, units.propertyId)).innerJoin(users, eq(users.id, tenancies.tenantId))
    .where(eq(tenancies.landlordId, user.id)).orderBy(desc(tenancies.createdAt));
  const changes = rows.length ? await db.select().from(rentChanges).where(inArray(rentChanges.tenancyId, rows.map((r) => r.t.id))) : [];
  const minEffective = new Date(Date.now() + cfg.RENT_NOTICE_DAYS * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });

  return (
    <div>
      <PageHeader title="Tenancies" subtitle={`Rent increases on active tenancies are capped at ${cfg.RENT_INCREASE_CAP_BPS / 100}% per 12 months with ${cfg.RENT_NOTICE_DAYS} days' notice.`} />
      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(({ t, u, p, tenant }) => {
            const mine = changes.filter((c) => c.tenancyId === t.id);
            const cur = currentRent(t, mine);
            const scheduled = mine.find((c) => c.effectiveAt > new Date());
            return (
              <Card key={t.id} className="p-4">
                <p className="font-bold">{p.name} · {u.label}</p>
                <p className="text-sm text-muted">{tenant.name ?? tenant.phone} · since {dateFmt(t.startDate)}{t.endedAt ? ` · ended ${dateFmt(t.endedAt)}` : ""}</p>
                <p className="mt-2 tabular"><b>{formatUGX(cur)}</b> {CYCLE_LABEL[t.cycle]}</p>
                {scheduled ? <p className="text-sm text-amber-700">Changes to {formatUGX(scheduled.newRentUgx)} on {dateFmt(scheduled.effectiveAt)}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`/api/agreements/${t.id}`} target="_blank" className={buttonClass("outline", "sm")}><FileText className="size-4" /> Agreement</a>
                  {!t.endedAt ? <ActionButton action={endTenancyAction.bind(null, t.id)} variant="ghost" confirm="Mark this tenancy as ended? The unit becomes vacant.">End tenancy</ActionButton> : null}
                </div>
                {!t.endedAt && !scheduled ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-muted">Change rent</summary>
                    <ActionForm action={rentChangeAction.bind(null, t.id)} className="mt-2 grid grid-cols-2 gap-2">
                      <Field label="New rent (UGX)" hint={`Max ${formatUGX(Math.floor(cur * (1 + cfg.RENT_INCREASE_CAP_BPS / 10_000)))}`}><Input name="newRent" inputMode="numeric" required /></Field>
                      <Field label="Effective from"><Input type="date" name="effectiveAt" min={minEffective} defaultValue={minEffective} required /></Field>
                      <div className="col-span-2"><SubmitButton size="sm" variant="navy">Send notice</SubmitButton></div>
                    </ActionForm>
                  </details>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : <Empty title="No tenancies yet">They appear here once a tenant confirms move-in.</Empty>}
    </div>
  );
}
