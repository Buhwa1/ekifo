"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Field, Select, buttonClass, cx, inputClass } from "./ui";

type Values = Record<string, string | undefined>;

const PRICE_PRESETS: Array<{ label: string; min?: number; max?: number }> = [
  { label: "Under 300k", max: 300_000 },
  { label: "300k – 700k", min: 300_000, max: 700_000 },
  { label: "700k – 1.5M", min: 700_000, max: 1_500_000 },
  { label: "1.5M +", min: 1_500_000 },
];

/**
 * "Filters" button + bottom sheet. It's a plain GET form, so results are shareable URLs and it
 * still works if JavaScript fails to load (the sheet just won't open — the sort control stays usable).
 */
export function FilterSheet({ values, suburbs, activeCount, leisure }: { values: Values; suburbs: string[]; activeCount: number; leisure?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const setPrice = (min?: number, max?: number) => {
    const f = formRef.current!;
    (f.elements.namedItem("min") as HTMLInputElement).value = min ? String(min) : "";
    (f.elements.namedItem("max") as HTMLInputElement).value = max ? String(max) : "";
  };

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={buttonClass("outline", "md", "shrink-0")} aria-haspopup="dialog">
        <SlidersHorizontal className="size-4" />
        Filters
        {activeCount ? <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-ink tabular">{activeCount}</span> : null}
      </button>

      <dialog ref={ref} className="sheet" aria-label="Filters" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <form
          ref={formRef}
          action="/"
          className="flex max-h-[88dvh] flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const qs = new URLSearchParams();
            for (const [k, v] of fd.entries()) if (typeof v === "string" && v.trim() && !(k === "sort" && v === "featured")) qs.set(k, v.trim());
            ref.current?.close();
            router.push(qs.size ? `/?${qs}#results` : "/#results");
          }}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <p className="font-display text-xl font-semibold">Filters</p>
            <button type="button" onClick={() => ref.current?.close()} className="rounded-full p-1.5 text-muted hover:bg-surface" aria-label="Close filters"><X className="size-5" /></button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-5 py-5">
            {values.q ? <input type="hidden" name="q" value={values.q} /> : null}
            {values.group ? <input type="hidden" name="group" value={values.group} /> : null}
            {values.type ? <input type="hidden" name="type" value={values.type} /> : null}

            <Field label="Area">
              <Select name="suburb" defaultValue={values.suburb ?? ""}>
                <option value="">Anywhere</option>
                {suburbs.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">Budget (UGX)</legend>
              <div className="mb-2 flex flex-wrap gap-2">
                {PRICE_PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => setPrice(p.min, p.max)} className="rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-line-strong hover:bg-surface">{p.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="min" type="number" inputMode="numeric" min={0} step={10000} defaultValue={values.min} placeholder="Min" aria-label="Minimum price" className={inputClass} />
                <input name="max" type="number" inputMode="numeric" min={0} step={10000} defaultValue={values.max} placeholder="Max" aria-label="Maximum price" className={inputClass} />
              </div>
            </fieldset>

            <Chips name="cycle" label="Paid" value={values.cycle} options={leisure
              ? [["PER_HOUR", "Per hour"], ["PER_EVENT_SLOT", "Per event slot"]]
              : [["PER_SEMESTER", "Per semester"], ["PER_MONTH", "Per month"], ["PER_DAY", "Per day"], ["PER_HOUR", "Per hour"], ["PER_EVENT_SLOT", "Per event"]]} />
            {leisure ? null : <>
            <Chips name="yaka" label="Electricity" value={values.yaka} options={[["PRIVATE", "Own Yaka meter"], ["SHARED", "Shared Yaka"], ["INCLUSIVE", "Included in rent"]]} />
            <Chips name="water" label="Water" value={values.water} options={[["NWSC", "NWSC"], ["GRAVITY_TANK", "Gravity tank"], ["BOTH", "NWSC + tank"]]} />
            <Chips name="security" label="Security" value={values.security} options={[["Askari", "Askari"], ["CCTV", "CCTV"], ["Gated", "Gated"], ["Perimeter wall", "Perimeter wall"]]} />
            </>}

            <label className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-surface px-4 py-3 text-sm font-semibold">
              {leisure ? "Only places taking bookings" : "Only places with a free unit"}
              <input type="checkbox" name="vacant" value="1" defaultChecked={values.vacant === "1"} className="size-5 accent-[var(--color-brand)]" />
            </label>
            <input type="hidden" name="sort" value={values.sort ?? "featured"} />
          </div>

          <div className="pb-safe flex gap-2 border-t border-line px-5 pt-3">
            <button type="button" className={buttonClass("ghost", "lg", "flex-1")}
              onClick={() => { ref.current?.close(); router.push(values.type ? `/?type=${values.type}#results` : values.group ? `/?group=${values.group}#results` : "/#results"); }}>
              Clear all
            </button>
            <button className={buttonClass("navy", "lg", "flex-[2]")}>Show results</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function Chips({ name, label, value, options }: { name: string; label: string; value?: string; options: Array<[string, string]> }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <ChipRadio name={name} value="" label="Any" checked={!value} />
        {options.map(([v, l]) => <ChipRadio key={v} name={name} value={v} label={l} checked={value === v} />)}
      </div>
    </fieldset>
  );
}

function ChipRadio({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className={cx("relative cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ring-line-strong transition-colors",
      "has-[:checked]:bg-navy has-[:checked]:text-white has-[:checked]:ring-navy has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand")}>
      <input type="radio" name={name} value={value} defaultChecked={checked} className="sr-only" />
      {label}
    </label>
  );
}
