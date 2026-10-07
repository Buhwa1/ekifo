import { and, asc, eq, inArray, gte, sql } from "drizzle-orm";
import { MessageCircle, Phone } from "lucide-react";
import { db } from "@/db";
import { properties, units, visits, holds, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { formatUGX } from "@/lib/rules";
import { fmtWindow } from "@/lib/booking";
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
      .orderBy(asc(sql`coalesce(${holds.startsAt}, ${holds.createdAt})`)),
  ]);
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });

  return (
    <div className="space-y-10">
      <PageHeader title="Lead inbox" subtitle="Paid bookings, deposits and visit requests. Respond fast — people usually book the first place that replies." />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Paid and held for you {holdRows.length ? <span className="ml-1 font-sans text-sm text-muted tabular">{holdRows.length}</span> : null}</h2>
        {holdRows.length ? holdRows.map(({ h, u, p, s }) => (
          <Card key={h.id} className="mb-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                {h.startsAt && h.endsAt ? (
                  <>
                    <p className="font-bold">{s.name ?? "A guest"} booked {u.label}, {p.name}</p>
                    <p className="mt-1 inline-flex rounded-[8px] bg-sky-soft px-2 py-0.5 text-sm font-semibold text-sky-ink">{fmtWindow(h.startsAt, h.endsAt)}</p>
                    <p className="mt-1 text-sm">{formatUGX(h.amountUgx)} paid. You receive {formatUGX(h.amountUgx - h.commissionUgx)} after the booking.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold">{s.name ?? "Tenant"} reserved {u.label}, {p.name}</p>
                    <p className="text-sm text-muted">{formatUGX(h.amountUgx)} held{h.moveInDate ? `, moving in ${dateTimeFmt(h.moveInDate)}` : ""}{h.heldUntil ? `. Hold ends ${dateTimeFmt(h.heldUntil)}` : ""}</p>
                    <p className="mt-1 text-sm">Paid out to you (minus {formatUGX(h.commissionUgx)} fee) as soon as the tenant confirms move-in.</p>
                  </>
                )}
              </div>
              <Contact phone={s.phone} name={p.name} />
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-muted">Can't host them? Cancel and refund</summary>
              <ActionForm action={ownerReleaseHoldAction.bind(null, h.id)} className="mt-2 flex flex-wrap gap-2" confirm={{ title: h.startsAt ? "Cancel this booking?" : "Release this reservation?", body: h.startsAt ? "The guest gets a full refund by Mobile Money and the time opens up again." : "The tenant gets a full refund by Mobile Money and the unit shows as free again.", confirmLabel: "Cancel and refund", danger: true }}>
                <Input name="reason" placeholder="Reason (sent to tenant)" className="max-w-xs" />
                <SubmitButton variant="danger" size="md">Release</SubmitButton>
              </ActionForm>
            </details>
          </Card>
        )) : <Empty title="Nothing paid right now">When someone pays a deposit or books a time, it appears here and you get an SMS.</Empty>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Visit requests {visitRows.length ? <span className="ml-1 font-sans text-sm text-muted tabular">{visitRows.length}</span> : null}</h2>
        {visitRows.length ? visitRows.map(({ v, u, p, s }) => (
          <Card key={v.id} className="mb-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-bold">{s.name ?? s.phone} <StatusBadge status={v.status} /></p>
                <p className="text-sm text-muted">{u.label} · {p.name} · <b className="text-ink">{dateTimeFmt(v.slotStart)}</b></p>
                {v.proposedSlot ? <p className="text-sm text-accent-ink">You proposed {dateTimeFmt(v.proposedSlot)} — waiting for them</p> : null}
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
              <ActionButton action={ownerVisitAction.bind(null, v.id, "DECLINED")} variant="ghost" confirm={{ title: "Decline this visit?", body: "The seeker gets an SMS saying you can't host them.", confirmLabel: "Decline visit", danger: true }}>Decline</ActionButton>
            </div>
          </Card>
        )) : <Empty title="No visit requests right now">Seekers book free visits from your listing. You can accept, decline or suggest another time.</Empty>}
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
