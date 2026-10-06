import Link from "next/link";
import { Search, SlidersHorizontal, ShieldCheck, Wallet, BadgeCheck, MapPinned } from "lucide-react";
import { parseSearch, searchProperties, popularSuburbs, PAGE_SIZE, type SearchParams } from "@/lib/search";
import { CATEGORY_LABEL, type Category } from "@/lib/rules";
import { PropertyCard } from "@/components/property-card";
import { Empty, Select, buttonClass, cx, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const CATS: Category[] = ["HOSTEL", "ARCADE", "RESIDENTIAL", "FLEXI_STAY"];

function href(base: SearchParams, patch: Partial<Record<keyof SearchParams, string | number | undefined>>) {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...base, page: undefined, ...patch })) {
    if (v === undefined || v === "" || (k === "sort" && v === "featured")) continue;
    merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/?${qs}` : "/";
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = parseSearch(await searchParams);
  const [{ rows, total }, suburbs] = await Promise.all([searchProperties(sp), popularSuburbs()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(sp.q || sp.category || sp.suburb || sp.min || sp.max || sp.cycle || sp.yaka || sp.water || sp.security || sp.vacant);

  return (
    <div>
      {!filtered && sp.page === 1 ? (
        <section className="-mx-4 -mt-6 mb-6 bg-navy px-4 pb-10 pt-8 text-white sm:-mx-6 sm:rounded-b-3xl sm:px-10">
          <p className="text-sm font-semibold text-emerald-400">Hostels · Arcade stalls · Rentals · Flexi-stays</p>
          <h1 className="mt-2 max-w-xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Find your space in Uganda.</h1>
          <p className="mt-2 max-w-lg text-white/70">Verified landlords, no viewing fees, and your Mobile Money deposit stays in escrow until you move in.</p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
            <span className="flex items-center gap-1.5"><BadgeCheck className="size-4 text-emerald-400" /> NIN-verified owners</span>
            <span className="flex items-center gap-1.5"><Wallet className="size-4 text-emerald-400" /> MTN & Airtel deposits</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-400" /> Refund if it's not as listed</span>
          </div>
        </section>
      ) : null}

      {/* Search + filters: a plain GET form, so it works without JavaScript and every result page is a shareable URL. */}
      <form action="/" className="sticky top-14 z-20 -mx-4 bg-surface/95 px-4 pb-3 pt-1 backdrop-blur sm:mx-0 sm:px-0">
        {sp.category ? <input type="hidden" name="category" value={sp.category} /> : null}
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search location or name</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={sp.q} placeholder="Kikoni, Ntinda, hostel name…" className={cx(inputClass, "pl-9")} />
          </label>
          <button className={buttonClass("primary")}>Search</button>
        </div>

        <div className="scroll-row mt-3 flex gap-2 overflow-x-auto">
          <Link href={href(sp, { category: undefined })} className={chip(!sp.category)}>All spaces</Link>
          {CATS.map((c) => (
            <Link key={c} href={href(sp, { category: c })} className={chip(sp.category === c)}>{CATEGORY_LABEL[c]}</Link>
          ))}
        </div>

        <details className="group mt-2" open={Boolean(sp.min || sp.max || sp.cycle || sp.yaka || sp.water || sp.security || sp.suburb || sp.vacant)}>
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-navy">
            <SlidersHorizontal className="size-4" /> Filters
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white p-3 sm:grid-cols-4">
            <Select name="suburb" defaultValue={sp.suburb ?? ""} aria-label="Suburb">
              <option value="">Any suburb</option>
              {[...new Set([...suburbs, ...["Kikoni", "Najjera", "Ntinda", "Entebbe", "Wandegeya", "Kansanga"]])].map((s) => <option key={s}>{s}</option>)}
            </Select>
            <Select name="cycle" defaultValue={sp.cycle ?? ""} aria-label="Payment cycle">
              <option value="">Any payment cycle</option>
              <option value="PER_SEMESTER">Per semester</option>
              <option value="PER_MONTH">Per month</option>
              <option value="PER_DAY">Per day</option>
            </Select>
            <input name="min" type="number" inputMode="numeric" min={0} step={10000} defaultValue={sp.min} placeholder="Min UGX" aria-label="Minimum price" className={inputClass} />
            <input name="max" type="number" inputMode="numeric" min={0} step={10000} defaultValue={sp.max} placeholder="Max UGX" aria-label="Maximum price" className={inputClass} />
            <Select name="yaka" defaultValue={sp.yaka ?? ""} aria-label="Electricity">
              <option value="">Any power setup</option>
              <option value="PRIVATE">Private Yaka</option>
              <option value="SHARED">Shared Yaka</option>
              <option value="INCLUSIVE">Power included</option>
            </Select>
            <Select name="water" defaultValue={sp.water ?? ""} aria-label="Water">
              <option value="">Any water setup</option>
              <option value="NWSC">NWSC</option>
              <option value="GRAVITY_TANK">Gravity tank</option>
              <option value="BOTH">NWSC + tank</option>
            </Select>
            <Select name="security" defaultValue={sp.security ?? ""} aria-label="Security">
              <option value="">Any security</option>
              <option>Askari</option>
              <option>CCTV</option>
              <option>Perimeter wall</option>
              <option>Gated</option>
            </Select>
            <Select name="sort" defaultValue={sp.sort} aria-label="Sort">
              <option value="featured">Recommended</option>
              <option value="price_asc">Lowest price</option>
              <option value="price_desc">Highest price</option>
              <option value="rating">Top rated</option>
              <option value="newest">Newest</option>
            </Select>
            <label className="col-span-2 flex items-center gap-2 text-sm font-medium sm:col-span-3">
              <input type="checkbox" name="vacant" value="1" defaultChecked={Boolean(sp.vacant)} className="size-4 accent-[var(--color-brand)]" />
              Only show places with vacancies
            </label>
            <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">
              <Link href={sp.category ? `/?category=${sp.category}` : "/"} className={buttonClass("ghost", "sm")}>Clear</Link>
              <button className={buttonClass("navy", "sm")}>Apply</button>
            </div>
          </div>
        </details>
      </form>

      <div className="mb-3 mt-2 flex items-baseline justify-between">
        <h2 className="font-bold">{total ? `${total} space${total === 1 ? "" : "s"}` : "No spaces"}{sp.category ? ` · ${CATEGORY_LABEL[sp.category]}` : ""}{sp.suburb ? ` in ${sp.suburb}` : ""}</h2>
      </div>

      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p, i) => <PropertyCard key={p.id} p={p} priority={i < 3} />)}
        </div>
      ) : (
        <Empty icon={<MapPinned className="size-6" />} title="Nothing matches those filters yet">
          Try a nearby suburb or widen the price range. <Link href="/" className="font-semibold text-brand">Reset search</Link>
        </Empty>
      )}

      {pages > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          {sp.page > 1 ? <Link className={buttonClass("outline", "sm")} href={href(sp, { page: sp.page - 1 })}>Previous</Link> : null}
          <span className="px-2 text-sm text-muted">Page {sp.page} of {pages}</span>
          {sp.page < pages ? <Link className={buttonClass("outline", "sm")} href={href(sp, { page: sp.page + 1 })}>Next</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}

const chip = (active: boolean) =>
  cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition", active ? "bg-navy text-white ring-navy" : "bg-white text-navy ring-line hover:ring-slate-300");
