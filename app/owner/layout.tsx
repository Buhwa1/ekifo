import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { visits, holds, units, properties, businesses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { TabBar } from "@/components/nav";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/owner");
  const isOwner = user.role === "LANDLORD" || user.role === "ADMIN";
  if (!isOwner) return <div>{children}</div>;

  // Badge on the Lead inbox tab: things waiting on the landlord right now.
  const [[v], [h], [b]] = await Promise.all([
    db.select({ n: count() }).from(visits).innerJoin(units, eq(units.id, visits.unitId)).innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(eq(properties.ownerId, user.id), eq(visits.status, "REQUESTED"))),
    db.select({ n: count() }).from(holds).innerJoin(units, eq(units.id, holds.unitId)).innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(eq(properties.ownerId, user.id), inArray(holds.status, ["HELD"]))),
    db.select({ n: count() }).from(businesses).innerJoin(properties, eq(properties.id, businesses.propertyId))
      .where(and(eq(properties.ownerId, user.id), eq(businesses.status, "PENDING"))),
  ]);

  return (
    <div>
      <TabBar
        tabs={[
          { href: "/owner", label: "Overview" },
          { href: "/owner/leads", label: "Lead inbox", count: v.n + h.n },
          { href: "/owner/units", label: "Units" },
          { href: "/owner/tenancies", label: "Tenancies" },
          { href: "/owner/directory", label: "Directory", count: b.n },
          { href: "/owner/payouts", label: "Payouts" },
        ]}
      />
      {children}
    </div>
  );
}
