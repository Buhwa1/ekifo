import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { landlordVerifications, properties, payouts, flags } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { TabBar } from "@/components/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["ADMIN"], "/admin");
  const [[kyc], [listings], [pay], [fl]] = await Promise.all([
    db.select({ n: count() }).from(landlordVerifications).where(eq(landlordVerifications.status, "PENDING")),
    db.select({ n: count() }).from(properties).where(eq(properties.status, "PENDING_REVIEW")),
    db.select({ n: count() }).from(payouts).where(inArray(payouts.status, ["REQUESTED", "APPROVED"])),
    db.select({ n: count() }).from(flags).where(eq(flags.status, "OPEN")),
  ]);
  return (
    <div>
      <TabBar
        tabs={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/verification", label: "Verification", count: kyc.n + listings.n },
          { href: "/admin/finance", label: "Money", count: pay.n },
          { href: "/admin/flags", label: "Flags & audit", count: fl.n },
          { href: "/admin/clients", label: "Clients" },
          { href: "/admin/types", label: "Property types" },
        ]}
      />
      {children}
    </div>
  );
}
