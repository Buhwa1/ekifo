import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function Offline() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-white text-muted ring-1 ring-line">
        <WifiOff className="size-6" />
      </div>
      <h1 className="text-xl font-bold">You're offline</h1>
      <p className="mt-2 text-muted">Spaces you opened recently are still available. Go back to view them, or reconnect to search.</p>
      <Link href="/" className="mt-6 inline-block font-semibold text-brand">Try the homepage</Link>
    </div>
  );
}
