"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

// Tiny event bus so a button that unmounts after revalidation can still confirm what happened.
type Toast = { id: number; text: string };
const listeners = new Set<(t: Toast) => void>();
let seq = 0;
export function toast(text: string) {
  const t = { id: ++seq, text };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4500);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[68px] z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex max-w-md animate-[sheet-up_200ms_ease-out] items-start gap-2.5 rounded-2xl bg-navy py-3 pl-4 pr-2 text-sm font-medium text-white shadow-2xl">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-glow" />
          <span className="flex-1">{t.text}</span>
          <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="rounded-lg p-0.5 text-white/50 hover:text-white" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
