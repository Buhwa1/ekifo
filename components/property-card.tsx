import Link from "next/link";
import { Star, Zap, Droplets, CornerDownRight } from "lucide-react";
import { CYCLE_SHORT, type Cycle } from "@/lib/rules";
import { GROUP_STYLE, cx, imgSrc, type GroupKey } from "./ui";

export interface CardData {
  id: string;
  name: string;
  type: string;
  typeName: string;
  group: GroupKey;
  parentName: string | null;
  suburb: string;
  district: string;
  minPriceUgx: number | null;
  vacantCount: number;
  ratingAvg: number;
  ratingCount: number;
  yaka: string;
  water: string;
  amenities?: string[];
  featured: boolean | null;
  cover: string | null;
  cycle: string | null;
}

const ugx = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });

/** Image-led listing tile. The photo and the price carry it; facts stay in one quiet line. */
export function PropertyCard({ p, priority }: { p: CardData; priority?: boolean }) {
  const g = GROUP_STYLE[p.group] ?? GROUP_STYLE.STAY;
  const slot = p.cycle === "PER_HOUR" || p.cycle === "PER_EVENT_SLOT";
  const facts = slot
    ? (p.amenities ?? []).slice(0, 3)
    : ([
        p.yaka === "PRIVATE" ? "Own Yaka" : p.yaka === "INCLUSIVE" ? "Power included" : null,
        p.water === "BOTH" ? "Water + tank" : p.water === "GRAVITY_TANK" ? "Water tank" : p.water === "NWSC" ? "NWSC water" : null,
        p.amenities?.includes("Self-contained") ? "Self-contained" : p.amenities?.includes("Furnished") ? "Furnished" : null,
      ].filter(Boolean) as string[]);

  return (
    <Link href={`/spaces/${p.id}`} className="group block rounded-[var(--radius-card)] focus-visible:outline-offset-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc(p.cover, 640)} alt="" width={640} height={480} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className={cx("absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm", g.solid)}>{p.typeName}</span>
        {p.featured ? <span className="absolute right-2.5 top-2.5 rounded-full bg-navy px-2.5 py-1 text-xs font-bold text-white shadow-sm">Featured</span> : null}
        <span className={cx("absolute bottom-2.5 left-2.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm backdrop-blur",
          p.vacantCount > 0 ? "bg-white/95 text-brand-ink" : "bg-ink/80 text-white")}>
          {p.vacantCount > 0 ? (slot ? "Taking bookings" : `${p.vacantCount} free now`) : slot ? "Closed for now" : "Fully booked"}
        </span>
      </div>

      <div className="px-0.5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-[17px] font-semibold leading-snug">{p.name}</h3>
          {p.ratingCount > 0 ? (
            <span className="mt-0.5 flex shrink-0 items-center gap-1 text-sm font-semibold tabular">
              <Star className="size-3.5 fill-accent text-accent" aria-hidden />{p.ratingAvg.toFixed(1)}
              <span className="sr-only">out of 5 from {p.ratingCount} reviews</span>
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          {p.parentName ? <span className="inline-flex items-center gap-1"><CornerDownRight className="size-3.5" aria-hidden />At {p.parentName}, {p.suburb}</span> : <>{p.suburb}, {p.district}</>}
        </p>
        <p className="mt-1.5 flex items-baseline gap-1">
          {p.minPriceUgx ? (
            <>
              <span className="text-xs font-semibold text-muted">from UGX</span>
              <span className="font-display text-[21px] font-bold tabular tracking-tight">{ugx.format(p.minPriceUgx)}</span>
              <span className="text-sm text-muted">{p.cycle ? CYCLE_SHORT[p.cycle as Cycle] : ""}</span>
            </>
          ) : <span className="text-sm text-muted">Ask for price</span>}
        </p>
        {facts.length ? (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-ink-3">
            {facts.map((f) => (
              <span key={f} className="inline-flex items-center gap-1">
                {f.includes("Yaka") || f.includes("Power") ? <Zap className="size-3.5 text-muted" aria-hidden /> : f.includes("ater") ? <Droplets className="size-3.5 text-muted" aria-hidden /> : null}
                {f}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function PropertyCardSkeleton() {
  return (
    <div aria-hidden>
      <div className="skeleton aspect-[4/3] rounded-[var(--radius-card)]" />
      <div className="skeleton mt-3 h-5 w-3/4" />
      <div className="skeleton mt-2 h-4 w-1/2" />
      <div className="skeleton mt-2 h-6 w-2/5" />
    </div>
  );
}
