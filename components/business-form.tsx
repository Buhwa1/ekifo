"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X } from "lucide-react";
import type { BusinessInput } from "@/lib/businesses";
import { saveBusinessAction } from "@/app/actions/business";
import { uploadFile } from "./uploader";
import { toast } from "./toaster";
import { Button, Field, Input, Select, Textarea, cx } from "./ui";

type Existing = BusinessInput & { id: string };

export function BusinessForm({ buildings, categories, existing, defaultMall }: {
  buildings: Array<{ id: string; name: string; suburb: string }>;
  categories: string[];
  existing?: Existing;
  defaultMall?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<BusinessInput>(existing ?? {
    propertyId: defaultMall && buildings.some((b) => b.id === defaultMall) ? defaultMall : "",
    unitLabel: "", name: "", category: "Fashion & clothing", description: "",
    phone: "", whatsapp: "", instagram: "", facebook: "", tiktok: "", website: "", hours: "", photos: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof BusinessInput>(k: K, val: BusinessInput[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveBusinessAction(v, existing?.id);
      if (!r.ok) {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      toast(existing ? "Saved" : r.published ? "Your business is live in the directory" : "Sent to the mall for approval. We'll text you when it's live.");
      router.push(`/directory/${r.slug}`);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      <fieldset className="space-y-4 rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line">
        <legend className="sr-only">Where you are</legend>
        <p className="font-display text-lg font-bold">Where customers find you</p>
        <Field label="Mall or arcade" error={errors.propertyId}>
          <Select value={v.propertyId} onChange={(e) => set("propertyId", e.target.value)} disabled={Boolean(existing)} required>
            <option value="" disabled>Choose your building</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}, {b.suburb}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <Field label="Room or shop no." error={errors.unitLabel} hint="As on your door"><Input value={v.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} placeholder="Room A2" required /></Field>
          <Field label="Opening hours" hint="Optional"><Input value={v.hours} onChange={(e) => set("hours", e.target.value)} placeholder="Mon–Sat 9am–8pm" /></Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line">
        <legend className="sr-only">About the business</legend>
        <p className="font-display text-lg font-bold">Your business</p>
        <Field label="Business name" error={errors.name}><Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Chloe's Boutique" required maxLength={60} /></Field>
        <Field label="What you sell"><Select value={v.category} onChange={(e) => set("category", e.target.value as BusinessInput["category"])}>{categories.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Short description" hint="One or two lines. What makes people come back?" error={errors.description}>
          <Textarea value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={400} placeholder="Ladies' fashion, shoes and bags. New stock every Friday." />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Shop front photos <span className="font-normal text-muted">(1 or 2)</span></p>
          <div className="flex gap-3">
            {v.photos.map((p) => (
              <div key={p} className="relative size-32 overflow-hidden rounded-[12px] ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="size-full object-cover" />
                <button type="button" onClick={() => set("photos", v.photos.filter((x) => x !== p))} className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-white" aria-label="Remove photo"><X className="size-3.5" /></button>
              </div>
            ))}
            {v.photos.length < 2 ? (
              <label className={cx("grid size-32 cursor-pointer place-items-center rounded-[12px] border-2 border-dashed border-line-strong bg-surface text-sm font-semibold text-muted hover:border-accent hover:text-accent-ink", uploading && "pointer-events-none")}>
                <span className="flex flex-col items-center gap-1">{uploading ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}{uploading ? "Uploading" : "Add photo"}</span>
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  setUploading(true);
                  try { const r = await uploadFile(f, "listings"); set("photos", [...v.photos, r.url].slice(0, 2)); }
                  catch (err) { setError((err as Error).message); }
                  finally { setUploading(false); }
                }} />
              </label>
            ) : null}
          </div>
          {errors.photos ? <p className="mt-1.5 text-xs font-medium text-danger">{errors.photos}</p> : null}
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-[var(--radius-card)] bg-white p-5 ring-1 ring-line">
        <legend className="sr-only">Contacts</legend>
        <div>
          <p className="font-display text-lg font-bold">How customers reach you</p>
          <p className="text-sm text-muted">Add at least one. Paste a link or just the handle — we'll tidy it up.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="WhatsApp"><Input type="tel" inputMode="tel" value={v.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="0772 123 456" /></Field>
          <Field label="Phone"><Input type="tel" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0772 123 456" /></Field>
          <Field label="Instagram"><Input value={v.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@chloesboutique" autoCapitalize="none" /></Field>
          <Field label="TikTok"><Input value={v.tiktok} onChange={(e) => set("tiktok", e.target.value)} placeholder="@chloesboutique" autoCapitalize="none" /></Field>
          <Field label="Facebook page"><Input value={v.facebook} onChange={(e) => set("facebook", e.target.value)} placeholder="facebook.com/chloesboutique" autoCapitalize="none" /></Field>
          <Field label="Website"><Input value={v.website} onChange={(e) => set("website", e.target.value)} placeholder="chloes.ug" autoCapitalize="none" /></Field>
        </div>
      </fieldset>

      {error ? <p role="alert" className="rounded-[var(--radius-control)] bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}
      <div className="pb-safe sticky bottom-0 -mx-4 bg-surface/95 px-4 pt-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0">
        <Button type="submit" variant="amber" size="lg" className="w-full sm:w-auto" disabled={pending || uploading}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}{existing ? "Save changes" : "Add to the directory"}
        </Button>
      </div>
    </form>
  );
}
