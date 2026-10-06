import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ListingWizard } from "@/components/listing-wizard";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Add a space" };

export default async function NewListing() {
  const user = await requireUser("/owner/listings/new");
  if (user.landlordStatus === "NONE" || user.landlordStatus === "REJECTED") redirect("/owner/verify");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a space" subtitle="Three quick steps. Your draft saves on this device as you go." />
      <ListingWizard />
    </div>
  );
}
