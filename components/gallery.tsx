"use client";

import { useState } from "react";
import { Play, Rotate3d, Images } from "lucide-react";
import { cx } from "./ui";

type Item = { url: string; thumb: string; kind: "PHOTO" | "VIDEO" | "TOUR_360" | "FLOOR_PLAN" };

/** Hero gallery: video tour first if there is one; videos load only when tapped (data-friendly). */
export function Gallery({ items, title }: { items: Item[]; title: string }) {
  const ordered = [...items.filter((i) => i.kind === "VIDEO"), ...items.filter((i) => i.kind !== "VIDEO")];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  if (!ordered.length)
    return <div className="grid aspect-[16/9] place-items-center rounded-2xl bg-slate-200 text-muted"><Images className="size-8" /></div>;
  const cur = ordered[Math.min(idx, ordered.length - 1)];
  const poster = ordered.find((i) => i.kind === "PHOTO")?.url;

  return (
    <div>
      <div className="relative -mx-4 aspect-[16/10] overflow-hidden bg-slate-900 sm:mx-0 sm:aspect-[16/8] sm:rounded-2xl">
        {cur.kind === "VIDEO" ? (
          playing ? (
            <video src={cur.url} className="size-full object-contain" controls autoPlay playsInline />
          ) : (
            <button onClick={() => setPlaying(true)} className="group relative size-full" aria-label="Play video tour">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {poster ? <img src={poster} alt="" className="size-full object-cover opacity-80" /> : null}
              <span className="absolute inset-0 grid place-items-center">
                <span className="flex items-center gap-2 rounded-full bg-white/95 px-5 py-3 font-bold text-navy shadow-lg group-hover:scale-105"><Play className="size-5 fill-navy" /> Watch video tour</span>
              </span>
            </button>
          )
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cur.url} alt={`${title} — photo ${idx + 1}`} className="size-full object-cover" fetchPriority="high" />
        )}
        {cur.kind === "TOUR_360" ? <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white"><Rotate3d className="size-3.5" /> 360°</span> : null}
        {cur.kind === "FLOOR_PLAN" ? <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">Floor plan</span> : null}
        <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white tabular">{idx + 1} / {ordered.length}</span>
      </div>
      {ordered.length > 1 ? (
        <div className="scroll-row mt-2 flex gap-2 overflow-x-auto">
          {ordered.map((m, i) => (
            <button key={i} onClick={() => { setIdx(i); setPlaying(false); }} className={cx("relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2", i === idx ? "ring-brand" : "ring-transparent opacity-80")} aria-label={`Show item ${i + 1}`}>
              {m.kind === "VIDEO" ? (
                <span className="grid size-full place-items-center bg-navy text-white"><Play className="size-4" /></span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
