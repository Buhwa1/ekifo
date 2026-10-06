"use client";

import { usePathname } from "next/navigation";
import { TabBar } from "./owner-nav";

export function AdminNav() {
  return (
    <TabBar
      path={usePathname()}
      tabs={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/verification", label: "Verification center" },
        { href: "/admin/finance", label: "Financial ledger" },
        { href: "/admin/flags", label: "Audit & flags" },
      ]}
    />
  );
}
