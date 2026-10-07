"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Smartphone, X } from "lucide-react";
import { buttonClass, cx } from "./ui";

type Status = "PENDING_PAYMENT" | "HELD" | "CONFIRMED" | "REFUNDED" | "EXPIRED" | "CANCELLED";

/**
 * "Approve on your phone" → "Reserved". Polls with backoff, pauses while the tab is hidden
 * (the seeker is usually in their USSD/MoMo prompt), and checks again the moment they come back.
 */
export function HoldStatus(p: { holdId: string; initial: Status; amount: string; msisdn: string; place: string; propertyId: string; deadline: string; window?: string }) {
  const [status, setStatus] = useState<Status>(p.initial);
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((new Date(p.deadline).getTime() - Date.now()) / 1000)));
  const delay = useRef(2500);

  useEffect(() => {
    if (status !== "PENDING_PAYMENT") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;

    const poll = async () => {
      if (document.hidden) return; // resumed by visibilitychange
      try {
        const r = await fetch(`/api/holds/${p.holdId}/status`, { cache: "no-store" });
        if (r.ok) {
          const { status: s } = (await r.json()) as { status: Status };
          if (!alive) return;
          if (s !== "PENDING_PAYMENT") {
            setStatus(s);
            if (s === "HELD" && "vibrate" in navigator) navigator.vibrate?.(60);
            return;
          }
        }
      } catch {} // offline blip — keep trying
      delay.current = Math.min(delay.current * 1.25, 8000);
      timer = setTimeout(poll, delay.current);
    };
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        delay.current = 2500;
        poll();
      }
    };
    timer = setTimeout(poll, delay.current);
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, p.holdId]);

  const steps = [
    { label: "PIN prompt sent", done: true },
    { label: "You approve it", done: status !== "PENDING_PAYMENT" && status !== "EXPIRED" && status !== "CANCELLED" },
    { label: p.window ? "Time booked" : "Unit reserved", done: status === "HELD" || status === "CONFIRMED" },
  ];
  const failed = status === "EXPIRED" || status === "CANCELLED" || status === "REFUNDED";

  return (
    <div className="mx-auto max-w-sm text-center">
      <div className={cx("mx-auto grid size-20 place-items-center rounded-full",
        failed ? "bg-red-50 text-danger" : status === "PENDING_PAYMENT" ? "bg-accent-soft text-accent" : "bg-brand-soft text-brand")}>
        {failed ? <X className="size-9" /> : status === "PENDING_PAYMENT" ? <Smartphone className="size-9" /> : <Check className="size-10" strokeWidth={2.5} />}
      </div>

      <h1 className="mt-5 text-[28px] font-bold" aria-live="polite">
        {status === "PENDING_PAYMENT" ? "Check your phone" : failed ? (status === "REFUNDED" ? "Refunded" : "Payment didn't go through") : p.window ? "You're booked" : "It's yours for now"}
      </h1>
      <p className="mt-2 text-muted">
        {status === "PENDING_PAYMENT" ? (
          <>Enter your Mobile Money PIN on <b className="text-ink">{p.msisdn}</b> to pay <b className="text-ink">{p.amount}</b> for {p.place}{p.window ? `, ${p.window}` : ""}.</>
        ) : failed ? (
          status === "REFUNDED" ? `${p.amount} is on its way back to ${p.msisdn}.` : "No money was taken. The unit may still be free — you can try again."
        ) : (
          p.window
            ? <>{p.place}, <b className="text-ink">{p.window}</b>. We've sent the details by SMS. Your {p.amount} goes to the venue only after your booking.</>
            : <>{p.place} is held for you. Your {p.amount} stays with FindEkifo until you tap “I've moved in”.</>
        )}
      </p>

      {!failed ? (
        <ol className="mx-auto mt-7 max-w-xs space-y-3 text-left">
          {steps.map((s, i) => {
            const current = !s.done && (i === 0 || steps[i - 1].done);
            return (
              <li key={s.label} className="flex items-center gap-3">
                <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                  s.done ? "bg-brand text-ink" : current ? "bg-accent-soft text-accent ring-2 ring-accent/30" : "bg-slate-100 text-muted")}>
                  {s.done ? <Check className="size-4" strokeWidth={3} /> : current ? <Loader2 className="size-4 animate-spin" /> : i + 1}
                </span>
                <span className={cx("text-sm font-semibold", !s.done && !current && "text-muted")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {status === "PENDING_PAYMENT" ? (
        <div className="mt-8 rounded-[var(--radius-card)] bg-white p-4 text-left text-sm ring-1 ring-line">
          <p className="font-semibold">No prompt yet?</p>
          <p className="mt-1 text-muted">Dial <b className="text-ink">*165#</b> (MTN) or <b className="text-ink">*185#</b> (Airtel) and look under pending approvals.{left ? <> The request expires in <span className="font-semibold text-ink tabular">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>.</> : null}</p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {failed ? (
            <Link href={`/spaces/${p.propertyId}#units`} className={buttonClass("primary", "lg")}>Try again</Link>
          ) : (
            <Link href="/me" className={buttonClass("primary", "lg")}>Go to my bookings</Link>
          )}
          <Link href={`/spaces/${p.propertyId}`} className={buttonClass("outline", "lg")}>View the place</Link>
        </div>
      )}
    </div>
  );
}
