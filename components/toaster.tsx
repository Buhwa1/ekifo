"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

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
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <p key={t.id} className="pointer-events-auto flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-xl">
          <CheckCircle2 className="size-4 text-emerald-400" /> {t.text}
        </p>
      ))}
    </div>
  );
}
