"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Minus, Plus, X } from "lucide-react";
import { EVENT_SLOTS, fmtHour, kampalaAt, MAX_BOOKING_HOURS, type Cycle } from "@/lib/rules";
import { buttonClass, cx, type BtnSize, type BtnVariant } from "./ui";

type SlotUnit = { id: string; label: string; priceUgx: number; cycle: Cycle };
type Booked = { unitId: string; start: string; end: string };

const ugx = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
const DAYS = 14;

function days() {
  const out: Array<{ value: string; top: string; bottom: string }> = [];
  const nowK = new Date(Date.now() + 3 * 3_600_000);
  for (let d = 0; d < DAYS; d++) {
    const day = new Date(nowK.getTime() + d * 86_400_000);
    out.push({
      value: day.toISOString().slice(0, 10),
      top: d === 0 ? "Today" : d === 1 ? "Tomorrow" : day.toLocaleDateString("en-UG", { weekday: "short", timeZone: "UTC" }),
      bottom: day.toLocaleDateString("en-UG", { day: "numeric", month: "short", timeZone: "UTC" }),
    });
  }
  return out;
}

/**
 * Pick a space, a day and a time, see the total, continue to pay. Availability comes from the
 * server (booked windows for the next two weeks); the server re-checks everything when paying.
 */
export function SlotPicker({ units, booked, openFrom, openTo, venue, noun, initialUnit, variant = "primary", size = "md", className, label = "Book a time" }: {
  units: SlotUnit[]; booked: Booked[]; openFrom: number; openTo: number; venue: string; noun: string;
  initialUnit?: string; variant?: BtnVariant; size?: BtnSize; className?: string; label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const dayList = useMemo(days, []);
  const [unitId, setUnitId] = useState(initialUnit ?? units[0]?.id);
  const [day, setDay] = useState(dayList[0].value);
  const [startH, setStartH] = useState<number | null>(null);
  const [hours, setHours] = useState(2);
  const [slotKey, setSlotKey] = useState<string | null>(null);
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  if (!unit) return null;
  const hourly = unit.cycle === "PER_HOUR";

  const now = Date.now();
  const taken = booked.filter((b) => b.unitId === unit.id).map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
  const free = (s: number, e: number) => s >= now + 30 * 60_000 && !taken.some(([bs, be]) => bs < e && be > s);
  const at = (h: number) => kampalaAt(day, h).getTime();

  const hoursList = Array.from({ length: openTo - openFrom }, (_, i) => openFrom + i);
  const maxLen = startH == null ? 0 : (() => {
    let n = 0;
    while (n < MAX_BOOKING_HOURS && startH + n < openTo && free(at(startH + n), at(startH + n + 1))) n++;
    return n;
  })();
  const len = Math.min(hours, Math.max(1, maxLen));
  const slots = EVENT_SLOTS.filter((s) => s.from >= openFrom && s.to <= openTo);
  const slot = slots.find((s) => s.key === slotKey);

  const pick = hourly
    ? startH != null && maxLen > 0 ? { s: at(startH), e: at(startH + len), total: unit.priceUgx * len, text: `${fmtHour(startH)}–${fmtHour(startH + len)}` } : null
    : slot && free(at(slot.from), at(slot.to)) ? { s: at(slot.from), e: at(slot.to), total: unit.priceUgx, text: `${slot.label}, ${fmtHour(slot.from)}–${fmtHour(slot.to)}` } : null;
  const dayLabel = dayList.find((d) => d.value === day);

  const reset = () => { setStartH(null); setSlotKey(null); };

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={buttonClass(variant, size, className)} aria-haspopup="dialog">
        <CalendarClock className="size-4" aria-hidden /> {label}
      </button>
      <dialog ref={ref} className="sheet" aria-label={`Book ${venue}`} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="font-display text-xl font-bold">Pick a time</p>
              <p className="text-sm text-muted">{venue}. Open {fmtHour(openFrom)} to {fmtHour(openTo)}.</p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} className="rounded-full p-1.5 text-muted hover:bg-surface" aria-label="Close"><X className="size-5" /></button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-5 py-5">
            {units.length > 1 ? (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">{noun}</legend>
                <div className="flex flex-wrap gap-2">
                  {units.map((u) => (
                    <button key={u.id} type="button" onClick={() => { setUnitId(u.id); reset(); }} aria-pressed={u.id === unit.id}
                      className={cx("rounded-[var(--radius-control)] px-3.5 py-2 text-left text-sm ring-1 ring-inset", u.id === unit.id ? "bg-navy text-white ring-navy" : "ring-line-strong hover:bg-surface")}>
                      <span className="block font-semibold">{u.label}</span>
                      <span className={cx("text-xs", u.id === unit.id ? "text-white/70" : "text-muted")}>UGX {ugx.format(u.priceUgx)}{u.cycle === "PER_HOUR" ? "/hr" : "/slot"}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Day</legend>
              <div className="scroll-row flex gap-2 overflow-x-auto pb-1">
                {dayList.map((d) => (
                  <button key={d.value} type="button" onClick={() => { setDay(d.value); reset(); }} aria-pressed={d.value === day}
                    className={cx("flex w-[72px] shrink-0 flex-col items-center rounded-[var(--radius-control)] py-2 ring-1 ring-inset", d.value === day ? "bg-navy text-white ring-navy" : "ring-line-strong hover:bg-surface")}>
                    <span className="text-xs font-semibold opacity-75">{d.top}</span>
                    <span className="font-display text-[15px] font-bold">{d.bottom}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {hourly ? (
              <>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Start time</legend>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {hoursList.map((h) => {
                      const ok = free(at(h), at(h + 1));
                      return (
                        <button key={h} type="button" disabled={!ok} onClick={() => setStartH(h)} aria-pressed={startH === h}
                          className={cx("rounded-[10px] py-2 text-sm font-semibold tabular ring-1 ring-inset",
                            startH === h ? "bg-navy text-white ring-navy" : ok ? "ring-line-strong hover:bg-surface" : "bg-surface text-muted/50 line-through ring-line")}>
                          {fmtHour(h)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                {startH != null ? (
                  <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-surface px-4 py-3">
                    <span className="text-sm font-semibold">How long?</span>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setHours(Math.max(1, len - 1))} disabled={len <= 1} className="grid size-9 place-items-center rounded-full bg-white ring-1 ring-line disabled:opacity-40" aria-label="Fewer hours"><Minus className="size-4" /></button>
                      <span className="w-16 text-center font-display text-lg font-bold tabular">{len} hr{len === 1 ? "" : "s"}</span>
                      <button type="button" onClick={() => setHours(Math.min(maxLen, len + 1))} disabled={len >= maxLen} className="grid size-9 place-items-center rounded-full bg-white ring-1 ring-line disabled:opacity-40" aria-label="More hours"><Plus className="size-4" /></button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Event slot</legend>
                <div className="grid gap-2">
                  {slots.map((s) => {
                    const ok = free(at(s.from), at(s.to));
                    return (
                      <button key={s.key} type="button" disabled={!ok} onClick={() => setSlotKey(s.key)} aria-pressed={slotKey === s.key}
                        className={cx("flex items-center justify-between rounded-[var(--radius-control)] px-4 py-3 text-left ring-1 ring-inset",
                          slotKey === s.key ? "bg-navy text-white ring-navy" : ok ? "ring-line-strong hover:bg-surface" : "bg-surface text-muted ring-line")}>
                        <span><span className="block font-semibold">{s.label}</span><span className="text-sm opacity-75">{fmtHour(s.from)} to {fmtHour(s.to)}</span></span>
                        <span className="text-sm font-semibold">{ok ? `UGX ${ugx.format(unit.priceUgx)}` : "Booked"}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>

          <div className="pb-safe flex items-center justify-between gap-3 border-t border-line px-5 pt-3">
            <div className="min-w-0 leading-tight">
              {pick ? (
                <>
                  <p className="font-display text-xl font-bold tabular">UGX {ugx.format(pick.total)}</p>
                  <p className="truncate text-xs text-muted">{dayLabel?.top} {dayLabel?.bottom}, {pick.text}</p>
                </>
              ) : <p className="text-sm text-muted">{hourly ? "Pick a start time" : "Pick a slot"}</p>}
            </div>
            <button type="button" disabled={!pick} className={buttonClass("primary", "lg", "shrink-0")}
              onClick={() => pick && router.push(`/reserve/${unit.id}?start=${new Date(pick.s).toISOString()}&end=${new Date(pick.e).toISOString()}`)}>
              Continue
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
