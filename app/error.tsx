"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Route-level error boundary: keeps the header and tab bar, explains, and offers a retry. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(!navigator.onLine);
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-white text-muted ring-1 ring-line">
        {offline ? <WifiOff className="size-6" /> : <RefreshCw className="size-6" />}
      </div>
      <h1 className="mt-5 text-2xl font-bold">{offline ? "You're offline" : "This page didn't load"}</h1>
      <p className="mt-2 text-muted">
        {offline ? "Reconnect to mobile data or Wi-Fi, then try again. Places you opened recently still work offline." : "Something on our side failed. Trying again usually fixes it."}
      </p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Reference {error.digest}</p> : null}
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={reset} className={buttonClass("primary", "md")}>Try again</button>
        <Link href="/" className={buttonClass("outline", "md")}>Go to Explore</Link>
      </div>
    </div>
  );
}
