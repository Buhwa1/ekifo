import { notFound, redirect } from "next/navigation";
import { asc, eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { properties, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { activeTypes } from "@/lib/types";
import { ListingWizard } from "@/components/listing-wizard";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Add a space" };

export default async function NewListing({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const { for: forId } = await searchParams;
  const user = await requireUser("/owner/listings/new");

  // Admins can list on behalf of an onboarded client.
  let owner = user;
  if (forId) {
    if (user.role !== "ADMIN" || !/^[0-9a-f-]{36}$/i.test(forId)) notFound();
    const [client] = await db.select().from(users).where(eq(users.id, forId));
    if (!client) notFound();
    owner = client;
  } else if (user.landlordStatus === "NONE" || user.landlordStatus === "REJECTED") {
    if (user.role !== "ADMIN") redirect("/owner/verify");
  }

  const [types, parents] = await Promise.all([
    activeTypes(),
    db.select({ id: properties.id, name: properties.name, type: properties.type, district: properties.district, suburb: properties.suburb, address: properties.address, lat: properties.lat, lng: properties.lng })
      .from(properties).where(and(eq(properties.ownerId, owner.id), isNull(properties.parentId))).orderBy(asc(properties.name)),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a space" subtitle="Three quick steps. Your draft saves on this device as you go." />
      <ListingWizard
        types={types.map((t) => ({ slug: t.slug, name: t.name, group: t.group, bookingMode: t.bookingMode, cycles: t.cycles, canBeChild: t.canBeChild, canHaveChildren: t.canHaveChildren, unitNoun: t.unitNoun, icon: t.icon, description: t.description }))}
        parents={parents}
        forUser={forId ? { id: owner.id, name: owner.name ?? owner.phone } : undefined}
      />
    </div>
  );
}
