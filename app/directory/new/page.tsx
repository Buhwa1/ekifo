import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { BUSINESS_CATEGORIES, hostBuildings } from "@/lib/businesses";
import { BusinessForm } from "@/components/business-form";

export const metadata = { title: "Add your business" };

export default async function NewBusiness({ searchParams }: { searchParams: Promise<{ edit?: string; mall?: string }> }) {
  const { edit, mall } = await searchParams;
  const user = await requireUser(`/directory/new${edit ? `?edit=${edit}` : ""}`);
  const buildings = await hostBuildings();

  let existing: typeof businesses.$inferSelect | undefined;
  if (edit) {
    if (!/^[0-9a-f-]{36}$/i.test(edit)) notFound();
    [existing] = await db.select().from(businesses).where(eq(businesses.id, edit));
    if (!existing || (existing.ownerId !== user.id && user.role !== "ADMIN")) notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[30px] font-bold sm:text-[36px]">{existing ? `Edit ${existing.name}` : "Add your business"}</h1>
      <p className="mt-1 max-w-xl text-muted">
        {existing ? "Changes show up straight away." : "Your shop appears in the Business hub with its room number, photos and contacts. It's free. If you don't rent through FindEkifo, the mall's management approves it first."}
      </p>
      <div className="mt-6">
        <BusinessForm
          buildings={buildings}
          categories={[...BUSINESS_CATEGORIES]}
          defaultMall={mall}
          existing={existing ? {
            id: existing.id, propertyId: existing.propertyId, unitLabel: existing.unitLabel, name: existing.name,
            category: existing.category as (typeof BUSINESS_CATEGORIES)[number], description: existing.description,
            phone: existing.phone ?? "", whatsapp: existing.whatsapp ?? "", instagram: existing.instagram ?? "", facebook: existing.facebook ?? "",
            tiktok: existing.tiktok ?? "", website: existing.website ?? "", hours: existing.hours ?? "", photos: existing.photos,
          } : undefined}
        />
      </div>
    </div>
  );
}
