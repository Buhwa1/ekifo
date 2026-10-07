import Link from "next/link";
import { desc, eq, and, inArray, sql } from "drizzle-orm";
import { CalendarClock, FileText, Heart, KeyRound, LogOut, Star, MapPin } from "lucide-react";
import { db } from "@/db";
import { holds, units, properties, visits, tenancies, savedSpaces, reviews } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { formatUGX, CYCLE_LABEL, maskPhone } from "@/lib/rules";
import { fmtWindow } from "@/lib/booking";
import { confirmMoveInAction, cancelHoldAction, disputeAction, seekerVisitAction, reviewAction } from "@/app/actions/seeker";
import { logoutAction } from "@/app/actions/auth";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { ButtonLink, Empty, Section, StatusBadge, Textarea, buttonClass, cx, dateFmt, dateTimeFmt, imgSrc } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your bookings" };

const COVER = sql<string | null>`(select m.url from media m where m.property_id = "properties"."id" and m.kind = 'PHOTO' order by m.position limit 1)`;

export default async function MePage() {
  const user = await requireUser("/me");
  const cfg = config();
  const [myHolds, myVisits, myTenancies, saved, myReviews] = await Promise.all([
    db.select({ h: holds, u: units, p: properties, cover: COVER }).from(holds).innerJoin(units, eq(units.id, holds.unitId)).innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(eq(holds.seekerId, user.id), inArray(holds.status, ["PENDING_PAYMENT", "HELD", "CONFIRMED", "REFUNDED"]))).orderBy(desc(holds.createdAt)).limit(20),
    db.select({ v: visits, u: units, p: properties }).from(visits).innerJoin(units, eq(units.id, visits.unitId)).innerJoin(properties, eq(properties.id, units.propertyId))
      .where(eq(visits.seekerId, user.id)).orderBy(desc(visits.slotStart)).limit(30),
    db.select({ t: tenancies, u: units, p: properties }).from(tenancies).innerJoin(units, eq(units.id, tenancies.unitId)).innerJoin(properties, eq(properties.id, units.propertyId))
      .where(eq(tenancies.tenantId, user.id)).orderBy(desc(tenancies.createdAt)),
    db.select({ p: properties, cover: COVER }).from(savedSpaces).innerJoin(properties, eq(properties.id, savedSpaces.propertyId)).where(eq(savedSpaces.userId, user.id)).orderBy(desc(savedSpaces.createdAt)),
    db.select({ holdId: reviews.holdId }).from(reviews).where(eq(reviews.authorId, user.id)),
  ]);
  const reviewed = new Set(myReviews.map((r) => r.holdId));
  const freeCancelMs = cfg.FREE_CANCEL_HOURS * 3_600_000;
  const now = Date.now();
  const openVisits = myVisits.filter(({ v }) => ["REQUESTED", "CONFIRMED", "RESCHEDULED"].includes(v.status) && v.slotStart.getTime() > now - 3 * 3600_000);
  const pastVisits = myVisits.filter((x) => !openVisits.includes(x));
  const active = myHolds.filter(({ h }) => h.status === "HELD" || h.status === "PENDING_PAYMENT");
  const history = myHolds.filter((x) => !active.includes(x));

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold sm:text-[34px]">{user.name ? `Hi ${user.name.split(" ")[0]}` : "Your bookings"}</h1>
          <p className="mt-1 text-muted tabular">{maskPhone(user.phone)}</p>
        </div>
        <form action={logoutAction}>
          <button className={buttonClass("ghost", "sm", "text-muted")}><LogOut className="size-4" aria-hidden /> Sign out</button>
        </form>
      </div>

      {/* Active reservations get the most room: they're money in escrow waiting on the seeker. */}
      <Section title="Bookings & reservations" count={active.length || undefined}>
        {active.length ? (
          <div className="space-y-4">
            {active.map(({ h, u, p, cover }) => {
              const slot = h.startsAt !== null && h.endsAt !== null;
              const started = slot && h.startsAt!.getTime() <= now;
              const inFreeWindow = slot
                ? h.startsAt!.getTime() - now > freeCancelMs
                : h.paidAt ? now - h.paidAt.getTime() < freeCancelMs : false;
              return (
                <div key={h.id} className="overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">
                  <div className="flex gap-4 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgSrc(cover, 240)} alt="" className="size-20 shrink-0 rounded-[12px] object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/spaces/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
                        <StatusBadge status={h.status} />
                      </div>
                      <p className="text-sm text-muted">{u.label}, {p.suburb}</p>
                      {slot ? <p className="mt-1 inline-flex items-center rounded-[8px] bg-sky-soft px-2 py-0.5 text-sm font-semibold text-sky-ink">{fmtWindow(h.startsAt!, h.endsAt!)}</p> : null}
                      <p className="mt-1 text-sm">
                        {h.status === "HELD"
                          ? slot
                            ? <><b>{formatUGX(h.amountUgx)}</b> paid and held until after your booking</>
                            : <><b>{formatUGX(h.amountUgx)}</b> held safely{h.heldUntil ? <> until <b>{dateTimeFmt(h.heldUntil)}</b></> : null}</>
                          : <>Waiting for your Mobile Money approval</>}
                      </p>
                    </div>
                  </div>
                  {h.status === "HELD" ? (
                    <div className="border-t border-line bg-surface/60 px-4 py-4">
                      <p className="text-sm text-ink-3">
                        {slot
                          ? started ? "Enjoyed it? Confirm and the venue gets paid now. If you do nothing, they're paid automatically a day after your booking ends." : "Show your booking SMS at the venue. If something goes wrong, tell us before the end of the day after."
                          : "Got the keys? Confirm it so the landlord is paid. Until then your deposit stays with FindEkifo."}
                      </p>
                      <div className="mt-3 flex flex-wrap items-start gap-2">
                        {!slot || started ? (
                          <ActionButton action={confirmMoveInAction.bind(null, h.id)} variant="primary" size="md"
                            confirm={slot
                              ? { title: "Confirm your booking happened?", body: `This releases ${formatUGX(h.amountUgx - h.commissionUgx)} to the venue.`, confirmLabel: "Yes, all good" }
                              : { title: "Confirm you've moved in?", body: `This releases ${formatUGX(h.amountUgx - h.commissionUgx)} to the landlord and creates your tenancy agreement. Only do this once you have the keys.`, confirmLabel: "Yes, I've moved in" }}>
                            {slot ? "It went well" : "I've moved in"}
                          </ActionButton>
                        ) : null}
                        {inFreeWindow ? (
                          <ActionButton action={cancelHoldAction.bind(null, h.id)} variant="ghost" size="md"
                            confirm={{ title: "Cancel and get a refund?", body: `${formatUGX(h.amountUgx)} goes back to your Mobile Money and ${slot ? "the time" : u.label} becomes available to others.`, confirmLabel: slot ? "Cancel booking" : "Cancel reservation", danger: true }}>
                            Cancel for a full refund
                          </ActionButton>
                        ) : null}
                      </div>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-semibold text-muted hover:text-ink">Something wrong? Tell us</summary>
                        <ActionForm action={disputeAction.bind(null, h.id)} className="mt-2 space-y-2" resetOnSuccess>
                          <Textarea name="reason" required minLength={10} placeholder={slot ? "Venue was closed, pitch not as shown…" : "Landlord not answering, room isn't as shown…"} />
                          <p className="text-xs text-muted">Your money stays held while our team looks into it.</p>
                          <SubmitButton variant="danger" size="sm">Open a dispute</SubmitButton>
                        </ActionForm>
                      </details>
                    </div>
                  ) : (
                    <div className="border-t border-line px-4 py-3">
                      <Link href={`/holds/${h.id}`} className="text-sm font-semibold text-brand-ink hover:underline">Check payment status</Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={<KeyRound className="size-5" />} title="No active reservations" action={<ButtonLink href="/" variant="outline">Find a space</ButtonLink>}>
            Reserve a free unit with Mobile Money and it's held for you while you arrange to move in.
          </Empty>
        )}
      </Section>

      <Section title="Visits" count={openVisits.length || undefined}>
        {openVisits.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">
            {openVisits.map(({ v, u, p }) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="grid w-14 shrink-0 place-items-center rounded-[12px] bg-surface py-1.5 text-center ring-1 ring-line">
                  <span className="text-[11px] font-semibold text-muted">{v.slotStart.toLocaleDateString("en-UG", { month: "short", timeZone: "Africa/Kampala" })}</span>
                  <span className="font-display text-xl font-bold leading-none">{v.slotStart.toLocaleDateString("en-UG", { day: "numeric", timeZone: "Africa/Kampala" })}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name} <span className="font-normal text-muted">{u.label}</span></p>
                  <p className="text-sm text-muted">{v.slotStart.toLocaleTimeString("en-UG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Kampala" })} <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden /> {p.address}</span></p>
                  {v.status === "RESCHEDULED" && v.proposedSlot ? <p className="mt-1 text-sm font-semibold text-accent-ink">Landlord suggests {dateTimeFmt(v.proposedSlot)}</p> : null}
                </div>
                <div className="flex basis-full items-center gap-2 pl-[72px] sm:basis-auto sm:pl-0">
                  <StatusBadge status={v.status} />
                  {v.status === "RESCHEDULED" ? <ActionButton action={seekerVisitAction.bind(null, v.id, "CONFIRMED")} variant="primary">Accept new time</ActionButton> : null}
                  <ActionButton action={seekerVisitAction.bind(null, v.id, "CANCELLED")} variant="ghost" confirm={{ title: "Cancel this visit?", body: "The landlord will get an SMS.", confirmLabel: "Cancel visit", danger: true }}>Cancel</ActionButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<CalendarClock className="size-5" />} title="No visits booked">Open any listing and tap “Book a free visit”.</Empty>
        )}
        {pastVisits.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-muted hover:text-ink">Past visits ({pastVisits.length})</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {pastVisits.map(({ v, u, p }) => (
                <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5">
                  <span>{p.name}, {u.label} <span className="text-muted">{dateFmt(v.slotStart)}</span></span>
                  <StatusBadge status={v.status} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>

      {myTenancies.length || history.length ? (
        <Section title="Past bookings and homes">
          <div className="grid gap-3 sm:grid-cols-2">
            {myTenancies.map(({ t, u, p }) => {
              const hold = history.find(({ h }) => h.id === t.holdId)?.h;
              return (
                <div key={t.id} className="rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line">
                  <p className="font-semibold">{p.name}, {u.label}</p>
                  <p className="text-sm text-muted">{formatUGX(t.rentUgx)} {CYCLE_LABEL[t.cycle]}. Since {dateFmt(t.startDate)}{t.endedAt ? `, ended ${dateFmt(t.endedAt)}` : ""}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`/api/agreements/${t.id}`} target="_blank" className={buttonClass("outline", "sm")}><FileText className="size-4" aria-hidden /> Tenancy agreement (PDF)</a>
                  </div>
                  {hold && !reviewed.has(hold.id) ? (
                    <details className="mt-3">
                      <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand-ink"><Star className="size-4" aria-hidden /> Review this place</summary>
                      <ActionForm action={reviewAction.bind(null, hold.id)} className="mt-3 space-y-3">
                        <fieldset className="flex gap-1" aria-label="Your rating">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <label key={s} className="relative cursor-pointer">
                              <input type="radio" name="stars" value={s} defaultChecked={s === 5} className="peer sr-only" />
                              <span className="block rounded-lg px-2.5 py-1.5 text-sm font-bold ring-1 ring-inset ring-line-strong peer-checked:bg-accent peer-checked:text-ink peer-checked:ring-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand">{s}★</span>
                            </label>
                          ))}
                        </fieldset>
                        <Textarea name="comment" placeholder="Water, power, the caretaker, security, noise…" />
                        <SubmitButton size="sm">Post</SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                </div>
              );
            })}
            {history.filter(({ h }) => h.status === "CONFIRMED" && h.startsAt).map(({ h, u, p }) => (
              <div key={h.id} className="rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line">
                <p className="font-semibold">{p.name}, {u.label}</p>
                <p className="text-sm text-muted">{fmtWindow(h.startsAt!, h.endsAt!)}. Paid {formatUGX(h.amountUgx)}</p>
                {!reviewed.has(h.id) ? (
                  <details className="mt-3">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand-ink"><Star className="size-4" aria-hidden /> Review this place</summary>
                    <ActionForm action={reviewAction.bind(null, h.id)} className="mt-3 space-y-3">
                      <fieldset className="flex gap-1" aria-label="Your rating">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <label key={s} className="relative cursor-pointer">
                            <input type="radio" name="stars" value={s} defaultChecked={s === 5} className="peer sr-only" />
                            <span className="block rounded-lg px-2.5 py-1.5 text-sm font-bold ring-1 ring-inset ring-line-strong peer-checked:bg-accent peer-checked:text-ink peer-checked:ring-accent">{s}★</span>
                          </label>
                        ))}
                      </fieldset>
                      <Textarea name="comment" placeholder="The surface, lighting, staff, parking…" />
                      <SubmitButton size="sm">Post</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </div>
            ))}
            {history.filter(({ h }) => h.status === "REFUNDED").map(({ h, u, p }) => (
              <div key={h.id} className="rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line">
                <p className="flex items-center gap-2 font-semibold">{p.name}, {u.label} <StatusBadge status={h.status} /></p>
                <p className="text-sm text-muted">{formatUGX(h.amountUgx)} returned. Reserved {dateFmt(h.createdAt)}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Saved" count={saved.length || undefined} className="scroll-mt-20" >
        <div id="saved" className="scroll-mt-20" />
        {saved.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {saved.map(({ p, cover }) => (
              <li key={p.id}>
                <Link href={`/spaces/${p.id}`} className="group block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgSrc(cover, 400)} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-[12px] object-cover" />
                  <p className="mt-2 truncate text-sm font-semibold group-hover:underline">{p.name}</p>
                  <p className={cx("text-xs", p.vacantCount ? "text-brand-ink" : "text-muted")}>{p.vacantCount ? `${p.vacantCount} free in ${p.suburb}` : `Full, ${p.suburb}`}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<Heart className="size-5" />} title="Nothing saved yet">Tap Save on a listing to keep it here. Places you open stay readable even without data.</Empty>
        )}
      </Section>
    </div>
  );
}
