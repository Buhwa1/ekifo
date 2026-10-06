"use client";

import { useActionState, useEffect, useState } from "react";
import { sendCodeAction, verifyCodeAction } from "@/app/actions/auth";
import type { ActionResult } from "@/lib/errors";
import { FormMessage, SubmitButton } from "./action-form";
import { Field, Input } from "./ui";

export function PhoneLogin({ next }: { next: string }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const [sendState, send] = useActionState(async (_: ActionResult<{ phone: string }> | null, fd: FormData) => {
    const r = await sendCodeAction(fd);
    if (r.ok && r.data) {
      setPhone(r.data.phone);
      setCooldown(45);
    }
    return r;
  }, null);
  const [verifyState, verify] = useActionState(async (_: ActionResult | null, fd: FormData) => verifyCodeAction(fd), null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!phone)
    return (
      <form action={send} className="mt-6 space-y-4">
        <Field label="Mobile number" hint="MTN or Airtel, e.g. 0772 123 456">
          <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="07XX XXX XXX" autoFocus />
        </Field>
        <FormMessage state={sendState} />
        <SubmitButton className="w-full" pendingText="Sending code…">Send code</SubmitButton>
      </form>
    );

  return (
    <div className="mt-6 space-y-4">
      <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-emerald-800">Code sent to <b>{phone}</b>.</p>
      <form action={verify} className="space-y-4">
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="next" value={next} />
        <Field label="6-digit code">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className="text-center text-2xl font-bold tracking-[0.5em]" />
        </Field>
        <Field label="Your name" hint="Shown to landlords when you book. Skip if you've signed in before.">
          <Input name="name" autoComplete="name" maxLength={60} />
        </Field>
        <FormMessage state={verifyState} />
        <SubmitButton className="w-full" pendingText="Checking…">Continue</SubmitButton>
      </form>
      <form action={send} className="flex items-center justify-between text-sm">
        <input type="hidden" name="phone" value={phone} />
        <button type="button" onClick={() => setPhone(null)} className="font-semibold text-muted hover:text-navy">Change number</button>
        <button disabled={cooldown > 0} className="font-semibold text-brand disabled:text-muted">{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button>
      </form>
    </div>
  );
}
