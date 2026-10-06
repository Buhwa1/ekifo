import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { holds, units, properties, payments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatUGX } from "@/lib/rules";
import { HoldStatus } from "@/components/hold-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment" };

export default async function HoldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/holds/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await db.select({ h: holds, u: units, p: properties }).from(holds)
    .innerJoin(units, eq(units.id, holds.unitId)).innerJoin(properties, eq(properties.id, units.propertyId)).where(eq(holds.id, id));
  if (!row || (row.h.seekerId !== user.id && user.role !== "ADMIN")) notFound();
  const [pay] = await db.select().from(payments).where(eq(payments.holdId, id)).limit(1);

  return (
    <div className="mx-auto max-w-md py-6 text-center">
      <HoldStatus
        holdId={id}
        initial={row.h.status}
        amount={formatUGX(row.h.amountUgx)}
        msisdn={pay?.msisdn ?? ""}
        place={`${row.u.label} · ${row.p.name}`}
        propertyId={row.p.id}
        deadline={row.h.paymentDeadline.toISOString()}
      />
    </div>
  );
}
