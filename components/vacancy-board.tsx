import Link from "next/link";
import type { BoardRow } from "@/lib/search";
import { CYCLE_SHORT, type Cycle } from "@/lib/rules";
import { cx } from "./ui";

const ugx = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/**
 * The signature element: a live board of free spaces per area, like the vacancy notices pinned
 * at a hostel gate. Every row is a real query result and a shortcut into that area's listings.
 */
export function VacancyBoard({ rows, group, totalVacant }: { rows: BoardRow[]; group?: string; totalVacant: number }) {
  const max = Math.max(1, ...rows.map((r) => r.vacant));
  return (
    <div className="min-w-0 rounded-[22px] bg-white/[0.06] p-1.5 ring-1 ring-white/15">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-glow opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-brand-glow" />
          </span>
          Free right now
        </p>
        <p className="text-xs text-white/50 tabular">{ugx.format(totalVacant)} spaces</p>
      </div>
      {rows.length ? (
        <ol className="overflow-hidden rounded-[15px] bg-navy-deep">
          {rows.map((r, i) => (
            <li key={r.suburb} className={cx(i > 0 && "border-t border-white/[0.07]", i >= 5 && "max-sm:hidden")}>
              <Link
                href={`/?suburb=${encodeURIComponent(r.suburb)}${group ? `&group=${group}` : ""}&vacant=1#results`}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-4 px-3.5 py-3 transition-colors hover:bg-white/[0.04] sm:grid-cols-[1fr_5.5rem_7.5rem]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-[20px] font-bold leading-tight text-white group-hover:text-brand-glow">{r.suburb}</span>
                  <span className="mt-1 block h-1 w-full max-w-40 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
                    <span className="block h-full rounded-full bg-gradient-to-r from-brand to-accent" style={{ width: `${Math.max(6, (r.vacant / max) * 100)}%` }} />
                  </span>
                </span>
                <span className="text-right">
                  <span className={cx("font-display text-[28px] font-extrabold leading-none tabular", r.vacant ? "text-brand-glow" : "text-white/30")}>{r.vacant}</span>
                  <span className="ml-1 text-xs text-white/50">free</span>
                </span>
                <span className="col-span-2 mt-0.5 text-[13px] text-white/55 sm:col-span-1 sm:mt-0 sm:text-right">
                  {r.fromUgx ? (
                    <>from <span className="font-semibold text-accent tabular">{short(r.fromUgx)}</span>{r.fromCycle ? CYCLE_SHORT[r.fromCycle as Cycle] : ""}</>
                  ) : (
                    "full for now"
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-[15px] bg-navy-deep px-4 py-8 text-center text-sm text-white/60">Nothing listed in this group yet.</p>
      )}
    </div>
  );
}
