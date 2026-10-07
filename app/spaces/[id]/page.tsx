import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { BadgeCheck, ChevronLeft, Clock, CornerDownRight, Droplets, Flag, Heart, Lock, MapPin, MessageCircle, Navigation, Phone, ShieldCheck, Star, Zap, BedDouble, Ruler, Store, Plus } from "lucide-react";
import { db } from "@/db";
import { properties, units, media, users, reviews, savedSpaces } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { formatUGX, fmtHour, CYCLE_LABEL, CYCLE_SHORT, isSlotCycle, UNIT_STATUS_LABEL, type Cycle } from "@/lib/rules";
import { typeMap } from "@/lib/types";
import { childSpaces } from "@/lib/search";
import { directory } from "@/lib/businesses";
import { bookedWindows } from "@/lib/booking";
import { requestVisitAction, toggleSaveAction, reportAction } from "@/app/actions/seeker";
import { ActionForm, ActionButton, SubmitButton } from "@/components/action-form";
import { ButtonLink, GROUP_STYLE, Money, StatusBadge, Textarea, buttonClass, cx, dateFmt, imgSrc } from "@/components/ui";
import { Gallery } from "@/components/gallery";
import { VisitSheet } from "@/components/visit-sheet";
import { SlotPicker } from "@/components/slot-picker";
import { ShareButton } from "@/components/share-button";
import { PropertyCard } from "@/components/property-card";
import { BusinessCard } from "@/components/business-card";
import { TypeIcon } from "@/components/type-icon";

export const dynamic = "force-dynamic";

const YAKA = { PRIVATE: ["Own Yaka meter", "Each unit has its own prepaid meter"], SHARED: ["Shared Yaka meter", "Power is split between tenants"], INCLUSIVE: ["Power included", "Electricity is part of the price"], NONE: ["No power supply", ""] } as const;
const WATER = { NWSC: ["NWSC water", "Piped National Water supply"], GRAVITY_TANK: ["Gravity tank", "Water from an overhead tank"], BOTH: ["NWSC + backup tank", "Water even when NWSC is off"], NONE: ["No water on site", ""] } as const;

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select({ p: properties, owner: users }).from(properties).innerJoin(users, eq(users.id, properties.ownerId)).where(eq(properties.id, id));
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const row = await load((await params).id);
  if (!row || row.p.status !== "LIVE") return { title: "Space", robots: { index: false } };
  const type = (await typeMap()).get(row.p.type);
  const desc = `${type?.name ?? "Space"} in ${row.p.suburb}, ${row.p.district}${row.p.minPriceUgx ? `, from ${formatUGX(row.p.minPriceUgx)}` : ""}.`;
  const [cover] = await db.select({ url: media.url }).from(media).where(and(eq(media.propertyId, row.p.id), eq(media.kind, "PHOTO"))).orderBy(asc(media.position)).limit(1);
  return {
    title: `${row.p.name}, ${row.p.suburb}`,
    description: desc,
    openGraph: { title: `${row.p.name}, ${row.p.suburb}`, description: desc, images: cover ? [imgSrc(cover.url, 1200)] : undefined },
  };
}

export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await load(id);
  if (!row) notFound();
  const { p, owner } = row;
  const user = await currentUser();
  const isOwner = user?.id === p.ownerId;
  if (p.status !== "LIVE" && !isOwner && user?.role !== "ADMIN") notFound();
  const cfg = config();
  const types = await typeMap();
  const type = types.get(p.type);
  const group = type?.group ?? "STAY";
  const slotMode = type?.bookingMode === "SLOT";
  const g = GROUP_STYLE[group];

  const [unitRows, mediaRows, reviewRows, saved, children, parent, shops] = await Promise.all([
    // Free units first, then cheapest, then natural label order (Room 2 before Room 10).
    db.select().from(units).where(eq(units.propertyId, id))
      .orderBy(sql`case ${units.status} when 'VACANT' then 0 when 'RESERVED' then 1 when 'UNDER_CONSTRUCTION' then 2 else 3 end`, asc(units.priceUgx), sql`length(${units.label})`, asc(units.label)),
    db.select().from(media).where(eq(media.propertyId, id)).orderBy(asc(media.position)),
    db.select({ r: reviews, name: users.name }).from(reviews).innerJoin(users, eq(users.id, reviews.authorId)).where(eq(reviews.propertyId, id)).orderBy(desc(reviews.createdAt)).limit(10),
    user ? db.select().from(savedSpaces).where(and(eq(savedSpaces.userId, user.id), eq(savedSpaces.propertyId, id))) : Promise.resolve([]),
    type?.canHaveChildren ? childSpaces(p.id) : Promise.resolve([]),
    p.parentId ? db.select({ id: properties.id, name: properties.name, type: properties.type }).from(properties).where(eq(properties.id, p.parentId)).then((r) => r[0]) : Promise.resolve(undefined),
    group === "BUSINESS" || type?.canHaveChildren ? directory({ propertyId: p.id, limit: 12 }) : Promise.resolve([]),
  ]);
  const listed = unitRows.filter((u) => u.status !== "UNLISTED");
  const free = listed.filter((u) => u.status === "VACANT");
  const taken = listed.filter((u) => u.status !== "VACANT");
  const cheapestFree = [...free].sort((a, b) => a.priceUgx - b.priceUgx)[0];
  const verified = owner.landlordStatus === "VERIFIED";
  const signIn = `/login?next=${encodeURIComponent(`/spaces/${p.id}`)}`;
  const slotUnits = free.filter((u) => isSlotCycle(u.cycle)).map((u) => ({ id: u.id, label: u.label, priceUgx: u.priceUgx, cycle: u.cycle as Cycle }));
  const booked = slotUnits.length
    ? (await bookedWindows(slotUnits.map((u) => u.id), new Date(), new Date(Date.now() + 15 * 86_400_000)))
        .map((b) => ({ unitId: b.unitId, start: b.startsAt!.toISOString(), end: b.endsAt!.toISOString() }))
    : [];
  const noun = type?.unitNoun ?? "Unit";

  const picker = (props: Partial<React.ComponentProps<typeof SlotPicker>>) =>
    user ? (
      <SlotPicker units={slotUnits} booked={booked} openFrom={p.openFrom} openTo={p.openTo} venue={p.name} noun={noun} {...props} />
    ) : (
      <ButtonLink href={signIn} variant={props.variant ?? "primary"} size={props.size ?? "md"} className={props.className}>{props.label ?? "Book a time"}</ButtonLink>
    );

  const unitRow = (u: (typeof listed)[number]) => {
    const slot = isSlotCycle(u.cycle);
    return (
      <li key={u.id} className={cx("grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-4", u.status !== "VACANT" && "opacity-70")}>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">{u.label} {u.status !== "VACANT" ? <StatusBadge status={u.status} /> : null}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
            {u.beds != null && !slot ? <span className="inline-flex items-center gap-1"><BedDouble className="size-3.5" aria-hidden />{u.beds} bed{u.beds === 1 ? "" : "s"}</span> : null}
            {u.sizeSqft ? <span className="inline-flex items-center gap-1"><Ruler className="size-3.5" aria-hidden />{u.sizeSqft} sq ft</span> : null}
            {u.status === "VACANT" && !slot ? <span>{formatUGX(u.depositUgx)} to reserve</span> : null}
            {u.status === "VACANT" && slot ? <span>Pay in full to book</span> : null}
            {u.status === "UNDER_CONSTRUCTION" ? <span>Coming soon — book a visit to ask about pre-leasing</span> : null}
          </p>
        </div>
        <p className="text-right leading-tight">
          <Money amount={u.priceUgx} size="md" />
          <span className="block text-xs text-muted">{CYCLE_LABEL[u.cycle]}</span>
        </p>
        {u.status === "VACANT" && !isOwner ? (
          <div className="col-span-2 flex flex-wrap gap-2">
            {slot ? (
              picker({ initialUnit: u.id, size: "sm", className: "flex-1 sm:flex-none", label: "Book a time" })
            ) : (
              <>
                <ButtonLink href={user ? `/reserve/${u.id}` : `/login?next=${encodeURIComponent(`/reserve/${u.id}`)}`} size="sm" className="flex-1 sm:flex-none">Reserve this {noun.toLowerCase()}</ButtonLink>
                {user ? (
                  <VisitSheet action={requestVisitAction.bind(null, u.id, p.id)} unitLabel={u.label} propertyName={p.name} size="sm" className="flex-1 sm:flex-none" />
                ) : (
                  <ButtonLink variant="outline" size="sm" href={signIn} className="flex-1 sm:flex-none">Book a free visit</ButtonLink>
                )}
              </>
            )}
          </div>
        ) : u.status === "UNDER_CONSTRUCTION" && !isOwner && user ? (
          <div className="col-span-2"><VisitSheet action={requestVisitAction.bind(null, u.id, p.id)} unitLabel={u.label} propertyName={p.name} size="sm" /></div>
        ) : null}
      </li>
    );
  };

  return (
    <article className="pb-20 lg:pb-0">
      <div className="mb-3 hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-muted sm:flex">
        <Link href={`/?suburb=${encodeURIComponent(p.suburb)}#results`} className="inline-flex items-center gap-1 hover:text-ink"><ChevronLeft className="size-4" aria-hidden /> More in {p.suburb}</Link>
        {parent ? <Link href={`/spaces/${parent.id}`} className="inline-flex items-center gap-1 hover:text-ink"><CornerDownRight className="size-4" aria-hidden /> Part of {parent.name}</Link> : null}
      </div>

      {p.status !== "LIVE" ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-accent-soft px-4 py-3 text-sm font-medium text-accent-ink">
          Only you can see this page. <StatusBadge status={p.status} /> {p.reviewNote ?? ""}
        </p>
      ) : null}

      <div className="-mt-6 sm:mt-0">
        <Gallery title={p.name} items={mediaRows.map((m) => ({ url: imgSrc(m.url, 1100), thumb: imgSrc(m.url, 240), full: imgSrc(m.url, 1800), kind: m.kind }))} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", g.chip)}>
                <TypeIcon name={type?.icon ?? "building"} className="size-3.5" /> {type?.name ?? "Space"}{parent ? ` at ${parent.name}` : ` in ${p.suburb}`}
              </p>
              <h1 className="display-tight mt-2 text-[34px] font-extrabold leading-[1.02] sm:text-[44px]">{p.name}</h1>
              <p className="mt-2 flex items-start gap-1.5 text-muted"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {p.address}, {p.suburb}, {p.district}</p>
            </div>
            <div className="flex gap-1">
              <ShareButton title={p.name} text={`${p.name} in ${p.suburb} on FindEkifo`} />
              {user && !isOwner ? (
                <ActionButton action={toggleSaveAction.bind(null, p.id)} variant="ghost">
                  <Heart className={cx("size-4", saved.length > 0 && "fill-danger text-danger")} /> {saved.length ? "Saved" : "Save"}
                </ActionButton>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {verified ? <span className="inline-flex items-center gap-1.5 font-semibold text-brand-ink"><BadgeCheck className="size-4" aria-hidden /> ID-verified owner</span> : null}
            {p.ratingCount ? (
              <a href="#reviews" className="inline-flex items-center gap-1 font-semibold hover:underline">
                <Star className="size-4 fill-accent text-accent" aria-hidden /> {p.ratingAvg.toFixed(1)} <span className="font-normal text-muted">from {p.ratingCount} review{p.ratingCount === 1 ? "" : "s"}</span>
              </a>
            ) : null}
            {slotMode ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-sky-ink"><Clock className="size-4" aria-hidden /> Open {fmtHour(p.openFrom)} to {fmtHour(p.openTo)}</span>
            ) : listed.length ? (
              <span className={cx("font-semibold", free.length ? "text-brand-ink" : "text-muted")}>{free.length ? `${free.length} of ${listed.length} free now` : "Fully booked right now"}</span>
            ) : null}
          </div>

          {/* Key facts */}
          {slotMode ? (
            <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-card)] bg-line ring-1 ring-line sm:grid-cols-2">
              <Fact icon={<Clock className="size-5" />} term={`${fmtHour(p.openFrom)} – ${fmtHour(p.openTo)}`} detail="Opening hours, every day" />
              <Fact icon={<Lock className="size-5" />} term="Paid safely" detail="The venue is paid after your booking happens" />
              <Fact icon={<ShieldCheck className="size-5" />} term={p.security.length ? p.security.join(", ") : "Security on request"} detail="Security" />
              <Fact icon={<BadgeCheck className="size-5" />} term={`Free cancellation`} detail={`Up to ${cfg.FREE_CANCEL_HOURS} hours before your booking`} />
            </dl>
          ) : (
            <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-card)] bg-line ring-1 ring-line sm:grid-cols-2">
              <Fact icon={<Zap className="size-5" />} term={YAKA[p.yaka][0]} detail={YAKA[p.yaka][1]} />
              <Fact icon={<Droplets className="size-5" />} term={WATER[p.water][0]} detail={WATER[p.water][1]} />
              <Fact icon={<ShieldCheck className="size-5" />} term={p.security.length ? p.security.join(", ") : "No security listed"} detail="Security" />
              <Fact icon={<BadgeCheck className="size-5" />} term="Free to view" detail="Report anyone who asks for a viewing fee" />
            </dl>
          )}

          {p.amenities.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {p.amenities.map((a) => <li key={a} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-line">{a}</li>)}
            </ul>
          ) : null}

          {p.description ? <p className="mt-6 max-w-[68ch] whitespace-pre-line text-[16px] leading-relaxed text-ink-3">{p.description}</p> : null}

          {/* Units */}
          {listed.length ? (
            <section id="units" className="mt-10 scroll-mt-20">
              <h2 className="text-[24px] font-bold">{slotMode ? `Book a ${noun.toLowerCase()}` : free.length ? `Choose a ${noun.toLowerCase()}` : `${noun}s`}</h2>
              <p className="mt-1 text-sm text-muted">
                {slotMode
                  ? "Pick a day and time. You pay in full now; the venue is paid after your booking, so you're covered if anything goes wrong."
                  : `Reserving holds it for ${cfg.HOLD_DURATION_HOURS} hours. Your deposit counts towards your first rent.`}
              </p>
              {free.length ? (
                <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">{free.map(unitRow)}</ul>
              ) : (
                <p className="mt-4 rounded-[var(--radius-card)] bg-white px-4 py-5 text-sm ring-1 ring-line">
                  {slotMode ? "Not taking bookings right now. Save it and check back." : "Everything is taken right now. Save this place and check back, or book a visit to ask about the next free one."}
                </p>
              )}
              {taken.length ? (
                <details className="group mt-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-muted hover:text-ink">
                    <span className="group-open:hidden">Show {taken.length} unavailable ({summarise(taken.map((t) => t.status))})</span>
                    <span className="hidden group-open:inline">Hide unavailable</span>
                  </summary>
                  <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">{taken.map(unitRow)}</ul>
                </details>
              ) : null}
            </section>
          ) : null}

          {/* Spaces inside this venue */}
          {children.length ? (
            <section className="mt-12">
              <h2 className="text-[24px] font-bold">Also at {p.name}</h2>
              <p className="mt-1 text-sm text-muted">Book these on their own — by the hour or for your event.</p>
              <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2">
                {children.map((c) => <PropertyCard key={c.id} p={c} />)}
              </div>
            </section>
          ) : null}

          {/* Shops in this building */}
          {shops.length || group === "BUSINESS" ? (
            <section className="mt-12">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[24px] font-bold"><Store className="size-5 text-accent-ink" aria-hidden /> Shops here</h2>
                  <p className="mt-1 text-sm text-muted">Businesses in {p.name}, with their room numbers.</p>
                </div>
                {shops.length ? <Link href={`/directory?mall=${p.id}`} className="text-sm font-semibold text-accent-ink hover:underline">See all</Link> : null}
              </div>
              {shops.length ? (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {shops.slice(0, 8).map(({ b }) => <BusinessCard key={b.id} b={b} mallName={p.name} compact />)}
                </div>
              ) : null}
              <Link href={user ? `/directory/new?mall=${p.id}` : `/login?next=${encodeURIComponent(`/directory/new?mall=${p.id}`)}`}
                className="mt-4 flex items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-accent/50 bg-accent-soft/60 px-4 py-3.5 text-sm hover:border-accent">
                <span className="grid size-9 place-items-center rounded-full bg-accent text-ink"><Plus className="size-4" aria-hidden /></span>
                <span><b>Have a shop here?</b> Add it to the directory free, with your room number and social links.</span>
              </Link>
            </section>
          ) : null}

          {/* Location */}
          {p.lat != null && p.lng != null ? (
            <section className="mt-12">
              <h2 className="text-[24px] font-bold">Where it is</h2>
              <p className="mt-1 text-sm text-muted">{p.address}, {p.suburb}</p>
              <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] bg-line ring-1 ring-line">
                <iframe title={`Map of ${p.name}`} loading="lazy" referrerPolicy="no-referrer" className="h-64 w-full sm:h-80"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${p.lng - 0.006}%2C${p.lat - 0.004}%2C${p.lng + 0.006}%2C${p.lat + 0.004}&layer=mapnik&marker=${p.lat}%2C${p.lng}`} />
              </div>
              <a className={buttonClass("outline", "md", "mt-3")} href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
                <Navigation className="size-4" aria-hidden /> Get directions
              </a>
            </section>
          ) : null}

          {/* Reviews */}
          <section id="reviews" className="mt-12 scroll-mt-20">
            <h2 className="text-[24px] font-bold">{slotMode ? "What guests say" : "What tenants say"}</h2>
            <p className="mt-1 text-sm text-muted">Only people who paid through FindEkifo can leave a review.</p>
            {reviewRows.length ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {reviewRows.map(({ r, name }) => (
                  <li key={r.id} className="rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex" aria-label={`${r.stars} out of 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} aria-hidden className={cx("size-4", i < r.stars ? "fill-accent text-accent" : "text-line-strong")} />)}</span>
                      <span className="text-xs text-muted">{dateFmt(r.createdAt)}</span>
                    </div>
                    {r.comment ? <p className="mt-2 text-[15px] leading-relaxed">{r.comment}</p> : null}
                    <p className="mt-2 text-sm font-semibold text-muted">{name?.split(" ")[0] ?? "Guest"}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 text-sm text-muted">No reviews yet.</p>}
          </section>

          {user && !isOwner ? (
            <details className="mt-10 border-t border-line pt-5">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted hover:text-ink"><Flag className="size-4" aria-hidden /> Report this listing</summary>
              <ActionForm action={reportAction.bind(null, p.id)} className="mt-3 max-w-lg space-y-2" resetOnSuccess>
                <Textarea name="reason" required minLength={10} placeholder="Photos don't match, someone asked for a viewing fee, it's already taken…" />
                <SubmitButton variant="danger" size="sm">Send report</SubmitButton>
              </ActionForm>
            </details>
          ) : null}
        </div>

        {/* Booking card — desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <div className="overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-lift)] ring-1 ring-line">
              <div className={cx("h-1.5", g.dot)} aria-hidden />
              <div className="p-5">
                {cheapestFree ? (
                  <>
                    <p className="text-sm text-muted">{slotMode ? "From" : "Free units from"}</p>
                    <Money amount={cheapestFree.priceUgx} size="xl" suffix={CYCLE_SHORT[cheapestFree.cycle]} />
                    <p className={cx("mt-1 text-sm font-semibold", slotMode ? "text-sky-ink" : "text-brand-ink")}>{slotMode ? `Open ${fmtHour(p.openFrom)}–${fmtHour(p.openTo)}` : `${free.length} free now`}</p>
                    {slotMode && !isOwner ? picker({ size: "lg", className: "mt-4 w-full", label: "Check availability" }) : (
                      <ButtonLink href="#units" size="lg" className="mt-4 w-full">Choose a {noun.toLowerCase()}</ButtonLink>
                    )}
                  </>
                ) : listed.length ? (
                  <>
                    <p className="font-display text-xl font-bold">{slotMode ? "Not taking bookings" : "Fully booked"}</p>
                    <p className="mt-1 text-sm text-muted">Save it and check back, or ask the owner when it's next free.</p>
                  </>
                ) : (
                  <p className="font-display text-xl font-bold">{children.length ? `${children.length} spaces to book here` : p.name}</p>
                )}
                <Contact user={Boolean(user)} owner={owner} p={p} signIn={signIn} />
              </div>
            </div>
            <ul className="space-y-3 px-1 text-sm text-ink-3">
              <li className="flex gap-2.5"><Lock className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden /> {slotMode ? "Your payment is held by FindEkifo and only paid to the venue after your booking." : "Your deposit is held by FindEkifo and only paid to the landlord after you confirm you've moved in."}</li>
              <li className="flex gap-2.5"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden /> {slotMode ? `Cancel up to ${cfg.FREE_CANCEL_HOURS} hours before for a full refund.` : `Cancel within ${cfg.FREE_CANCEL_HOURS} hours of paying for a full refund.`}</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* Contact — phones (sidebar is hidden) */}
      <div className="mt-10 rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line lg:hidden">
        <Contact user={Boolean(user)} owner={owner} p={p} signIn={signIn} />
      </div>

      {/* Sticky action bar — phones */}
      {cheapestFree && !isOwner ? (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="min-w-0 leading-tight">
              <Money amount={cheapestFree.priceUgx} size="md" suffix={CYCLE_SHORT[cheapestFree.cycle]} />
              <p className={cx("text-xs font-semibold", slotMode ? "text-sky-ink" : "text-brand-ink")}>{slotMode ? `Open ${fmtHour(p.openFrom)}–${fmtHour(p.openTo)}` : `${free.length} free now`}</p>
            </div>
            {slotMode ? picker({ size: "lg", className: "shrink-0", label: "Book a time" }) : <ButtonLink href="#units" size="lg" className="shrink-0">Choose a {noun.toLowerCase()}</ButtonLink>}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function summarise(statuses: string[]) {
  const counts = new Map<string, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts].map(([s, n]) => `${n} ${UNIT_STATUS_LABEL[s as keyof typeof UNIT_STATUS_LABEL].toLowerCase()}`).join(", ");
}

function Fact({ icon, term, detail }: { icon: React.ReactNode; term: string; detail: string }) {
  return (
    <div className="flex gap-3 bg-white px-4 py-3.5">
      <span className="mt-0.5 text-brand-ink" aria-hidden>{icon}</span>
      <div>
        <dt className="font-semibold">{term}</dt>
        {detail ? <dd className="text-[13px] text-muted">{detail}</dd> : null}
      </div>
    </div>
  );
}

function Contact({ user, owner, p, signIn }: { user: boolean; owner: { name: string | null; phone: string; landlordStatus: string }; p: { name: string }; signIn: string }) {
  const initials = (owner.name ?? "L").split(" ").map((x) => x[0]).slice(0, 2).join("");
  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-navy font-display font-bold text-white">{initials}</span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{owner.name ?? "Owner"}</p>
          <p className="text-[13px] text-muted">{owner.landlordStatus === "VERIFIED" ? "ID-verified owner" : "Owner"}</p>
        </div>
      </div>
      {user ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={`tel:${owner.phone}`} className={buttonClass("outline", "md")}><Phone className="size-4" aria-hidden /> Call</a>
          <a href={`https://wa.me/${owner.phone.replace("+", "")}?text=${encodeURIComponent(`Hello, I saw ${p.name} on FindEkifo.`)}`} target="_blank" rel="noreferrer" className={buttonClass("outline", "md")}>
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
        </div>
      ) : (
        <Link href={signIn} className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] bg-surface px-3.5 py-3 text-sm font-medium hover:bg-line">
          <Lock className="size-4 shrink-0 text-muted" aria-hidden /> Sign in with your phone number to call or WhatsApp
        </Link>
      )}
    </div>
  );
}
