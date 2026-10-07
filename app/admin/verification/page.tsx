import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { db } from "@/db";
import { landlordVerifications, users, properties, media, units, flags } from "@/db/schema";
import { formatUGX, CYCLE_SHORT } from "@/lib/rules";
import { typeMap } from "@/lib/types";
import { reviewVerificationAction, reviewListingAction, featurePropertyAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Input, PageHeader, StatusBadge, dateFmt, imgSrc } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verification center" };

export default async function VerificationCenter() {
  const [kyc, pending, live] = await Promise.all([
    db.select({ v: landlordVerifications, u: users, ninReuse: sql<number>`(select count(distinct user_id) from landlord_verifications x where x.nin_hash = "landlord_verifications"."nin_hash")` })
      .from(landlordVerifications).innerJoin(users, eq(users.id, landlordVerifications.userId))
      .where(eq(landlordVerifications.status, "PENDING")).orderBy(asc(landlordVerifications.createdAt)),
    db.select({ p: properties, owner: users }).from(properties).innerJoin(users, eq(users.id, properties.ownerId))
      .where(eq(properties.status, "PENDING_REVIEW")).orderBy(asc(properties.createdAt)),
    db.select().from(properties).where(eq(properties.status, "LIVE")).orderBy(desc(properties.publishedAt)).limit(15),
  ]);
  const ids = pending.map((x) => x.p.id);
  const types = await typeMap();
  const [pMedia, pUnits, pFlags] = ids.length
    ? await Promise.all([
        db.select().from(media).where(inArray(media.propertyId, ids)).orderBy(asc(media.position)),
        db.select().from(units).where(inArray(units.propertyId, ids)).orderBy(asc(units.label)),
        db.select().from(flags).where(and(inArray(flags.propertyId, ids), eq(flags.status, "OPEN"))),
      ])
    : [[], [], []];

  return (
    <div className="space-y-10">
      <PageHeader title="Verification center" subtitle="Compare ID documents with the property before anything goes live." />

      <section>
        <h2 className="mb-3 text-lg font-bold">Landlord identity <span className="text-muted">({kyc.length})</span></h2>
        {kyc.length ? kyc.map(({ v, u, ninReuse }) => (
          <Card key={v.id} className="mb-4 overflow-hidden">
            <div className="grid gap-0 md:grid-cols-[1fr_320px]">
              <div className="grid grid-cols-3 gap-2 bg-slate-900 p-3">
                <Doc url={v.ninPhotoUrl} label="National ID" />
                <Doc url={v.selfieUrl} label="Selfie with ID" />
                <Doc url={v.authorityDocUrl} label="Proof of authority" />
              </div>
              <div className="space-y-2 p-4 text-sm">
                <p className="text-base font-bold">{v.fullName}</p>
                <p>Phone: {u.phone}</p>
                <p>NIN ending <b className="font-mono">{v.ninLast4}</b> · submitted {dateFmt(v.createdAt)}</p>
                {ninReuse > 1 ? <p className="flex items-center gap-1.5 font-semibold text-danger"><AlertTriangle className="size-4" /> This NIN is used on {ninReuse} accounts</p> : null}
                <ul className="list-disc pl-5 text-xs text-muted">
                  <li>Name on ID matches the name entered</li>
                  <li>Selfie face matches the ID photo</li>
                  <li>Authority document names this person or authorises them</li>
                </ul>
                <ActionForm action={reviewVerificationAction.bind(null, v.id, true)}><SubmitButton size="sm" className="w-full">Verify landlord</SubmitButton></ActionForm>
                <ActionForm action={reviewVerificationAction.bind(null, v.id, false)} className="flex gap-2">
                  <Input name="note" placeholder="Reason (sent by SMS)" required />
                  <SubmitButton size="md" variant="danger">Reject</SubmitButton>
                </ActionForm>
              </div>
            </div>
          </Card>
        )) : <Empty title="No identity checks waiting" />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Listings to review <span className="text-muted">({pending.length})</span></h2>
        {pending.length ? pending.map(({ p, owner }) => {
          const m = pMedia.filter((x) => x.propertyId === p.id);
          const us = pUnits.filter((x) => x.propertyId === p.id);
          const fl = pFlags.filter((x) => x.propertyId === p.id);
          return (
            <Card key={p.id} className="mb-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/spaces/${p.id}`} className="text-base font-bold hover:underline">{p.name}</Link>
                  <p className="text-sm text-muted">{types.get(p.type)?.name ?? p.type}. {p.address}, {p.suburb}, {p.district}. {p.lat ? `GPS ${p.lat.toFixed(4)}, ${p.lng?.toFixed(4)}` : "No GPS pin"}</p>
                  <p className="text-sm">Owner: {owner.name ?? owner.phone} <StatusBadge status={owner.landlordStatus} /></p>
                </div>
                <p className="text-sm text-muted">{dateFmt(p.createdAt)}</p>
              </div>
              {fl.map((f) => <p key={f.id} className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"><AlertTriangle className="size-4" /> {f.kind.replace("_", " ")}: {f.reason}</p>)}
              <div className="scroll-row mt-3 flex gap-2 overflow-x-auto">
                {m.map((x) => (
                  <a key={x.id} href={x.url} target="_blank" rel="noreferrer" className="shrink-0">
                    {x.kind === "VIDEO" ? <span className="grid h-24 w-32 place-items-center rounded-lg bg-navy text-xs font-bold text-white">VIDEO</span>
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={imgSrc(x.url, 300)} alt="" className="h-24 w-32 rounded-lg object-cover" loading="lazy" />}
                  </a>
                ))}
              </div>
              <p className="mt-2 text-sm"><b>{us.length} units:</b> {us.slice(0, 6).map((u) => `${u.label} ${formatUGX(u.priceUgx)}${CYCLE_SHORT[u.cycle]}`).join(" · ")}{us.length > 6 ? " …" : ""}</p>
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <ActionForm action={reviewListingAction.bind(null, p.id, true)}><SubmitButton size="sm">Approve & publish</SubmitButton></ActionForm>
                <ActionForm action={reviewListingAction.bind(null, p.id, false)} className="flex gap-2">
                  <Input name="note" placeholder="What to fix (sent by SMS)" required className="h-9 w-64" />
                  <SubmitButton size="sm" variant="danger">Reject</SubmitButton>
                </ActionForm>
              </div>
            </Card>
          );
        }) : <Empty title="No listings waiting" />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Featured placement</h2>
        <p className="mb-3 text-sm text-muted">Pin a live listing to the top of suburb results after the owner pays the featured fee.</p>
        <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
          {live.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span><b>{p.name}</b> · {p.suburb} {p.featuredUntil && p.featuredUntil > new Date() ? <Badge tone="navy">Featured to {dateFmt(p.featuredUntil)}</Badge> : null}</span>
              <ActionForm action={featurePropertyAction.bind(null, p.id)} className="flex gap-2">
                <Input name="days" type="number" min={0} max={90} defaultValue={30} className="h-9 w-20" aria-label="Days" />
                <SubmitButton size="sm" variant="outline">Set days</SubmitButton>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Doc({ url, label }: { url: string; label: string }) {
  const pdf = /\.pdf($|\?)/i.test(url);
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group relative block aspect-[3/4] overflow-hidden rounded-lg bg-slate-800">
      {pdf ? <span className="grid size-full place-items-center text-sm font-bold text-white">PDF</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={url} alt={label} className="size-full object-cover" />}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">{label} <ExternalLink className="size-3" /></span>
    </a>
  );
}
