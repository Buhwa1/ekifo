"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setUnitStatusAction } from "@/app/actions/owner";
import { toast } from "./toaster";
import { cx } from "./ui";

const OPTIONS = [
  ["VACANT", "Vacant", "bg-brand"],
  ["OCCUPIED", "Occupied", "bg-danger"],
  ["MAINTENANCE", "Under maintenance", "bg-accent"],
  ["UNDER_CONSTRUCTION", "Under construction", "bg-sky"],
  ["UNLISTED", "Hidden", "bg-slate-400"],
] as const;
type S = (typeof OPTIONS)[number][0];

/** One control for all owner-settable statuses; saves as soon as it changes. */
export function UnitStatusSelect({ unitId, status, label }: { unitId: string; status: S; label: string }) {
  const [value, setValue] = useState<S>(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dot = OPTIONS.find(([v]) => v === value)?.[2];
  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Status of {label}</span>
        <span className={cx("pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full", dot)} aria-hidden />
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as S;
            const prev = value;
            setValue(next);
            setError(null);
            start(async () => {
              const r = await setUnitStatusAction(unitId, next);
              if (r.ok) toast(`${label}: ${OPTIONS.find(([v]) => v === next)?.[1].toLowerCase()}`);
              else { setValue(prev); setError(r.error); }
            });
          }}
          className="h-10 w-full appearance-none rounded-[10px] bg-surface pl-8 pr-9 text-sm font-semibold ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy disabled:opacity-60"
        >
          {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {pending ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden /> : null}
      </label>
      {error ? <p role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
