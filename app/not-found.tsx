import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { buttonClass } from "@/components/ui";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-white text-muted ring-1 ring-line">
        <MapPinOff className="size-6" />
      </div>
      <h1 className="mt-5 text-2xl font-bold">We couldn't find that</h1>
      <p className="mt-2 text-muted">The listing may have been taken down, or the link is incomplete. There's plenty more free right now.</p>
      <Link href="/" className={buttonClass("primary", "md", "mt-6")}>See what's free</Link>
    </div>
  );
}
