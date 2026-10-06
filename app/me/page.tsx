import Link from "next/link";
import { desc, eq, and, inArray } from "drizzle-orm";
import { CalendarClock, FileText, Heart, KeyRound, Star } from "lucide-react";
import { db } from "@/db";
import { holds, units, properties, visits, tenancies, savedSpaces, reviews } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { formatUGX, CYCLE_LABEL, maskPhone } from "@/lib/rules";
import { confirmMoveInAction, cancelHoldAction, disputeAction, seekerVisitAction, reviewAction } from "@/app/actions/seeker";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, PageHeader, Select, StatusBadge, Textarea, buttonClass, dateFmt, dateTimeFmt } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

export default async function MePage() {
  const user = await requireUser("/me");
  const cfg = config();
  const [myHolds, myVisits, myTenancies, saved, myReviews] = await Promise.all([
    db.select({ h: holds, u: units, p: properties }).from(holds).innerJoin(units, eq(units.id, holds.unitId)).innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(eq(holds.seekerId, user.id), inArray(holds.status, ["PENDING_PAYMENT", "HELD", "CONFIRMED", "REFUNDED"]))).orderBy(desc(holds.createdAt)).limit(20),
    db.select({ v: visits, u: units, p: properties }).from(visits).innerJoin(units, eq(units.id, visits.unitId)).innerJoin(properties, eq(properties.id, units.propertyId))
      .where(eq(visits.seekerId, user.id)).orderBy(desc(visits.slotStart)).limit(20),
    db.select({ t: tenancies, u: units, p: properties }).from(tenancies).innerJoin(units, eq(units.id, tenancies.unitId)).innerJoin(properties, eq(properties.id, units.propertyId))
      .where(eq(tenancies.tenantId, user.id)).orderBy(desc(tenancies.createdAt)),
    db.select({ p: properties }).from(savedSpaces).innerJoin(properties, eq(properties.id, savedSpaces.propertyId)).where(eq(savedSpaces.userId, user.id)).orderBy(desc(savedSpaces.createdAt)),
    db.select({ holdId: reviews.holdId }).from(reviews).where(eq(reviews.authorId, user.id)),
  ]);
  const reviewed = new Set(myReviews.map((r) => r.holdId));
  const freeCancelMs = cfg.FREE_CANCEL_HOURS * 3_600_000;

  return (
    <div className="space-y-10">
      <PageHeader title={user.name ? `Hi, ${user.name.split(" ")[0]}` : "My account"} subtitle={maskPhone(user.phone)} />

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><KeyRound className="size-5" /> Reservations</h2>
        {myHolds.length ? (
          <div className="space-y-3">
            {myHolds.map(({ h, u, p }) => {
              const inFreeWindow = h.paidAt ? Date.now() - h.paidAt.getTime() < freeCancelMs : false;
              return (
                <Card key={h.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/spaces/${p.id}`} className="font-bold hover:underline">{p.name} · {u.label}</Link>
                      <p className="text-sm text-muted">{formatUGX(h.amountUgx)} deposit · {dateFmt(h.createdAt)}{h.heldUntil && h.status === "HELD" ? ` · held until ${dateTimeFmt(h.heldUntil)}` : ""}</p>
                    </div>
                    <StatusBadge status={h.status} />
                  </div>
                  {h.status === "HELD" ? (
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      <ActionButton action={confirmMoveInAction.bind(null, h.id)} variant="primary" confirm="Confirm you have moved in / received the keys? This releases the deposit to the landlord.">I've moved in</ActionButton>
                      {inFreeWindow ? <ActionButton action={cancelHoldAction.bind(null, h.id)} variant="ghost" confirm="Cancel and get a full refund?">Cancel & refund</ActionButton> : null}
                      <details className="w-full">
                        <summary className="cursor-pointer text-sm font-semibold text-muted">Something wrong? Open a dispute</summary>
                        <ActionForm action={disputeAction.bind(null, h.id)} className="mt-2 space-y-2" resetOnSuccess>
                          <Textarea name="reason" required minLength={10} placeholder="Landlord not answering, room not as shown…" />
                          <SubmitButton variant="danger" size="sm">Open dispute</SubmitButton>
                        </ActionForm>
                      </details>
                    </div>
                  ) : h.status === "PENDING_PAYMENT" ? (
                    <Link href={`/holds/${h.id}`} className="mt-2 inline-block text-sm font-semibold text-brand">Check payment status →</Link>
                  ) : h.status === "CONFIRMED" && !reviewed.has(h.id) ? (
                    <details className="mt-3">
                      <summary className="flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand"><Star className="size-4" /> Review this place</summary>
                      <ActionForm action={reviewAction.bind(null, h.id)} className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
                        <Select name="stars" defaultValue="5" aria-label="Stars">{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{"★".repeat(s)}</option>)}</Select>
                        <Textarea name="comment" placeholder="Water, power, caretaker, security…" className="min-h-11" />
                        <SubmitButton size="md">Post</SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                </Card>
              );
            })}
          </div>
        ) : <Empty title="No reservations yet"><Link href="/" className="font-semibold text-brand">Find a space</Link></Empty>}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><CalendarClock className="size-5" /> Visits</h2>
        {myVisits.length ? (
          <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
            {myVisits.map(({ v, u, p }) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{p.name} · {u.label}</p>
                  <p className="text-sm text-muted">{dateTimeFmt(v.slotStart)} · {p.address}</p>
                  {v.status === "RESCHEDULED" && v.proposedSlot ? <p className="mt-1 text-sm font-medium text-amber-700">Landlord proposed {dateTimeFmt(v.proposedSlot)}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={v.status} />
                  {v.status === "RESCHEDULED" ? <ActionButton action={seekerVisitAction.bind(null, v.id, "CONFIRMED")} variant="primary">Accept new time</ActionButton> : null}
                  {["REQUESTED", "CONFIRMED", "RESCHEDULED"].includes(v.status) ? <ActionButton action={seekerVisitAction.bind(null, v.id, "CANCELLED")} variant="ghost" confirm="Cancel this visit?">Cancel</ActionButton> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <Empty title="No visits booked">Open any space and tap “Schedule a visit”.</Empty>}
      </section>

      {myTenancies.length ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><FileText className="size-5" /> Tenancies</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {myTenancies.map(({ t, u, p }) => (
              <Card key={t.id} className="p-4">
                <p className="font-bold">{p.name} · {u.label}</p>
                <p className="text-sm text-muted">{formatUGX(t.rentUgx)} {CYCLE_LABEL[t.cycle]} · since {dateFmt(t.startDate)}{t.endedAt ? ` · ended ${dateFmt(t.endedAt)}` : ""}</p>
                <a href={`/api/agreements/${t.id}`} target="_blank" className={buttonClass("outline", "sm", "mt-3")}><FileText className="size-4" /> Tenancy agreement (PDF)</a>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Heart className="size-5" /> Saved spaces</h2>
        {saved.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {saved.map(({ p }) => (
              <li key={p.id}><Link href={`/spaces/${p.id}`} className="block rounded-xl bg-white px-4 py-3 font-semibold ring-1 ring-line hover:ring-brand">{p.name} <span className="font-normal text-muted">· {p.suburb}</span></Link></li>
            ))}
          </ul>
        ) : <Empty title="Nothing saved yet">Tap “Save for later” on any space. Saved spaces you've opened stay available offline.</Empty>}
      </section>
    </div>
  );
}
