"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { ActionForm, SubmitButton } from "./action-form";
import { Field, Input, buttonClass, cx, type BtnVariant, type BtnSize } from "./ui";

const SLOTS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];

function kampalaDays(n: number) {
  const out: Array<{ value: string; top: string; bottom: string }> = [];
  const nowK = new Date(Date.now() + 3 * 3600_000); // Kampala is UTC+3 all year
  // Start tomorrow if it's already past 4pm in Kampala (no slot can be an hour away).
  const start = nowK.getUTCHours() >= 16 ? 1 : 0;
  for (let d = start; d < start + n; d++) {
    const day = new Date(nowK.getTime() + d * 86_400_000);
    const value = day.toISOString().slice(0, 10);
    const top = d === 0 ? "Today" : d === 1 ? "Tomorrow" : day.toLocaleDateString("en-UG", { weekday: "short", timeZone: "UTC" });
    const bottom = day.toLocaleDateString("en-UG", { day: "numeric", month: "short", timeZone: "UTC" });
    out.push({ value, top, bottom });
  }
  return out;
}

/** "Book a free visit" — day and time chips instead of fiddly native date/time pickers. */
export function VisitSheet({ action, unitLabel, propertyName, variant = "outline", size = "md", className }: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  unitLabel: string; propertyName: string; variant?: BtnVariant; size?: BtnSize; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const days = useMemo(() => kampalaDays(7), []);
  const [day, setDay] = useState(days[0]?.value);
  // Slots must be at least an hour away (same rule the server enforces).
  const nowK = new Date(Date.now() + 3 * 3600_000);
  const todayK = nowK.toISOString().slice(0, 10);
  const tooSoon = (t: string) => day === todayK && Number(t.slice(0, 2)) * 60 <= nowK.getUTCHours() * 60 + nowK.getUTCMinutes() + 60;
  const firstOk = SLOTS.find((t) => !tooSoon(t));

  const wrapped = async (fd: FormData) => {
    const r = await action(fd);
    if (r.ok) ref.current?.close();
    return r;
  };

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={buttonClass(variant, size, className)} aria-haspopup="dialog">
        <CalendarClock className="size-4" /> Book a free visit
      </button>
      <dialog ref={ref} className="sheet" aria-label={`Book a visit to ${unitLabel}`} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <ActionForm action={wrapped} className="flex max-h-[88dvh] flex-col" resetOnSuccess>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="font-display text-xl font-semibold">Book a free visit</p>
              <p className="text-sm text-muted">{unitLabel}, {propertyName}</p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} className="rounded-full p-1.5 text-muted hover:bg-surface" aria-label="Close"><X className="size-5" /></button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-5 py-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Day</legend>
              <div className="scroll-row flex gap-2 overflow-x-auto pb-1">
                {days.map((d, i) => (
                  <label key={d.value} className="relative shrink-0 cursor-pointer">
                    <input type="radio" name="date" value={d.value} defaultChecked={i === 0} required className="peer sr-only" onChange={() => setDay(d.value)} />
                    <span className="flex w-[72px] flex-col items-center rounded-[var(--radius-control)] py-2 ring-1 ring-inset ring-line-strong peer-checked:bg-navy peer-checked:text-white peer-checked:ring-navy peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand">
                      <span className="text-xs font-semibold opacity-70">{d.top}</span>
                      <span className="font-display text-[15px] font-bold">{d.bottom}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Time</legend>
              <div className="grid grid-cols-4 gap-2">
                {SLOTS.map((t) => (
                  <label key={`${day}-${t}`} className={cx("relative cursor-pointer", tooSoon(t) && "pointer-events-none opacity-35")}>
                    <input type="radio" name="time" value={t} defaultChecked={t === firstOk} disabled={tooSoon(t)} required className="peer sr-only" />
                    <span className={cx("block rounded-[var(--radius-control)] py-2 text-center text-sm font-semibold tabular ring-1 ring-inset ring-line-strong",
                      "peer-checked:bg-navy peer-checked:text-white peer-checked:ring-navy peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand")}>
                      {Number(t.slice(0, 2)) > 12 ? `${Number(t.slice(0, 2)) - 12}pm` : `${Number(t.slice(0, 2))}${Number(t.slice(0, 2)) === 12 ? "pm" : "am"}`}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="Message for the landlord" hint="Optional">
              <Input name="note" maxLength={200} placeholder="e.g. I'll come with my parent" />
            </Field>
            <p className="rounded-[var(--radius-control)] bg-brand-soft px-3.5 py-2.5 text-sm text-brand-ink">Visits are always free. The landlord gets an SMS and confirms the time with you.</p>
          </div>

          <div className="pb-safe border-t border-line px-5 pt-3">
            <SubmitButton size="lg" variant="navy" className="w-full" pendingText="Sending request…">Request visit</SubmitButton>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}
