import Link from "next/link";
import { Star, Zap, Droplets, Sparkles } from "lucide-react";
import { formatUGX, CYCLE_SHORT, CATEGORY_LABEL, type Cycle, type Category } from "@/lib/rules";
import { Badge, imgSrc } from "./ui";

export interface CardData {
  id: string;
  name: string;
  category: Category;
  suburb: string;
  district: string;
  minPriceUgx: number | null;
  vacantCount: number;
  ratingAvg: number;
  ratingCount: number;
  yaka: string;
  water: string;
  featured: boolean | null;
  cover: string | null;
  cycle: string | null;
}

export function PropertyCard({ p, priority }: { p: CardData; priority?: boolean }) {
  return (
    <Link href={`/spaces/${p.id}`} className="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc(p.cover, 640)}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          {p.featured ? <Badge tone="navy"><Sparkles className="size-3" /> Featured</Badge> : null}
          {p.vacantCount > 0 ? <Badge tone="green">{p.vacantCount} vacant</Badge> : <Badge tone="slate">Fully booked</Badge>}
        </div>
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-bold text-navy">{p.name}</h3>
          {p.ratingCount > 0 ? (
            <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold"><Star className="size-3.5 fill-amber-400 text-amber-400" />{p.ratingAvg.toFixed(1)}</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted">{p.suburb}, {p.district} · {CATEGORY_LABEL[p.category].replace(/s$/, "")}</p>
        <div className="mt-2.5 flex items-end justify-between">
          <p className="tabular">
            {p.minPriceUgx ? (
              <>
                <span className="text-xs text-muted">from </span>
                <span className="text-lg font-extrabold text-navy">{formatUGX(p.minPriceUgx)}</span>
                <span className="text-sm text-muted">{p.cycle ? CYCLE_SHORT[p.cycle as Cycle] : ""}</span>
              </>
            ) : <span className="text-sm text-muted">Price on request</span>}
          </p>
          <span className="flex gap-1.5 text-muted">
            {p.yaka === "PRIVATE" ? <Zap className="size-4" aria-label="Private Yaka meter" /> : null}
            {p.water !== "NONE" ? <Droplets className="size-4" aria-label="Water on site" /> : null}
          </span>
        </div>
      </div>
    </Link>
  );
}
