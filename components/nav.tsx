"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, KeyRound, LayoutGrid, PlusSquare, ShieldCheck, Store } from "lucide-react";
import { cx } from "./ui";

type NavUser = { role: "SEEKER" | "LANDLORD" | "ADMIN"; name: string | null; landlordStatus: string } | null;

function items(user: NavUser) {
  const isOwner = user && (user.role === "LANDLORD" || user.role === "ADMIN");
  return [
    { href: "/", label: "Explore", icon: Compass, match: (p: string) => p === "/" || p.startsWith("/spaces") },
    { href: "/directory", label: "Shops", icon: Store, match: (p: string) => p.startsWith("/directory") },
    { href: user ? "/me" : "/login?next=/me", label: "Bookings", icon: KeyRound, match: (p: string) => p === "/me" || p.startsWith("/holds") || p.startsWith("/reserve") },
    isOwner
      ? { href: "/owner", label: "My spaces", icon: LayoutGrid, match: (p: string) => p.startsWith("/owner") }
      : { href: user ? "/owner/verify" : "/login?next=/owner/verify", label: "List space", icon: PlusSquare, match: (p: string) => p.startsWith("/owner") },
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin", icon: ShieldCheck, match: (p: string) => p.startsWith("/admin") }] : []),
  ];
}

/** App-style tab bar on phones — thumbs reach the bottom of the screen, not the top. */
export function BottomNav({ user }: { user: NavUser }) {
  const path = usePathname();
  // Screens with their own bottom action bar (or a single focused task) hide the tab bar.
  if (["/login", "/reserve", "/holds", "/spaces", "/owner/listings/new", "/directory/new"].some((p) => path.startsWith(p))) return null;
  const list = items(user);
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md">
        {list.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={label} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={cx("flex flex-col items-center gap-0.5 pb-1 pt-1.5 text-[11px] font-semibold", active ? "text-navy" : "text-muted")}>
                <span className={cx("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-brand")}>
                  <Icon className="size-[20px]" strokeWidth={active ? 2.3 : 1.8} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopNav({ user }: { user: NavUser }) {
  const path = usePathname();
  const list = items(user);
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {list.map(({ href, label, match }) => (
        <Link key={label} href={href} className={cx("rounded-full px-3.5 py-1.5 text-sm font-semibold", match(path) ? "bg-brand text-ink" : "text-white/75 hover:bg-white/10 hover:text-white")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Underlined tab strip for dashboards (owner / admin). */
export function TabBar({ tabs }: { tabs: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="scroll-row -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const active = t.href === path || (t.href !== tabs[0].href && path.startsWith(t.href));
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
            className={cx("-mb-px flex shrink-0 items-center gap-1.5 border-b-[3px] px-3 pb-2.5 pt-1 text-sm font-semibold", active ? "border-navy text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
            {t.count ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-ink tabular">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
