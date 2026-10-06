import { and, asc, desc, eq, inArray, gte } from "drizzle-orm";
import { MessageCircle, Phone } from "lucide-react";
import { db } from "@/db";
import { properties, units, visits, holds, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { formatUGX } from "@/lib/rules";
import { ownerVisitAction, ownerReleaseHoldAction } from "@/app/actions/owner";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Input, PageHeader, StatusBadge, buttonClass, dateTimeFmt } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead inbox" };

export default async function LeadsPage() {
  const user = await requireRole(["LANDLORD", "ADMIN"], "/owner/leads");
  const mine = and(eq(properties.ownerId, user.id));
  const recent = new Date(Date.now() - 14 * 86_400_000);

  const [visitRows, holdRows] = await Promise.all([
    db.select({ v: visits, u: units, p: properties, s: users }).from(visits)
      .innerJoin(units, eq(units.id, visits.unitId)).innerJoin(properties, eq(properties.id, units.propertyId)).innerJoin(users, eq(users.id, visits.seekerId))
      .where(and(mine, inArray(visits.status, ["REQUESTED", "RESCHEDULED", "CONFIRMED"]), gte(visits.slotStart, recent)))
      .orderBy(asc(visits.slotStart)),
    db.select({ h: holds, u: units, p: properties, s: users }).from(holds)
      .innerJoin(units, eq(units.id, holds.unitId)).innerJoin(properties, eq(properties.id, units.propertyId)).innerJoin(users, eq(users.id, holds.seekerId))
      .where(and(mine, eq(holds.status, "HELD")))
      .orderBy(desc(holds.createdAt)),
  ]);
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });

  return (
    <div className="space-y-10">
      <PageHeader title="Lead inbox" subtitle="Visit requests and paid deposits. Respond fast — seekers usually book the first place that replies." />

      <section>
        <h2 className="mb-3 text-lg font-bold">Deposits in escrow <span className="text-muted">({holdRows.length})</span></h2>
        {holdRows.length ? holdRows.map(({ h, u, p, s }) => (
          <Card key={h.id} className="mb-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{s.name ?? "Tenant"} reserved {u.label} · {p.name}</p>
                <p className="text-sm text-muted">{formatUGX(h.amountUgx)} held{h.moveInDate ? ` · moving in ${dateTimeFmt(h.moveInDate)}` : ""}{h.heldUntil ? ` · hold ends ${dateTimeFmt(h.heldUntil)}` : ""}</p>
                <p className="mt-1 text-sm">Paid out to you (minus {formatUGX(h.commissionUgx)} fee) as soon as the tenant confirms move-in.</p>
              </div>
              <Contact phone={s.phone} name={p.name} />
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-muted">Can't host them? Release & refund</summary>
              <ActionForm action={ownerReleaseHoldAction.bind(null, h.id)} className="mt-2 flex flex-wrap gap-2" confirm="Release this reservation? The tenant gets a full refund and the unit becomes vacant.">
                <Input name="reason" placeholder="Reason (sent to tenant)" className="max-w-xs" />
                <SubmitButton variant="danger" size="md">Release</SubmitButton>
              </ActionForm>
            </details>
          </Card>
        )) : <Empty title="No deposits waiting" />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Visit requests <span className="text-muted">({visitRows.length})</span></h2>
        {visitRows.length ? visitRows.map(({ v, u, p, s }) => (
          <Card key={v.id} className="mb-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-bold">{s.name ?? s.phone} <StatusBadge status={v.status} /></p>
                <p className="text-sm text-muted">{u.label} · {p.name} · <b className="text-navy">{dateTimeFmt(v.slotStart)}</b></p>
                {v.proposedSlot ? <p className="text-sm text-amber-700">You proposed {dateTimeFmt(v.proposedSlot)} — waiting for them</p> : null}
                {v.note ? <p className="mt-1 text-sm italic text-slate-600">“{v.note}”</p> : null}
              </div>
              <Contact phone={s.phone} name={p.name} />
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {v.status === "REQUESTED" ? <ActionButton action={ownerVisitAction.bind(null, v.id, "CONFIRMED")} variant="primary">Accept</ActionButton> : null}
              {v.status === "CONFIRMED" && v.slotStart < new Date() ? (
                <>
                  <ActionButton action={ownerVisitAction.bind(null, v.id, "COMPLETED")} variant="outline">They came</ActionButton>
                  <ActionButton action={ownerVisitAction.bind(null, v.id, "NO_SHOW")} variant="ghost">No-show</ActionButton>
                </>
              ) : null}
              {v.status !== "RESCHEDULED" ? (
                <details>
                  <summary className={buttonClass("outline", "sm", "list-none cursor-pointer")}>Reschedule</summary>
                  <ActionForm action={ownerVisitAction.bind(null, v.id, "RESCHEDULED")} className="mt-2 flex flex-wrap gap-2">
                    <Input type="date" name="date" min={tomorrow} required className="w-40" />
                    <Input type="time" name="time" min="08:00" max="17:30" step={1800} defaultValue="10:00" required className="w-28" />
                    <SubmitButton size="md" variant="navy">Propose</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
              <ActionButton action={ownerVisitAction.bind(null, v.id, "DECLINED")} variant="ghost" confirm="Decline this visit?">Decline</ActionButton>
            </div>
          </Card>
        )) : <Empty title="No visit requests right now" />}
      </section>
    </div>
  );
}

function Contact({ phone, name }: { phone: string; name: string }) {
  return (
    <div className="flex gap-2">
      <a href={`tel:${phone}`} className={buttonClass("outline", "sm")} aria-label="Call"><Phone className="size-4" /></a>
      <a href={`https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(`Hello, this is the landlord of ${name} (FindEkifo).`)}`} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")} aria-label="WhatsApp"><MessageCircle className="size-4" /></a>
    </div>
  );
}
