import Link from "next/link";
import { Suspense } from "react";
import { Search, X, MapPinned, BadgeCheck, LockKeyhole, Ban, Store, ChevronRight } from "lucide-react";
import { parseSearch, searchProperties, popularSuburbs, vacancyBoard, totals, PAGE_SIZE, FILTER_KEYS, type SearchParams } from "@/lib/search";
import { CYCLE_LABEL, GROUP_LABEL, type Cycle, type Group } from "@/lib/rules";
import { typesByGroup, typeMap } from "@/lib/types";
import { directory } from "@/lib/businesses";
import { PropertyCard } from "@/components/property-card";
import { VacancyBoard } from "@/components/vacancy-board";
import { FilterSheet } from "@/components/filter-sheet";
import { SortSelect } from "@/components/sort-select";
import { TypeIcon } from "@/components/type-icon";
import { BusinessCard } from "@/components/business-card";
import { Empty, GROUP_STYLE, buttonClass, cx, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const GROUPS: Array<{ key: Group; label: string }> = [
  { key: "STAY", label: "Stay" },
  { key: "BUSINESS", label: "Business" },
  { key: "LEISURE", label: "Leisure & events" },
];

function href(base: SearchParams, patch: Partial<Record<keyof SearchParams, string | number | undefined>>, hash = "#results") {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...base, page: undefined, ...patch })) {
    if (v === undefined || v === "" || (k === "sort" && v === "featured") || (k === "page" && v === 1)) continue;
    merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return (qs ? `/?${qs}` : "/") + hash;
}

const k = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`);

/** Human labels for each active filter, so they can be shown and removed one by one. */
function activeChips(sp: SearchParams): Array<{ key: keyof SearchParams | "price"; label: string }> {
  const chips: Array<{ key: keyof SearchParams | "price"; label: string }> = [];
  if (sp.q) chips.push({ key: "q", label: `“${sp.q}”` });
  if (sp.suburb) chips.push({ key: "suburb", label: sp.suburb });
  if (sp.min != null || sp.max != null)
    chips.push({ key: "price", label: sp.min != null && sp.max != null ? `${k(sp.min)}–${k(sp.max)}` : sp.max != null ? `Under ${k(sp.max)}` : `${k(sp.min!)}+` });
  if (sp.cycle) chips.push({ key: "cycle", label: CYCLE_LABEL[sp.cycle as Cycle].replace(/^per /, "Per ") });
  if (sp.yaka) chips.push({ key: "yaka", label: { PRIVATE: "Own Yaka", SHARED: "Shared Yaka", INCLUSIVE: "Power included" }[sp.yaka] });
  if (sp.water) chips.push({ key: "water", label: { NWSC: "NWSC water", GRAVITY_TANK: "Gravity tank", BOTH: "NWSC + tank" }[sp.water] });
  if (sp.security) chips.push({ key: "security", label: sp.security });
  if (sp.vacant) chips.push({ key: "vacant", label: "Free now" });
  return chips;
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = parseSearch(await searchParams);
  const types = await typeMap();
  const selectedType = sp.type ? types.get(sp.type) : undefined;
  const group: Group | undefined = selectedType?.group ?? sp.group;
  const filtered = FILTER_KEYS.some((key) => key !== "group" && key !== "type" && sp[key] != null);
  const showHero = !filtered && sp.page === 1;

  const [{ rows, total }, suburbs, board, sums, grouped, shops] = await Promise.all([
    searchProperties(sp),
    popularSuburbs(),
    showHero ? vacancyBoard(group) : Promise.resolve([]),
    showHero ? totals() : Promise.resolve({ vacant: 0, places: 0, areas: 0 }),
    typesByGroup(),
    showHero && (!group || group === "BUSINESS") ? directory({ limit: 4 }) : Promise.resolve([]),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const chips = activeChips(sp);
  const filterCount = chips.filter((c) => c.key !== "q").length;
  const noun = selectedType ? selectedType.plural.toLowerCase() : group ? GROUP_LABEL[group].toLowerCase() : "places";
  const nounOne = selectedType ? selectedType.name.toLowerCase() : "place";

  const searchForm = (dark: boolean) => (
    <form action="/" className="flex gap-2" role="search">
      {sp.type ? <input type="hidden" name="type" value={sp.type} /> : sp.group ? <input type="hidden" name="group" value={sp.group} /> : null}
      {sp.suburb ? <input type="hidden" name="suburb" value={sp.suburb} /> : null}
      <label className="relative flex-1">
        <span className="sr-only">Search by area or name</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" defaultValue={sp.q} placeholder="Area, campus, venue or building" enterKeyHint="search" autoComplete="off"
          className={cx(inputClass, "h-12 pl-10 text-base", dark && "ring-0")} />
      </label>
      <button className={buttonClass("primary", "lg", "h-12 px-5")}>Search</button>
    </form>
  );

  const groupTabs = (dark: boolean) => (
    <div className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="What are you looking for?">
      {[{ key: undefined, label: "Everything" } as { key?: Group; label: string }, ...GROUPS].map((g) => {
        const active = group === g.key;
        const style = g.key ? GROUP_STYLE[g.key] : null;
        return (
          <Link key={g.label} role="tab" aria-selected={active} href={href(sp, { group: g.key, type: undefined }, dark ? "" : "#results")} scroll={!dark}
            className={cx("inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              dark
                ? active ? (style ? style.solid : "bg-white text-ink") : "text-white/80 ring-1 ring-inset ring-white/20 hover:bg-white/10 hover:text-white"
                : active ? (style ? style.solid : "bg-navy text-white") : "bg-white text-ink ring-1 ring-inset ring-line-strong hover:bg-surface")}>
            {style && !active ? <span className={cx("size-2 rounded-full", style.dot)} aria-hidden /> : null}
            {g.label}
          </Link>
        );
      })}
    </div>
  );

  const typeChips = group ? (
    <div className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Type">
      {grouped[group].map((t) => {
        const active = sp.type === t.slug;
        return (
          <Link key={t.slug} href={href(sp, { type: active ? undefined : t.slug, group })} aria-current={active ? "true" : undefined}
            className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors",
              active ? cx(GROUP_STYLE[group].chip, "ring-transparent font-semibold") : "bg-white ring-line hover:ring-line-strong")}>
            <TypeIcon name={t.icon} className="size-4" />
            {t.plural}
          </Link>
        );
      })}
    </div>
  ) : null;

  return (
    <div>
      {showHero ? (
        <section className="relative left-1/2 -mt-6 mb-8 w-screen -translate-x-1/2 overflow-hidden bg-navy text-white">
          {/* Two soft colour fields behind the hero — green and amber pushing against the navy. */}
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-32 size-[420px] rounded-full bg-brand/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-40 right-[-80px] size-[440px] rounded-full bg-accent/20 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-4 pb-9 pt-8 sm:px-6 md:grid-cols-[1.05fr_1fr] md:gap-10 md:pb-16 md:pt-14">
            <div className="min-w-0 md:pt-2">
              <h1 className="display-tight max-w-[14ch] text-[44px] font-extrabold leading-[0.98] sm:text-[64px]">
                Rooms, shops and places to play. Free today.
              </h1>
              <p className="mt-5 max-w-md text-[16px] text-white/75">
                Rent a room or a stall, or book a turf, pool or rooftop by the hour. Landlords are ID-checked, viewing is free, and your Mobile Money is held until you get what you paid for.
              </p>
              <div className="mt-7">{searchForm(true)}</div>
              <div className="mt-4">{groupTabs(true)}</div>
            </div>
            <VacancyBoard rows={board} group={group} totalVacant={sums.vacant} />
          </div>
        </section>
      ) : (
        <div className="mb-5 space-y-3">
          {searchForm(false)}
          {groupTabs(false)}
        </div>
      )}

      <section id="results" className="scroll-mt-20" aria-labelledby="results-heading">
        {typeChips ? <div className="mb-5">{typeChips}</div> : null}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-heading" className="text-[24px] font-bold">
            {total ? <><span className="tabular">{total}</span> {total === 1 ? nounOne : noun}</> : `No ${noun}`}
            {sp.suburb ? ` in ${sp.suburb}` : ""}
          </h2>
          <div className="flex items-center gap-2">
            <Suspense><SortSelect value={sp.sort} /></Suspense>
            <FilterSheet suburbs={suburbs} activeCount={filterCount} leisure={group === "LEISURE"} values={Object.fromEntries(Object.entries(sp).map(([kk, v]) => [kk, v == null ? undefined : String(v)]))} />
          </div>
        </div>

        {chips.length ? (
          <div className="scroll-row -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {chips.map((c) => (
              <Link key={c.key} href={c.key === "price" ? href(sp, { min: undefined, max: undefined }) : href(sp, { [c.key]: undefined })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy py-1.5 pl-3 pr-2 text-sm font-semibold text-white hover:bg-navy-2"
                aria-label={`Remove filter ${c.label}`}>
                {c.label} <X className="size-3.5" aria-hidden />
              </Link>
            ))}
            {chips.length > 1 ? <Link href={href({ ...searchParamsDefaults(), group: sp.group, type: sp.type }, {})} className="shrink-0 px-2 py-1.5 text-sm font-semibold text-muted hover:text-ink">Clear all</Link> : null}
          </div>
        ) : null}

        {rows.length ? (
          <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p, i) => <PropertyCard key={p.id} p={p} priority={i < 2} />)}
          </div>
        ) : (
          <Empty icon={<MapPinned className="size-5" />} title={filtered ? "Nothing matches all of those" : "No listings here yet"}
            action={filtered ? <Link href={href({ ...searchParamsDefaults(), group: sp.group, type: sp.type }, {})} className={buttonClass("outline", "md")}>Clear filters</Link> : null}>
            {filtered ? "Try removing a filter, a nearby area, or a wider budget." : "Owners are adding spaces every week. Check back soon."}
          </Empty>
        )}

        {pages > 1 ? (
          <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Pages">
            {sp.page > 1 ? <Link rel="prev" className={buttonClass("outline", "md")} href={href(sp, { page: sp.page - 1 })}>Previous</Link> : null}
            <span className="text-sm text-muted tabular">Page {sp.page} of {pages}</span>
            {sp.page < pages ? <Link rel="next" className={buttonClass("outline", "md")} href={href(sp, { page: sp.page + 1 })}>Next page</Link> : null}
          </nav>
        ) : null}
      </section>

      {shops.length ? (
        <section className="mt-16 rounded-[24px] bg-accent-soft p-5 sm:p-8" aria-labelledby="hub-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink"><Store className="size-4" aria-hidden /> Business hub</p>
              <h2 id="hub-heading" className="mt-1 text-[26px] font-bold">Shops inside the malls</h2>
              <p className="mt-1 max-w-lg text-sm text-ink-3">Find a boutique, phone shop or salon by name, and see exactly which room it's in before you go.</p>
            </div>
            <Link href="/directory" className={buttonClass("ink", "md")}>Open the directory <ChevronRight className="size-4" aria-hidden /></Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {shops.map(({ b, mallName }) => <BusinessCard key={b.id} b={b} mallName={mallName} compact />)}
          </div>
        </section>
      ) : null}

      {showHero ? (
        <section className="mt-16 grid gap-8 border-t border-line pt-10 sm:grid-cols-3" aria-label="How FindEkifo protects you">
          {[
            { icon: BadgeCheck, title: "Real owners only", body: "We check every landlord's National ID and proof they own or manage the place before a listing goes live.", c: "bg-brand-soft text-brand-ink" },
            { icon: Ban, title: "No viewing fees", body: "Book a visit for free. If anyone asks you for money to see a room, report the listing and we'll act on it.", c: "bg-accent-soft text-accent-ink" },
            { icon: LockKeyhole, title: "Money held safely", body: "Pay with MTN or Airtel Money. The owner is paid only after you've moved in or your booking has happened.", c: "bg-sky-soft text-sky-ink" },
          ].map(({ icon: Icon, title, body, c }) => (
            <div key={title}>
              <span className={cx("grid size-11 place-items-center rounded-[12px]", c)}><Icon className="size-5" aria-hidden /></span>
              <h3 className="mt-3 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function searchParamsDefaults(): SearchParams {
  return { sort: "featured", page: 1 } as SearchParams;
}
