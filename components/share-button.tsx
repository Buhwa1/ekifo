"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { buttonClass, type BtnVariant } from "./ui";

/** Native share sheet where available (most Android phones); otherwise opens WhatsApp, else copies the link. */
export function ShareButton({ title, text, variant = "ghost" }: { title: string; text: string; variant?: BtnVariant }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass(variant, "sm")}
      onClick={async () => {
        const url = window.location.href.split("#")[0];
        if (navigator.share) {
          try { await navigator.share({ title, text, url }); } catch {}
          return;
        }
        if (/android|iphone|ipad/i.test(navigator.userAgent)) {
          window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {}
      }}
    >
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
