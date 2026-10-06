import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { BadgeCheck, CalendarClock, Droplets, Flag, Heart, MapPin, MessageCircle, Phone, ShieldCheck, Star, Zap, Navigation, Lock } from "lucide-react";
import { db } from "@/db";
import { properties, units, media, users, reviews, savedSpaces } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { formatUGX, CYCLE_LABEL, CATEGORY_LABEL } from "@/lib/rules";
import { requestVisitAction, toggleSaveAction, reportAction } from "@/app/actions/seeker";
import { ActionForm, ActionButton, SubmitButton } from "@/components/action-form";
import { Badge, ButtonLink, Card, Field, Input, StatusBadge, Textarea, buttonClass, cx, dateFmt, imgSrc } from "@/components/ui";
import { Gallery } from "@/components/gallery";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select({ p: properties, owner: users }).from(properties).innerJoin(users, eq(users.id, properties.ownerId)).where(eq(properties.id, id));
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const row = await load((await params).id);
  if (!row || row.p.status !== "LIVE") return { title: "Space" };
  return {
    title: `${row.p.name}, ${row.p.suburb}`,
    description: `${CATEGORY_LABEL[row.p.category]} in ${row.p.suburb}, ${row.p.district}${row.p.minPriceUgx ? ` from ${formatUGX(row.p.minPriceUgx)}` : ""}.`,
  };
}

const YAKA = { PRIVATE: "Private Yaka meter", SHARED: "Shared Yaka meter", INCLUSIVE: "Power included in rent", NONE: "No power supply" } as const;
const WATER = { NWSC: "NWSC water", GRAVITY_TANK: "Gravity water tank", BOTH: "NWSC + backup tank", NONE: "No water on site" } as const;

export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await load(id);
  if (!row) notFound();
  const { p, owner } = row;
  const user = await currentUser();
  const isOwner = user?.id === p.ownerId;
  if (p.status !== "LIVE" && !isOwner && user?.role !== "ADMIN") notFound();

  const [unitRows, mediaRows, reviewRows, saved] = await Promise.all([
    db.select().from(units).where(eq(units.propertyId, id)).orderBy(asc(units.priceUgx), sql`length(${units.label})`, asc(units.label)),
    db.select().from(media).where(eq(media.propertyId, id)).orderBy(asc(media.position)),
    db.select({ r: reviews, name: users.name }).from(reviews).innerJoin(users, eq(users.id, reviews.authorId)).where(eq(reviews.propertyId, id)).orderBy(desc(reviews.createdAt)).limit(10),
    user ? db.select().from(savedSpaces).where(and(eq(savedSpaces.userId, user.id), eq(savedSpaces.propertyId, id))) : Promise.resolve([]),
  ]);
  const listed = unitRows.filter((u) => u.status !== "UNLISTED");
  const vacant = listed.filter((u) => u.status === "VACANT");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const maxDay = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const waNumber = owner.phone.replace("+", "");

  return (
    <article>
      {p.status !== "LIVE" ? (
        <p className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-amber-800">
          Only you can see this page — status: <StatusBadge status={p.status} />{p.reviewNote ? ` · ${p.reviewNote}` : ""}
        </p>
      ) : null}

      <Gallery items={mediaRows.map((m) => ({ url: imgSrc(m.url, 1280), thumb: imgSrc(m.url, 320), kind: m.kind }))} title={p.name} />

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="slate">{CATEGORY_LABEL[p.category].replace(/s$/, "")}</Badge>
            {owner.landlordStatus === "VERIFIED" ? <Badge tone="green"><BadgeCheck className="size-3" /> Verified landlord</Badge> : null}
            {p.ratingCount ? <span className="flex items-center gap-1 text-sm font-semibold"><Star className="size-4 fill-amber-400 text-amber-400" />{p.ratingAvg.toFixed(1)} <span className="font-normal text-muted">({p.ratingCount})</span></span> : null}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{p.name}</h1>
          <p className="mt-1 flex items-center gap-1 text-muted"><MapPin className="size-4" /> {p.address}, {p.suburb}, {p.district}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Chip icon={<Zap className="size-4" />}>{YAKA[p.yaka]}</Chip>
            <Chip icon={<Droplets className="size-4" />}>{WATER[p.water]}</Chip>
            {p.security.map((s) => <Chip key={s} icon={<ShieldCheck className="size-4" />}>{s}</Chip>)}
            {p.amenities.map((a) => <Chip key={a}>{a}</Chip>)}
          </div>

          {p.description ? <p className="mt-5 whitespace-pre-line leading-relaxed text-slate-700">{p.description}</p> : null}

          <h2 className="mt-8 text-lg font-bold">Units <span className="text-muted">· {vacant.length} of {listed.length} vacant</span></h2>
          <div className="mt-3 space-y-3">
            {listed.map((u) => (
              <Card key={u.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-bold">{u.label} <StatusBadge status={u.status} /></p>
                    <p className="mt-0.5 text-sm text-muted">
                      {[u.beds != null ? `${u.beds} bed${u.beds === 1 ? "" : "s"}` : null, u.sizeSqft ? `${u.sizeSqft} sq ft` : null, `Deposit to reserve: ${formatUGX(u.depositUgx)}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className="tabular text-right"><span className="text-lg font-extrabold">{formatUGX(u.priceUgx)}</span><br /><span className="text-xs text-muted">{CYCLE_LABEL[u.cycle]}</span></p>
                </div>
                {u.status === "VACANT" && !isOwner ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ButtonLink href={`/reserve/${u.id}`} size="sm">Reserve with Mobile Money</ButtonLink>
                    {user ? (
                      <details className="group w-full sm:w-auto">
                        <summary className={cx(buttonClass("outline", "sm"), "list-none cursor-pointer")}><CalendarClock className="size-4" /> Schedule a visit</summary>
                        <ActionForm action={requestVisitAction.bind(null, u.id, p.id)} className="mt-3 grid gap-3 rounded-xl bg-surface p-3 sm:grid-cols-2" resetOnSuccess>
                          <Field label="Date"><Input type="date" name="date" min={today} max={maxDay} required /></Field>
                          <Field label="Time" hint="8am – 6pm"><Input type="time" name="time" min="08:00" max="17:30" step={1800} defaultValue="10:00" required /></Field>
                          <Field label="Note for the landlord (optional)" className="sm:col-span-2"><Input name="note" maxLength={200} placeholder="I'll come with my parent" /></Field>
                          <div className="sm:col-span-2"><SubmitButton size="sm" variant="navy">Request visit</SubmitButton></div>
                        </ActionForm>
                      </details>
                    ) : (
                      <ButtonLink variant="outline" size="sm" href={`/login?next=/spaces/${p.id}`}><CalendarClock className="size-4" /> Schedule a visit</ButtonLink>
                    )}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>

          {p.lat != null && p.lng != null ? (
            <>
              <h2 className="mt-8 text-lg font-bold">Location</h2>
              <div className="mt-3 overflow-hidden rounded-[var(--radius-card)] border border-line">
                <iframe
                  title={`Map of ${p.name}`}
                  loading="lazy"
                  className="h-64 w-full"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${p.lng - 0.006}%2C${p.lat - 0.004}%2C${p.lng + 0.006}%2C${p.lat + 0.004}&layer=mapnik&marker=${p.lat}%2C${p.lng}`}
                />
              </div>
              <a className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
                <Navigation className="size-4" /> Get directions
              </a>
            </>
          ) : null}

          <h2 className="mt-8 text-lg font-bold">Reviews from verified tenants</h2>
          {reviewRows.length ? (
            <ul className="mt-3 space-y-3">
              {reviewRows.map(({ r, name }) => (
                <li key={r.id} className="rounded-xl bg-white p-4 ring-1 ring-line">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={cx("size-3.5", i < r.stars ? "fill-amber-400 text-amber-400" : "text-slate-300")} />)}</span>
                    {name ?? "Tenant"} · <span className="font-normal text-muted">{dateFmt(r.createdAt)}</span>
                  </p>
                  {r.comment ? <p className="mt-1.5 text-sm text-slate-700">{r.comment}</p> : null}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">No reviews yet. Only tenants who moved in through FindEkifo can review.</p>}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <p className="text-sm text-muted">From</p>
            <p className="tabular text-3xl font-extrabold">{p.minPriceUgx ? formatUGX(p.minPriceUgx) : "—"}</p>
            <p className="mt-3 text-sm font-semibold">Caretaker / landlord</p>
            {user ? (
              <>
                <p className="mt-0.5 text-sm">{owner.name ?? "Landlord"} · {owner.phone}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a href={`tel:${owner.phone}`} className={buttonClass("outline", "sm")}><Phone className="size-4" /> Call</a>
                  <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi, I found ${p.name} on FindEkifo.`)}`} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}><MessageCircle className="size-4" /> WhatsApp</a>
                </div>
              </>
            ) : (
              <Link href={`/login?next=/spaces/${p.id}`} className="mt-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm font-medium text-navy">
                <Lock className="size-4 text-muted" /> Sign in with your phone to see contacts
              </Link>
            )}
            {user && !isOwner ? (
              <div className="mt-3">
                <ActionButton action={toggleSaveAction.bind(null, p.id)} variant="ghost" size="sm">
                  <Heart className={cx("size-4", saved.length > 0 && "fill-red-500 text-red-500")} /> {saved.length ? "Saved" : "Save for later"}
                </ActionButton>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-2 p-5 text-sm">
            <p className="flex gap-2"><ShieldCheck className="size-5 shrink-0 text-brand" /> Your deposit is held in escrow. The landlord is paid only after you confirm move-in.</p>
            <p className="flex gap-2"><BadgeCheck className="size-5 shrink-0 text-brand" /> No viewing fees. If anyone asks for one, report the listing.</p>
          </Card>

          {user && !isOwner ? (
            <details className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-muted"><Flag className="size-4" /> Report this listing</summary>
              <ActionForm action={reportAction.bind(null, p.id)} className="mt-3 space-y-2" resetOnSuccess>
                <Textarea name="reason" required minLength={10} placeholder="Photos don't match, asked for viewing fee, already let…" />
                <SubmitButton variant="danger" size="sm">Send report</SubmitButton>
              </ActionForm>
            </details>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-line">{icon}{children}</span>;
}
