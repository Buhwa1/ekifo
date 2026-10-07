import Link from "next/link";
import { Search, Store, Plus } from "lucide-react";
import { z } from "zod";
import { directory, directoryMalls, BUSINESS_CATEGORIES } from "@/lib/businesses";
import { currentUser } from "@/lib/auth";
import { BusinessCard } from "@/components/business-card";
import { ButtonLink, Empty, cx, inputClass, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business hub", description: "Find shops, salons and services inside malls and arcades — with the exact room number." };

const params = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.enum(BUSINESS_CATEGORIES).optional(),
  mall: z.string().uuid().optional(),
});

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  const parsed = params.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v)));
  const sp = parsed.success ? parsed.data : {};
  const [rows, malls, user] = await Promise.all([
    directory({ q: sp.q, category: sp.category, propertyId: sp.mall }),
    directoryMalls(),
    currentUser(),
  ]);
  const link = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]).toString();
    return qs ? `/directory?${qs}` : "/directory";
  };
  const mall = malls.find((m) => m.id === sp.mall);
  const usedCategories = BUSINESS_CATEGORIES.filter((c) => c !== "Other");

  return (
    <div>
      <section className="relative left-1/2 -mt-6 mb-8 w-screen -translate-x-1/2 overflow-hidden bg-accent">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-[360px] rounded-full bg-white/30 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-8 sm:px-6 md:pb-12 md:pt-12">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-ink"><Store className="size-4" aria-hidden /> Business hub</p>
          <h1 className="display-tight mt-2 max-w-[18ch] text-[40px] font-extrabold leading-[1] text-ink sm:text-[56px]">Every shop in the mall, and which room it's in.</h1>
          <form action="/directory" className="mt-6 flex max-w-xl gap-2" role="search">
            {sp.mall ? <input type="hidden" name="mall" value={sp.mall} /> : null}
            <label className="relative flex-1">
              <span className="sr-only">Search shops</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
              <input name="q" defaultValue={sp.q} placeholder="Shop name, “phone repair”, “A2”…" className={cx(inputClass, "h-12 pl-10 text-base ring-0")} />
            </label>
            <button className={buttonClass("ink", "lg", "h-12")}>Search</button>
          </form>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-6">
          <div>
            <p className="mb-2 text-sm font-bold">Mall or arcade</p>
            <ul className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-1 lg:px-0">
              <li className="shrink-0"><FilterLink href={link({ mall: undefined })} active={!sp.mall}>All buildings</FilterLink></li>
              {malls.map((m) => (
                <li key={m.id} className="shrink-0"><FilterLink href={link({ mall: m.id })} active={sp.mall === m.id}>{m.name} <span className="text-muted tabular">{m.n}</span></FilterLink></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold">What they sell</p>
            <ul className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-1 lg:px-0">
              <li className="shrink-0"><FilterLink href={link({ category: undefined })} active={!sp.category}>Everything</FilterLink></li>
              {usedCategories.map((c) => <li key={c} className="shrink-0"><FilterLink href={link({ category: c })} active={sp.category === c}>{c}</FilterLink></li>)}
            </ul>
          </div>
          <div className="hidden rounded-[var(--radius-card)] bg-navy p-5 text-white lg:block">
            <p className="font-display text-lg font-bold">Run a shop in a mall?</p>
            <p className="mt-1 text-sm text-white/75">Add it free, with your room number, photos and social links.</p>
            <ButtonLink href={user ? "/directory/new" : "/login?next=/directory/new"} size="sm" className="mt-4">Add your business</ButtonLink>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[22px] font-bold">
              <span className="tabular">{rows.length}</span> {rows.length === 1 ? "business" : "businesses"}{mall ? ` in ${mall.name}` : ""}{sp.category ? `, ${sp.category.toLowerCase()}` : ""}
            </h2>
            <ButtonLink href={user ? "/directory/new" : "/login?next=/directory/new"} variant="outline" size="sm" className="lg:hidden"><Plus className="size-4" aria-hidden /> Add your business</ButtonLink>
          </div>
          {rows.length ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3">
              {rows.map(({ b, mallName }) => <BusinessCard key={b.id} b={b} mallName={mallName} />)}
            </div>
          ) : (
            <Empty icon={<Store className="size-5" />} title={sp.q || sp.category || sp.mall ? "No shops match that" : "No shops listed yet"}
              action={<Link href="/directory" className={buttonClass("outline", "md")}>See all shops</Link>}>
              Shop owners add themselves here. If you run one, add it in a minute.
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined}
      className={cx("flex items-center justify-between gap-2 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-sm font-medium ring-1 ring-inset lg:ring-0",
        active ? "bg-navy text-white ring-navy" : "bg-white ring-line hover:bg-surface lg:bg-transparent")}>
      {children}
    </Link>
  );
}
