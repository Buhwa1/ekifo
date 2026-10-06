"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { buttonClass, cx, type BtnVariant } from "./ui";
import { toast } from "./toaster";

type Action = (fd: FormData) => Promise<ActionResult<unknown>>;

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingText, disabled }: {
  children: ReactNode; variant?: BtnVariant; size?: "sm" | "md" | "lg"; className?: string; pendingText?: string; disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={buttonClass(variant, size, className)}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok && !state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cx("flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-medium", state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
      {state.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      <span>{state.ok ? state.message : state.error}</span>
    </p>
  );
}

/** A form bound to a server action, with inline error/success feedback and optional reset on success. */
export function ActionForm({ action, children, className, resetOnSuccess, confirm }: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; confirm?: string;
}) {
  const [state, formAction] = useActionState(async (_: ActionResult<unknown> | null, fd: FormData) => {
    const r = await action(fd);
    if (r.ok && r.message) toast(r.message); // toast survives the form unmounting after revalidation
    return r;
  }, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && !state.ok ? <div className="mt-2"><FormMessage state={state} /></div> : null}
    </form>
  );
}

/** A single button that runs a server action — for row actions like Approve / Toggle / Cancel. */
export function ActionButton({ action, children, variant = "outline", size = "sm", confirm, fields, className }: {
  action: Action; children: ReactNode; variant?: BtnVariant; size?: "sm" | "md" | "lg"; confirm?: string;
  fields?: Record<string, string>; className?: string;
}) {
  const [state, formAction] = useActionState(async (_: ActionResult<unknown> | null, fd: FormData) => {
    const r = await action(fd);
    if (r.ok && r.message) toast(r.message);
    return r;
  }, null);
  return (
    <form action={formAction} className={cx("inline-flex flex-col items-start", className)} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {fields ? Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <SubmitButton variant={variant} size={size}>{children}</SubmitButton>
      {state && !state.ok ? <span role="alert" className="mt-1 max-w-56 text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
