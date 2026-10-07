"use client";

import { useActionState, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { buttonClass, cx, type BtnVariant, type BtnSize } from "./ui";
import { toast } from "./toaster";

type Action = (fd: FormData) => Promise<ActionResult<unknown>>;

/** A confirmation step before an action runs. A string is used as the question. */
export type Confirm = string | { title: string; body?: string; confirmLabel?: string; danger?: boolean };

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingText, disabled }: {
  children: ReactNode; variant?: BtnVariant; size?: BtnSize; className?: string; pendingText?: string; disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok && !state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cx("flex items-start gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium", state.ok ? "bg-brand-soft text-brand-ink" : "bg-red-50 text-red-700")}>
      {state.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      <span>{state.ok ? state.message : state.error}</span>
    </p>
  );
}

/**
 * Runs an action through useActionState: success → toast (survives the form unmounting after
 * revalidation), failure → returned so the form can show it inline.
 */
function useAction(action: Action) {
  return useActionState(async (_: ActionResult<unknown> | null, fd: FormData) => {
    try {
      const r = await action(fd);
      if (r.ok && r.message) toast(r.message);
      return r;
    } catch (e) {
      // redirect()/notFound() from a server action surface as thrown errors; rethrow those.
      if ((e as { digest?: string })?.digest?.startsWith?.("NEXT_")) throw e;
      return { ok: false as const, error: navigator.onLine ? "Something went wrong. Please try again." : "You're offline. Reconnect and try again." };
    }
  }, null);
}

/** Intercepts submit to show a styled confirmation sheet instead of the browser's confirm(). */
function useConfirm(confirm: Confirm | undefined, formRef: RefObject<HTMLFormElement | null>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const approved = useRef(false);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!confirm || approved.current) {
      approved.current = false;
      return;
    }
    e.preventDefault();
    dialogRef.current?.showModal();
  };
  const c = typeof confirm === "string" ? { title: confirm } : confirm;
  const dialog = c ? (
    <dialog ref={dialogRef} className="sheet" onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current?.close(); }}>
      <div className="p-5 sm:p-6">
        <p className="font-display text-xl font-semibold leading-snug">{c.title}</p>
        {c.body ? <p className="mt-2 text-sm text-muted">{c.body}</p> : null}
        <div className="pb-safe mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={buttonClass("ghost", "lg", "sm:h-11")} onClick={() => dialogRef.current?.close()}>Not now</button>
          <button
            type="button"
            className={buttonClass(c.danger ? "danger" : "primary", "lg", "sm:h-11")}
            onClick={() => {
              dialogRef.current?.close();
              approved.current = true;
              formRef.current?.requestSubmit();
            }}
          >
            {c.confirmLabel ?? "Yes, continue"}
          </button>
        </div>
      </div>
    </dialog>
  ) : null;
  return { onSubmit, dialog };
}

/** A form bound to a server action, with inline errors, a success toast and optional confirmation. */
export function ActionForm({ action, children, className, resetOnSuccess, confirm }: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; confirm?: Confirm;
}) {
  const [state, formAction] = useAction(action);
  const ref = useRef<HTMLFormElement>(null);
  const { onSubmit, dialog } = useConfirm(confirm, ref);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} onSubmit={onSubmit}>
      {children}
      {state && !state.ok ? <div className="mt-2 basis-full"><FormMessage state={state} /></div> : null}
      {dialog}
    </form>
  );
}

/** A single button that runs a server action — for row actions like Approve / Toggle / Cancel. */
export function ActionButton({ action, children, variant = "outline", size = "sm", confirm, fields, className, buttonClassName }: {
  action: Action; children: ReactNode; variant?: BtnVariant; size?: BtnSize; confirm?: Confirm;
  fields?: Record<string, string>; className?: string; buttonClassName?: string;
}) {
  const [state, formAction] = useAction(action);
  const ref = useRef<HTMLFormElement>(null);
  const { onSubmit, dialog } = useConfirm(confirm, ref);
  return (
    <form ref={ref} action={formAction} className={cx("inline-flex flex-col items-start", className)} onSubmit={onSubmit}>
      {fields ? Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <SubmitButton variant={variant} size={size} className={buttonClassName}>{children}</SubmitButton>
      {state && !state.ok ? <span role="alert" className="mt-1 max-w-60 text-xs font-medium text-danger">{state.error}</span> : null}
      {dialog}
    </form>
  );
}
