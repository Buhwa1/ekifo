"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Grid2x2, Images, Play, X } from "lucide-react";
import { cx } from "./ui";

type Item = { url: string; thumb: string; full: string; kind: "PHOTO" | "VIDEO" | "TOUR_360" | "FLOOR_PLAN" };
const TAG: Partial<Record<Item["kind"], string>> = { TOUR_360: "360° view", FLOOR_PLAN: "Floor plan", VIDEO: "Video tour" };

/**
 * Phones: a swipeable strip (native scroll-snap — no JS needed to swipe).
 * Larger screens: a mosaic of up to five tiles.
 * Either opens a full-screen viewer. Videos only load when someone presses play.
 */
export function Gallery({ items, title }: { items: Item[]; title: string }) {
  const ordered = [...items.filter((i) => i.kind === "VIDEO"), ...items.filter((i) => i.kind !== "VIDEO")];
  const poster = ordered.find((i) => i.kind !== "VIDEO")?.url;
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  if (!ordered.length)
    return (
      <div className="-mx-4 grid aspect-[16/10] place-items-center bg-slate-200 text-muted sm:mx-0 sm:aspect-[21/9] sm:rounded-[var(--radius-card)]">
        <span className="flex flex-col items-center gap-2 text-sm"><Images className="size-7" /> Photos coming soon</span>
      </div>
    );

  const tile = (m: Item, i: number, cls: string, eager = false) => (
    <button key={i} type="button" onClick={() => setOpen(i)} className={cx("group relative overflow-hidden bg-slate-200", cls)} aria-label={`Open ${TAG[m.kind]?.toLowerCase() ?? "photo"} ${i + 1} of ${ordered.length}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.kind === "VIDEO" ? poster ?? m.thumb : m.url} alt="" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async"
        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
      {m.kind === "VIDEO" ? (
        <span className="absolute inset-0 grid place-items-center bg-ink/25">
          <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-ink shadow-lg"><Play className="size-4 fill-ink" /> Watch the tour</span>
        </span>
      ) : TAG[m.kind] ? (
        <span className="absolute left-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-semibold text-white">{TAG[m.kind]}</span>
      ) : null}
    </button>
  );

  return (
    <>
      {/* Phone: swipe strip */}
      <div className="relative -mx-4 sm:hidden">
        <div
          ref={strip}
          className="scroll-row flex snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {ordered.map((m, i) => (
            <div key={i} className="aspect-[4/3] w-full shrink-0 snap-center">{tile(m, i, "size-full", i === 0)}</div>
          ))}
        </div>
        {ordered.length > 1 ? (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-semibold text-white tabular">{index + 1} / {ordered.length}</span>
        ) : null}
      </div>

      {/* Tablet/desktop: mosaic */}
      <div className="relative hidden h-[420px] gap-2 overflow-hidden rounded-[var(--radius-card)] sm:grid sm:grid-cols-4 sm:grid-rows-2">
        {tile(ordered[0], 0, cx("col-span-2 row-span-2", ordered.length === 1 && "col-span-4"), true)}
        {ordered.slice(1, 5).map((m, j) => tile(m, j + 1, cx(ordered.length === 2 && "col-span-2 row-span-2", ordered.length === 3 && "col-span-2")))}
        {ordered.length > 1 ? (
          <button type="button" onClick={() => setOpen(0)} className="absolute bottom-3 right-3 flex items-center gap-2 rounded-[var(--radius-control)] bg-white px-3.5 py-2 text-sm font-semibold text-ink shadow-md ring-1 ring-ink/10 hover:bg-surface">
            <Grid2x2 className="size-4" /> All {ordered.length} photos
          </button>
        ) : null}
      </div>

      {open != null ? <Viewer items={ordered} start={open} title={title} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Viewer({ items, start, title, onClose }: { items: Item[]; start: number; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(items.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);
  const m = items[i];
  let touchX = 0;

  return (
    <dialog ref={ref} onClose={onClose} aria-label={`${title} photos`}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-ink p-0 text-white backdrop:bg-ink">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="truncate text-sm font-semibold">{title}</p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/60 tabular">{i + 1} / {items.length}</span>
            <button onClick={() => ref.current?.close()} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Close"><X className="size-5" /></button>
          </div>
        </div>
        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden"
          onTouchStart={(e) => { touchX = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - touchX;
            if (dx < -40) setI((x) => Math.min(items.length - 1, x + 1));
            if (dx > 40) setI((x) => Math.max(0, x - 1));
          }}
        >
          {m.kind === "VIDEO" ? (
            <video key={m.url} src={m.full} controls autoPlay playsInline className="max-h-full max-w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.url} src={m.full} alt={`${title}, ${TAG[m.kind]?.toLowerCase() ?? "photo"} ${i + 1}`} className="max-h-full max-w-full animate-[fade-in_160ms_ease-out] object-contain" />
          )}
          {i > 0 ? <button onClick={() => setI(i - 1)} className="absolute left-3 hidden rounded-full bg-white/10 p-3 hover:bg-white/20 sm:block" aria-label="Previous"><ChevronLeft className="size-6" /></button> : null}
          {i < items.length - 1 ? <button onClick={() => setI(i + 1)} className="absolute right-3 hidden rounded-full bg-white/10 p-3 hover:bg-white/20 sm:block" aria-label="Next"><ChevronRight className="size-6" /></button> : null}
        </div>
        <div className="scroll-row flex gap-2 overflow-x-auto px-4 pb-6 pt-3">
          {items.map((t, j) => (
            <button key={j} onClick={() => setI(j)} className={cx("h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2", j === i ? "ring-white" : "opacity-50 ring-transparent")} aria-label={`Show ${j + 1}`}>
              {t.kind === "VIDEO" ? <span className="grid size-full place-items-center bg-white/10"><Play className="size-4" /></span> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.thumb} alt="" loading="lazy" className="size-full object-cover" />
              )}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
