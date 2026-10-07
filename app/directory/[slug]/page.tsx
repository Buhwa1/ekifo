import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { ChevronLeft, Clock, Globe, MapPin, MessageCircle, Navigation, Pencil, Phone, Store } from "lucide-react";
import { db } from "@/db";
import { businesses, properties } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { directory, socialUrl } from "@/lib/businesses";
import { BusinessCard } from "@/components/business-card";
import { ShareButton } from "@/components/share-button";
import { ButtonLink, StatusBadge, buttonClass, cx, imgSrc } from "@/components/ui";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) return null;
  const [row] = await db.select({ b: businesses, mall: properties }).from(businesses).innerJoin(properties, eq(properties.id, businesses.propertyId)).where(eq(businesses.slug, slug));
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const row = await load((await params).slug);
  if (!row || row.b.status !== "PUBLISHED") return { title: "Business", robots: { index: false } };
  return {
    title: `${row.b.name}, ${row.b.unitLabel} ${row.mall.name}`,
    description: `${row.b.category} at ${row.mall.name}, ${row.b.unitLabel}. ${row.b.description}`.slice(0, 160),
    openGraph: { images: row.b.photos[0] ? [imgSrc(row.b.photos[0], 1200)] : undefined },
  };
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await load(slug);
  if (!row) notFound();
  const { b, mall } = row;
  const user = await currentUser();
  const canEdit = user && (user.id === b.ownerId || user.role === "ADMIN");
  if (b.status !== "PUBLISHED" && !canEdit && user?.id !== mall.ownerId) notFound();
  const neighbours = (await directory({ propertyId: mall.id, limit: 9 })).filter((x) => x.b.id !== b.id).slice(0, 4);

  const links = [
    b.whatsapp ? { href: socialUrl.whatsapp(b.whatsapp), label: "WhatsApp", icon: <MessageCircle className="size-4" aria-hidden />, primary: true } : null,
    b.phone ? { href: `tel:${b.phone}`, label: "Call", icon: <Phone className="size-4" aria-hidden /> } : null,
    b.instagram ? { href: socialUrl.instagram(b.instagram), label: `Instagram @${b.instagram}` } : null,
    b.tiktok ? { href: socialUrl.tiktok(b.tiktok), label: `TikTok @${b.tiktok}` } : null,
    b.facebook ? { href: socialUrl.facebook(b.facebook), label: "Facebook" } : null,
    b.website ? { href: b.website, label: new URL(b.website).hostname.replace(/^www\./, ""), icon: <Globe className="size-4" aria-hidden /> } : null,
  ].filter(Boolean) as Array<{ href: string; label: string; icon?: React.ReactNode; primary?: boolean }>;

  return (
    <article>
      <Link href={`/directory?mall=${mall.id}`} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> Shops in {mall.name}
      </Link>
      {b.status !== "PUBLISHED" ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-accent-soft px-4 py-3 text-sm font-medium text-accent-ink">
          <StatusBadge status={b.status} /> {b.status === "PENDING" ? `Only you can see this until ${mall.name}'s management approves it.` : "Hidden from the directory."}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className={cx("grid gap-2", b.photos.length > 1 && "grid-cols-2")}>
          {b.photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p} src={imgSrc(p, 1000)} alt={`${b.name} shop front${i ? ` ${i + 1}` : ""}`} className={cx("w-full rounded-[var(--radius-card)] object-cover", b.photos.length > 1 ? "aspect-[3/4]" : "aspect-[4/3]")} fetchPriority={i === 0 ? "high" : "auto"} />
          ))}
        </div>

        <div>
          <p className="text-sm font-semibold text-accent-ink">{b.category}</p>
          <h1 className="display-tight mt-1 text-[38px] font-extrabold leading-[1.02] sm:text-[48px]">{b.name}</h1>

          {/* The answer to "where exactly is it?" — the reason the directory exists. */}
          <div className="mt-5 flex items-stretch overflow-hidden rounded-[var(--radius-card)] ring-1 ring-line">
            <div className="grid place-items-center bg-navy px-5 py-4 text-white">
              <span className="text-xs font-semibold text-white/70">Room</span>
              <span className="font-display text-[30px] font-extrabold leading-none">{b.unitLabel.replace(/^(room|shop|stall)\s*/i, "")}</span>
            </div>
            <div className="flex-1 bg-white px-4 py-3">
              <Link href={`/spaces/${mall.id}`} className="font-semibold hover:underline">{mall.name}</Link>
              <p className="flex items-start gap-1 text-sm text-muted"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {mall.address}, {mall.suburb}</p>
              {b.hours ? <p className="mt-1 flex items-center gap-1 text-sm text-ink-3"><Clock className="size-3.5" aria-hidden /> {b.hours}</p> : null}
            </div>
          </div>

          {b.description ? <p className="mt-5 max-w-[60ch] text-[16px] leading-relaxed text-ink-3">{b.description}</p> : null}

          <div className="mt-6 flex flex-wrap gap-2">
            {links.map((l) => (
              <a key={l.href} href={l.href} target={l.href.startsWith("tel:") ? undefined : "_blank"} rel="noreferrer" className={buttonClass(l.primary ? "primary" : "outline", "md")}>
                {l.icon}{l.label}
              </a>
            ))}
            {mall.lat != null ? (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${mall.lat},${mall.lng}`} target="_blank" rel="noreferrer" className={buttonClass("outline", "md")}><Navigation className="size-4" aria-hidden /> Directions</a>
            ) : null}
            <ShareButton title={b.name} text={`${b.name}, ${b.unitLabel} at ${mall.name}`} variant="outline" />
          </div>

          {canEdit ? <ButtonLink href={`/directory/new?edit=${b.id}`} variant="ghost" size="sm" className="mt-4"><Pencil className="size-4" aria-hidden /> Edit this business</ButtonLink> : null}
        </div>
      </div>

      {neighbours.length ? (
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-[22px] font-bold"><Store className="size-5 text-accent-ink" aria-hidden /> Also in {mall.name}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {neighbours.map(({ b: n }) => <BusinessCard key={n.id} b={n} mallName={mall.name} compact />)}
          </div>
        </section>
      ) : null}
    </article>
  );
}
