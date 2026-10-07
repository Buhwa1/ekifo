"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendCodeAction, verifyCodeAction } from "@/app/actions/auth";
import type { ActionResult } from "@/lib/errors";
import { FormMessage, SubmitButton } from "./action-form";
import { Field, Input, cx, inputClass } from "./ui";

export function PhoneLogin({ next }: { next: string }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const verifyForm = useRef<HTMLFormElement>(null);

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
      <form action={send} className="mt-7 space-y-4">
        <Field label="Your phone number" hint="MTN or Airtel. We'll text you a 6-digit code.">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2 pl-3.5 text-[15px] font-semibold text-ink-3">
              <span aria-hidden>🇺🇬</span> +256
            </span>
            <input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="772 123 456" autoFocus
              className={cx(inputClass, "h-12 pl-[92px] text-base tabular")} />
          </div>
        </Field>
        <FormMessage state={sendState} />
        <SubmitButton size="lg" className="w-full" pendingText="Sending code…">Send code</SubmitButton>
      </form>
    );

  return (
    <div className="mt-7 space-y-5">
      <p className="text-[15px] text-ink-3">We sent a code to <b className="text-ink tabular">{phone.replace(/^\+256(\d{3})(\d{3})(\d{3})$/, "+256 $1 $2 $3")}</b>.</p>
      <form ref={verifyForm} action={verify} className="space-y-4">
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="next" value={next} />
        <Field label="6-digit code">
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            aria-invalid={verifyState && !verifyState.ok ? true : undefined}
            className="h-14 text-center font-display text-[28px] font-bold tracking-[0.45em] tabular"
            onChange={(e) => {
              // Submit as soon as the 6th digit lands (works with SMS auto-fill too).
              const v = e.currentTarget.value.replace(/\D/g, "");
              if (v.length === 6) verifyForm.current?.requestSubmit();
            }}
          />
        </Field>
        <Field label="Your name" hint="Landlords see this when you book. Skip it if you've signed in before.">
          <Input name="name" autoComplete="name" maxLength={60} />
        </Field>
        <FormMessage state={verifyState} />
        <SubmitButton size="lg" className="w-full" pendingText="Checking…">Continue</SubmitButton>
      </form>
      <form action={send} className="flex items-center justify-between text-sm">
        <input type="hidden" name="phone" value={phone} />
        <button type="button" onClick={() => setPhone(null)} className="font-semibold text-muted hover:text-ink">Use another number</button>
        <button disabled={cooldown > 0} className="font-semibold text-brand-ink disabled:text-muted">{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button>
      </form>
    </div>
  );
}
