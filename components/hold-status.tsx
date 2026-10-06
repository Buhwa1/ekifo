"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { buttonClass } from "./ui";

type Status = "PENDING_PAYMENT" | "HELD" | "CONFIRMED" | "REFUNDED" | "EXPIRED" | "CANCELLED";

export function HoldStatus(p: { holdId: string; initial: Status; amount: string; msisdn: string; place: string; propertyId: string; deadline: string }) {
  const [status, setStatus] = useState<Status>(p.initial);
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((new Date(p.deadline).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    if (status !== "PENDING_PAYMENT") return;
    let delay = 3000;
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/holds/${p.holdId}/status`, { cache: "no-store" });
        if (r.ok) {
          const { status: s } = (await r.json()) as { status: Status };
          if (!alive) return;
          setStatus(s);
          if (s !== "PENDING_PAYMENT") return;
        }
      } catch {} // offline blip — keep trying
      delay = Math.min(delay * 1.3, 10_000);
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => { alive = false; clearTimeout(timer); clearInterval(tick); };
  }, [status, p.holdId]);

  if (status === "PENDING_PAYMENT")
    return (
      <div>
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-accent-soft"><Smartphone className="size-9 text-accent" /></div>
        <h1 className="mt-5 text-2xl font-extrabold">Approve on your phone</h1>
        <p className="mt-2 text-muted">Enter your Mobile Money PIN on <b className="text-navy">{p.msisdn}</b> to pay <b className="text-navy">{p.amount}</b> for {p.place}.</p>
        <p className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-muted"><Loader2 className="size-4 animate-spin" /> Waiting for confirmation{left ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""}</p>
        <p className="mt-6 text-xs text-muted">No prompt? Dial *165# (MTN) or *185# (Airtel) and check pending approvals.</p>
      </div>
    );

  if (status === "HELD" || status === "CONFIRMED")
    return (
      <div>
        <CheckCircle2 className="mx-auto size-20 text-brand" />
        <h1 className="mt-5 text-2xl font-extrabold">It's reserved for you</h1>
        <p className="mt-2 text-muted">{p.place}. Your {p.amount} is held in escrow. When you get the keys, tap “I've moved in” so the landlord is paid.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/me" className={buttonClass("primary")}>My reservations</Link>
          <Link href={`/spaces/${p.propertyId}`} className={buttonClass("outline")}>View space</Link>
        </div>
      </div>
    );

  return (
    <div>
      <XCircle className="mx-auto size-20 text-danger" />
      <h1 className="mt-5 text-2xl font-extrabold">{status === "REFUNDED" ? "Refunded" : "Payment didn't go through"}</h1>
      <p className="mt-2 text-muted">{status === "REFUNDED" ? `${p.amount} is on its way back to ${p.msisdn}.` : "No money was taken. You can try again — the space may still be free."}</p>
      <Link href={`/spaces/${p.propertyId}`} className={buttonClass("primary", "md", "mt-6")}>Back to the space</Link>
    </div>
  );
}
