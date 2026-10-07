import Link from "next/link";
import { MapPin } from "lucide-react";
import type { businesses } from "@/db/schema";
import { cx, imgSrc } from "./ui";

type B = typeof businesses.$inferSelect;

/** Storefront card for the Business hub. The shop's own photo, name and exact room do the work. */
export function BusinessCard({ b, mallName, compact }: { b: B; mallName: string; compact?: boolean }) {
  return (
    <Link href={`/directory/${b.slug}`} className="group block">
      <div className={cx("relative overflow-hidden rounded-[var(--radius-card)] bg-line", compact ? "aspect-square" : "aspect-[4/3]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc(b.photos[0], 480)} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="absolute bottom-2 left-2 rounded-[8px] bg-navy px-2 py-1 font-display text-sm font-bold text-white shadow-sm">{b.unitLabel}</span>
      </div>
      <p className="mt-2.5 line-clamp-1 font-semibold leading-snug group-hover:underline">{b.name}</p>
      <p className="text-[13px] text-muted">{b.category}</p>
      {!compact ? <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-3"><MapPin className="size-3.5" aria-hidden /> {mallName}</p> : <p className="line-clamp-1 text-[13px] text-ink-3">{mallName}</p>}
    </Link>
  );
}
