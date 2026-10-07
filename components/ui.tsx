import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined | 0>) {
  return c.filter(Boolean).join(" ");
}

// ─── Buttons ─────────────────────────────────────────────────────────────────
const btn = {
  base:
    "inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold whitespace-nowrap transition-[background,color,box-shadow,transform] duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none",
  size: { sm: "h-9 px-3 text-[13px]", md: "h-11 px-4 text-[15px]", lg: "h-[52px] px-6 text-base" },
  variant: {
    primary: "bg-brand text-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.10)] hover:bg-brand-dark",
    navy: "bg-navy text-white hover:bg-navy-2",
    ink: "bg-ink text-white hover:bg-ink-2",
    outline: "bg-white text-ink ring-1 ring-inset ring-line-strong hover:bg-surface hover:ring-ink-3/40",
    ghost: "text-ink hover:bg-ink/5",
    danger: "bg-white text-danger ring-1 ring-inset ring-red-200 hover:bg-red-50",
    amber: "bg-accent text-ink hover:bg-accent-dark",
    onDark: "bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15",
  },
};
export type BtnVariant = keyof typeof btn.variant;
export type BtnSize = keyof typeof btn.size;
export const buttonClass = (v: BtnVariant = "primary", s: BtnSize = "md", extra?: string) =>
  cx(btn.base, btn.size[s], btn.variant[v], extra);

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: BtnSize }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}
export function ButtonLink({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: BtnSize }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

// ─── Surfaces ────────────────────────────────────────────────────────────────
export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-[var(--radius-card)] bg-white ring-1 ring-line", className)} {...p} />;
}

/** A titled group of content on dashboards: heading row + optional action, then body. */
export function Section({ title, count, action, children, className }: { title: string; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {title}
          {count != null ? <span className="ml-1.5 font-sans text-sm font-semibold text-muted tabular">{count}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── Status ──────────────────────────────────────────────────────────────────
const tones = {
  green: "bg-brand-soft text-brand-ink ring-brand-ink/20",
  amber: "bg-accent-soft text-accent-ink ring-accent-ink/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/15",
  navy: "bg-navy text-white ring-navy",
  blue: "bg-sky-soft text-sky-ink ring-sky-ink/20",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  VACANT: "green", RESERVED: "amber", OCCUPIED: "red", UNLISTED: "slate",
  LIVE: "green", PENDING_REVIEW: "amber", DRAFT: "slate", REJECTED: "red", SUSPENDED: "red",
  PENDING_PAYMENT: "amber", HELD: "amber", CONFIRMED: "green", REFUNDED: "slate", EXPIRED: "slate", CANCELLED: "slate",
  REQUESTED: "blue", RESCHEDULED: "amber", DECLINED: "red", COMPLETED: "green", NO_SHOW: "red",
  APPROVED: "blue", PAID: "green", FAILED: "red", OPEN: "red", RESOLVED: "green", DISMISSED: "slate",
  PENDING: "amber", VERIFIED: "green", NONE: "slate", SUCCESSFUL: "green",
  MAINTENANCE: "red", UNDER_CONSTRUCTION: "blue", PUBLISHED: "green", HIDDEN: "slate",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: "In review", PENDING_PAYMENT: "Awaiting payment", HELD: "Booked", NO_SHOW: "No-show",
  UNLISTED: "Hidden", RESERVED: "Booked", MAINTENANCE: "Under maintenance", UNDER_CONSTRUCTION: "Under construction", PUBLISHED: "Live", REQUESTED: "New", RESCHEDULED: "New time proposed", CONFIRMED: "Confirmed",
  SUCCESSFUL: "Paid", NONE: "Not started",
};
export function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "slate"}>{statusLabel(status)}</Badge>;
}

/** Coloured dot used where a full badge would be noisy (unit grids, compact lists). */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  const c = { green: "bg-brand", amber: "bg-accent", red: "bg-danger", slate: "bg-slate-400", navy: "bg-navy", blue: "bg-sky" }[STATUS_TONE[status] ?? "slate"];
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", c, className)} />;
}

// ─── Forms ───────────────────────────────────────────────────────────────────
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs font-medium text-danger">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full h-11 rounded-[var(--radius-control)] border-0 bg-white px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line-strong placeholder:text-slate-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-brand aria-[invalid=true]:ring-danger";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={cx(inputClass, p.className)} />;
}
export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={cx(inputClass, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2364748b%22><path d=%22M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z%22/></svg>')] bg-[length:18px] bg-[right_10px_center] bg-no-repeat pr-9", p.className)} />;
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(inputClass, "h-auto min-h-24 py-2.5 leading-relaxed", p.className)} />;
}

// ─── Page furniture ──────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[30px] font-bold sm:text-[36px]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-[15px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-white/60 px-6 py-10 text-center">
      {icon ? <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-surface text-muted ring-1 ring-line">{icon}</div> : null}
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-sm text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "amber" }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-[28px] font-bold leading-tight tracking-tight tabular", tone === "brand" && "text-brand-ink", tone === "amber" && "text-accent-ink")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Thin progress bar, e.g. occupancy. */
export function Meter({ value, max, className, label }: { value: number; max: number; className?: string; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)} role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand to-sky" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Formatting helpers ─────────────────────────────────────────────────────
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

/** "UGX 1,400,000" → parts so the number can be set large and the currency small. */
export function Money({ amount, suffix, className, size = "md" }: { amount: number; suffix?: string; className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const n = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(amount);
  const sz = { sm: "text-base", md: "text-lg", lg: "text-2xl", xl: "text-[34px]" }[size];
  return (
    <span className={cx("inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
      <span className="font-sans text-xs font-semibold text-muted">UGX</span>
      <span className={cx("font-display font-bold tabular tracking-tight", sz)}>{n}</span>
      {suffix ? <span className="text-sm font-medium text-muted">{suffix}</span> : null}
    </span>
  );
}

// ─── Groups (Stay / Business / Leisure) ─────────────────────────────────────
export const GROUP_STYLE = {
  STAY: { chip: "bg-brand-soft text-brand-ink", dot: "bg-brand", solid: "bg-brand text-ink", text: "text-brand-ink", ring: "ring-brand" },
  BUSINESS: { chip: "bg-accent-soft text-accent-ink", dot: "bg-accent", solid: "bg-accent text-ink", text: "text-accent-ink", ring: "ring-accent" },
  LEISURE: { chip: "bg-sky-soft text-sky-ink", dot: "bg-sky", solid: "bg-sky text-ink", text: "text-sky-ink", ring: "ring-sky" },
} as const;
export type GroupKey = keyof typeof GROUP_STYLE;
