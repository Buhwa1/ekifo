import { redirect } from "next/navigation";
import { BadgeCheck, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { submitVerificationAction } from "@/app/actions/owner";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FileField } from "@/components/uploader";
import { Card, Field, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Become a verified landlord" };

export default async function VerifyPage() {
  const user = await requireUser("/owner/verify");
  if (user.landlordStatus === "VERIFIED" || user.landlordStatus === "PENDING") redirect("/owner");

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="List your space" subtitle="Verify once, then list as many properties as you manage." />
      {user.landlordStatus === "REJECTED" ? (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Your last submission couldn't be verified. Please upload clearer documents.</p>
      ) : null}
      <Card className="mb-5 flex gap-3 p-4 text-sm">
        <BadgeCheck className="size-5 shrink-0 text-brand" />
        <p>Seekers only book with <b>Verified Landlords</b>. We check your National ID against proof that you own or manage the property — this is what keeps scammers off FindEkifo.</p>
      </Card>
      <ActionForm action={submitVerificationAction} className="space-y-5">
        <Field label="Full name (as on your National ID)"><Input name="fullName" required autoComplete="name" defaultValue={user.name ?? ""} /></Field>
        <Field label="NIN" hint="14 characters, e.g. CM90012345ABCD"><Input name="nin" required maxLength={14} className="uppercase tracking-wider" /></Field>
        <FileField name="ninPhotoUrl" label="Photo of your National ID (front)" folder="kyc" hint="Clear, all four corners visible" capture="environment" />
        <FileField name="selfieUrl" label="Selfie holding your ID" folder="kyc" hint="Face and ID both readable" capture="user" />
        <FileField name="authorityDocUrl" label="Proof of ownership or authority to let" folder="kyc" accept="image/*,application/pdf" hint="Land title, sale agreement, or letter of authority from the owner" />
        <p className="flex items-center gap-2 text-xs text-muted"><Lock className="size-3.5" /> Documents are stored privately and only seen by FindEkifo reviewers. We never store your NIN in plain text.</p>
        <SubmitButton size="lg" className="w-full" pendingText="Submitting…">Submit for verification</SubmitButton>
      </ActionForm>
    </div>
  );
}
