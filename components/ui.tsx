import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

const btn = {
  base: "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none",
  size: { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-13 px-6 text-base" },
  variant: {
    primary: "bg-brand text-white hover:bg-brand-dark shadow-sm",
    navy: "bg-navy text-white hover:bg-navy-2",
    outline: "border border-line bg-white text-navy hover:bg-surface",
    ghost: "text-navy hover:bg-slate-100",
    danger: "bg-white border border-red-200 text-danger hover:bg-red-50",
    amber: "bg-accent text-white hover:brightness-95",
  },
};
export type BtnVariant = keyof typeof btn.variant;
export const buttonClass = (v: BtnVariant = "primary", s: keyof typeof btn.size = "md", extra?: string) =>
  cx(btn.base, btn.size[s], btn.variant[v], extra);

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: keyof typeof btn.size }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}
export function ButtonLink({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: keyof typeof btn.size }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-[var(--radius-card)] border border-line bg-white", className)} {...p} />;
}

const tones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  navy: "bg-navy text-white ring-navy",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  VACANT: "green", RESERVED: "amber", OCCUPIED: "red", UNLISTED: "slate",
  LIVE: "green", PENDING_REVIEW: "amber", DRAFT: "slate", REJECTED: "red", SUSPENDED: "red",
  PENDING_PAYMENT: "amber", HELD: "amber", CONFIRMED: "green", REFUNDED: "slate", EXPIRED: "slate", CANCELLED: "slate",
  REQUESTED: "blue", RESCHEDULED: "amber", DECLINED: "red", COMPLETED: "green", NO_SHOW: "red",
  APPROVED: "blue", PAID: "green", FAILED: "red", OPEN: "red", RESOLVED: "green", DISMISSED: "slate",
  PENDING: "amber", VERIFIED: "green", NONE: "slate",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: "Pending review", PENDING_PAYMENT: "Awaiting payment", HELD: "Reserved", NO_SHOW: "No-show",
};
export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <Badge tone={STATUS_TONE[status] ?? "slate"}>{label}</Badge>;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-semibold text-navy">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full h-11 rounded-xl border border-line bg-white px-3 text-[15px] text-navy placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={cx(inputClass, p.className)} />;
}
export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={cx(inputClass, "pr-8", p.className)} />;
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(inputClass, "h-auto min-h-24 py-2.5", p.className)} />;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-[28px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[15px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-white px-6 py-12 text-center">
      {icon ? <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-surface text-muted">{icon}</div> : null}
      <p className="font-semibold text-navy">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "amber" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 text-2xl font-bold tabular", tone === "brand" && "text-brand", tone === "amber" && "text-accent")}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

/** Cloudinary URLs get on-the-fly resizing + format negotiation (big win on 3G); others pass through. */
export function imgSrc(url: string | null | undefined, width: number) {
  if (!url) return "/seed/placeholder.jpg";
  if (url.includes("res.cloudinary.com") && url.includes("/upload/"))
    return url.replace("/upload/", `/upload/f_auto,q_auto,c_fill,w_${width}/`);
  return url;
}

export const dateFmt = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric" });
export const dateTimeFmt = (d: Date | string) =>
  new Date(d).toLocaleString("en-UG", { timeZone: "Africa/Kampala", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
