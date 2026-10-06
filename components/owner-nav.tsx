"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const TABS = [
  { href: "/owner", label: "Overview" },
  { href: "/owner/units", label: "Units" },
  { href: "/owner/leads", label: "Lead inbox" },
  { href: "/owner/tenancies", label: "Tenancies" },
  { href: "/owner/payouts", label: "Payouts" },
];

export function OwnerNav() {
  const path = usePathname();
  return <TabBar tabs={TABS} path={path} />;
}

export function TabBar({ tabs, path }: { tabs: { href: string; label: string }[]; path: string }) {
  return (
    <nav className="scroll-row -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const active = t.href === path || (t.href !== tabs[0].href && path.startsWith(t.href));
        return (
          <Link key={t.href} href={t.href} className={cx("shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold", active ? "border-brand text-navy" : "border-transparent text-muted hover:text-navy")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
