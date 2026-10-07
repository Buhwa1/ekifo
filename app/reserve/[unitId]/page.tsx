import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { CalendarClock, ChevronLeft, Lock, Smartphone } from "lucide-react";
import { db } from "@/db";
import { units, properties, media } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { checkSlot, formatUGX, CYCLE_LABEL, detectNetwork, isSlotCycle } from "@/lib/rules";
import { fmtWindow } from "@/lib/booking";
import { reserveAction } from "@/app/actions/seeker";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Money, buttonClass, imgSrc } from "@/components/ui";

export const metadata = { title: "Checkout" };

export default async function ReservePage({ params, searchParams }: { params: Promise<{ unitId: string }>; searchParams: Promise<{ start?: string; end?: string }> }) {
  const { unitId } = await params;
  const { start, end } = await searchParams;
  const user = await requireUser(`/reserve/${unitId}${start ? `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end ?? "")}` : ""}`);
  if (!/^[0-9a-f-]{36}$/i.test(unitId)) notFound();
  const [row] = await db.select({ u: units, p: properties }).from(units).innerJoin(properties, eq(properties.id, units.propertyId)).where(eq(units.id, unitId));
  if (!row || row.p.status !== "LIVE") notFound();
  if (row.u.status !== "VACANT") redirect(`/spaces/${row.p.id}?taken=1#units`);
  const [cover] = await db.select({ url: media.url }).from(media).where(and(eq(media.propertyId, row.p.id), eq(media.kind, "PHOTO"))).orderBy(asc(media.position)).limit(1);
  const cfg = config();
  const net = detectNetwork(user.phone) ?? "MTN";
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });

  // Time-slot booking: the window comes from the picker; re-validate and price it here.
  const slot = isSlotCycle(row.u.cycle);
  let amount = row.u.depositUgx;
  let windowText = "";
  let slotError = "";
  if (slot) {
    const s = new Date(start ?? "");
    const e = new Date(end ?? "");
    const c = checkSlot({ cycle: row.u.cycle, priceUgx: row.u.priceUgx, start: s, end: e, openFrom: row.p.openFrom, openTo: row.p.openTo, now: new Date() });
    if (c.ok) { amount = c.amountUgx; windowText = fmtWindow(s, e); } else slotError = c.reason;
  }

  if (slot && slotError)
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <CalendarClock className="mx-auto size-10 text-sky-ink" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Pick a time first</h1>
        <p className="mt-2 text-muted">{slotError}</p>
        <Link href={`/spaces/${row.p.id}#units`} className={buttonClass("primary", "lg", "mt-6")}>Choose a time</Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/spaces/${row.p.id}#units`} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden /> Back to {row.p.name}</Link>
      <h1 className="text-[32px] font-bold">{slot ? `Book ${row.u.label}` : `Reserve ${row.u.label}`}</h1>

      <div className="mt-5 overflow-hidden rounded-[var(--radius-card)] bg-white ring-1 ring-line">
        <div className="flex gap-3 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc(cover?.url, 200)} alt="" className="size-16 shrink-0 rounded-[12px] object-cover" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{row.p.name}</p>
            <p className="text-sm text-muted">{row.u.label}, {row.p.suburb}</p>
            {slot ? (
              <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-sky-ink"><CalendarClock className="size-3.5" aria-hidden /> {windowText}</p>
            ) : (
              <p className="text-sm text-muted">Rent {formatUGX(row.u.priceUgx)} {CYCLE_LABEL[row.u.cycle]}</p>
            )}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3 border-t border-dashed border-line-strong bg-surface/60 px-4 py-4">
          <div>
            <p className="font-semibold">{slot ? "Total to pay" : "Pay now to hold it"}</p>
            <p className="text-[13px] text-muted">{slot ? `${formatUGX(row.u.priceUgx)} ${CYCLE_LABEL[row.u.cycle]}` : "Counts towards your first rent"}</p>
          </div>
          <Money amount={amount} size="lg" />
        </div>
      </div>

      <ActionForm action={reserveAction.bind(null, row.u.id)} className="mt-6 space-y-5">
        {slot ? <><input type="hidden" name="start" value={start} /><input type="hidden" name="end" value={end} /></> : null}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Pay with</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["MTN", "AIRTEL"] as const).map((n) => (
              <label key={n} className="relative flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] bg-white p-3.5 font-semibold ring-1 ring-inset ring-line-strong has-[:checked]:ring-2 has-[:checked]:ring-navy has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">
                <input type="radio" name="network" value={n} defaultChecked={net === n} className="sr-only" />
                <span className={n === "MTN" ? "grid size-8 place-items-center rounded-full bg-yellow-400 text-[11px] font-black text-ink" : "grid size-8 place-items-center rounded-full bg-red-600 text-[11px] font-black text-white"}>
                  {n === "MTN" ? "MTN" : "A"}
                </span>
                {n === "MTN" ? "MoMo" : "Airtel Money"}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Mobile Money number" hint="A PIN prompt will pop up on this phone.">
          <Input name="msisdn" type="tel" inputMode="tel" autoComplete="tel" defaultValue={user.phone.replace("+256", "0")} required />
        </Field>
        {!slot ? (
          <Field label="When do you plan to move in?" hint="Optional. Helps the landlord prepare.">
            <Input type="date" name="moveIn" min={tomorrow} />
          </Field>
        ) : null}

        <div className="rounded-[var(--radius-card)] bg-brand-soft p-4 text-sm text-brand-ink">
          <p className="flex items-center gap-2 font-semibold"><Lock className="size-4" aria-hidden /> Your money is protected</p>
          <ul className="mt-2 space-y-1.5 pl-6 [&>li]:list-disc">
            {slot ? (
              <>
                <li>Your time is locked in as soon as you approve the payment. No one else can book it.</li>
                <li>FindEkifo pays the venue only after your booking has happened.</li>
                <li>Cancel up to {cfg.FREE_CANCEL_HOURS} hours before and get it all back.</li>
              </>
            ) : (
              <>
                <li>{row.u.label} is held for you for {cfg.HOLD_DURATION_HOURS} hours.</li>
                <li>FindEkifo keeps the deposit until you tap “I've moved in”.</li>
                <li>Change your mind within {cfg.FREE_CANCEL_HOURS} hours and you get it all back.</li>
              </>
            )}
          </ul>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="terms" required className="mt-0.5 size-5 shrink-0 accent-[var(--color-navy)]" />
          <span>{slot ? "I agree to the booking and cancellation terms above." : "I agree to the deposit terms above. A tenancy agreement is created when I confirm move-in."}</span>
        </label>

        <div className="pb-safe sticky bottom-0 -mx-4 bg-surface/95 px-4 pt-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0">
          <SubmitButton size="lg" className="w-full" pendingText="Sending PIN prompt…">
            <Smartphone className="size-5" aria-hidden /> Pay {formatUGX(amount)}
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
