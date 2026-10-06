import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ShieldCheck, Smartphone, ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { units, properties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { formatUGX, CYCLE_LABEL, detectNetwork, commissionFor } from "@/lib/rules";
import { reserveAction } from "@/app/actions/seeker";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";

export const metadata = { title: "Reserve" };

export default async function ReservePage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const user = await requireUser(`/reserve/${unitId}`);
  if (!/^[0-9a-f-]{36}$/i.test(unitId)) notFound();
  const [row] = await db.select({ u: units, p: properties }).from(units).innerJoin(properties, eq(properties.id, units.propertyId)).where(eq(units.id, unitId));
  if (!row || row.p.status !== "LIVE") notFound();
  if (row.u.status !== "VACANT") redirect(`/spaces/${row.p.id}?taken=1`);
  const cfg = config();
  const net = detectNetwork(user.phone);
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/spaces/${row.p.id}`} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-navy"><ArrowLeft className="size-4" /> Back to {row.p.name}</Link>
      <h1 className="text-2xl font-extrabold tracking-tight">Reserve {row.u.label}</h1>
      <p className="text-muted">{row.p.name}, {row.p.suburb}</p>

      <Card className="mt-5 divide-y divide-line">
        <Line k="Rent" v={`${formatUGX(row.u.priceUgx)} ${CYCLE_LABEL[row.u.cycle]}`} />
        <Line k="Commitment deposit (pay now)" v={formatUGX(row.u.depositUgx)} strong />
        <Line k="Counts towards" v="Your first rent payment" />
        <p className="px-4 py-3 text-xs text-muted">Platform fee of {cfg.COMMISSION_BPS / 100}% ({formatUGX(commissionFor(row.u.depositUgx, cfg.COMMISSION_BPS))}) is deducted from the landlord's side — you pay exactly {formatUGX(row.u.depositUgx)}.</p>
      </Card>

      <ActionForm action={reserveAction.bind(null, row.u.id)} className="mt-5 space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Pay with</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["MTN", "AIRTEL"] as const).map((n) => (
              <label key={n} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white p-3 font-semibold has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20">
                <input type="radio" name="network" value={n} defaultChecked={(net ?? "MTN") === n} className="accent-[var(--color-brand)]" />
                <span className={n === "MTN" ? "text-yellow-600" : "text-red-600"}>●</span> {n === "MTN" ? "MTN MoMo" : "Airtel Money"}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Mobile Money number" hint="You'll get a PIN prompt on this phone.">
          <Input name="msisdn" type="tel" inputMode="tel" defaultValue={user.phone.replace("+256", "0")} required />
        </Field>
        <Field label="Planned move-in date (optional)">
          <Input type="date" name="moveIn" min={tomorrow} />
        </Field>

        <div className="rounded-xl bg-brand-soft p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-bold"><ShieldCheck className="size-4" /> How escrow protects you</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The unit is held for you for {cfg.HOLD_DURATION_HOURS} hours after payment.</li>
            <li>FindEkifo keeps your deposit until you tap “I've moved in”.</li>
            <li>Cancel within {cfg.FREE_CANCEL_HOURS} hours for a full refund, or open a dispute if the space isn't as listed.</li>
          </ul>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--color-brand)]" />
          I agree to the escrow terms and that a tenancy agreement is generated when I confirm move-in.
        </label>
        <SubmitButton size="lg" className="w-full" pendingText="Sending PIN prompt…"><Smartphone className="size-5" /> Pay {formatUGX(row.u.depositUgx)}</SubmitButton>
      </ActionForm>
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="text-muted">{k}</span>
      <span className={strong ? "tabular text-lg font-extrabold" : "tabular font-semibold"}>{v}</span>
    </div>
  );
}
