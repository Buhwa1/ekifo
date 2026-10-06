"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Logo } from "./logo";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = "ekifo-install-dismissed";

/** Bottom-sheet install prompt. Shows after the second page view, never again for 14 days once dismissed. */
export function InstallBanner() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dismissed = 0;
    let views = 0;
    try {
      dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      views = Number(sessionStorage.getItem("ekifo-views") ?? 0) + 1;
      sessionStorage.setItem("ekifo-views", String(views));
    } catch {}
    if (Date.now() - dismissed < 14 * 86_400_000) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      if (views >= 2) setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
    if (isIos && views >= 2) {
      setIos(true);
      setOpen(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-label="Install FindEkifo" className="fixed inset-x-0 bottom-0 z-40 p-3 sm:bottom-4 sm:left-auto sm:right-4 sm:w-96 sm:p-0">
      <div className="flex items-start gap-3 rounded-2xl bg-navy p-4 text-white shadow-2xl ring-1 ring-white/10">
        <Logo className="size-10 shrink-0" />
        <div className="flex-1">
          <p className="font-bold">Install FindEkifo</p>
          <p className="mt-0.5 text-sm text-white/70">
            {ios ? "Tap Share, then “Add to Home Screen” to keep saved spaces offline." : "Keep saved spaces, caretaker numbers and directions available offline."}
          </p>
          {!ios && evt ? (
            <button
              onClick={async () => {
                await evt.prompt();
                await evt.userChoice;
                dismiss();
              }}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold hover:bg-brand-dark"
            >
              <Download className="size-4" /> Install app
            </button>
          ) : null}
        </div>
        <button onClick={dismiss} className="rounded-lg p-1 text-white/60 hover:bg-white/10" aria-label="Dismiss">
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}
