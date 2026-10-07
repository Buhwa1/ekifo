import { redirect } from "next/navigation";
import { BadgeCheck, Lock, Ban } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { PhoneLogin } from "@/components/phone-login";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  if (await currentUser()) redirect(safeNext || "/");
  const why = safeNext.startsWith("/reserve") ? "to reserve this unit" : safeNext.startsWith("/owner") ? "to list your space" : safeNext.startsWith("/spaces") ? "to book visits and see contacts" : "";

  return (
    <div className="mx-auto grid max-w-4xl items-start gap-10 py-4 md:grid-cols-[1fr_1fr] md:py-10">
      <div className="max-w-sm">
        <h1 className="text-[32px] font-bold">Sign in {why}</h1>
        <p className="mt-2 text-muted">No password to remember. Just your phone.</p>
        <PhoneLogin next={safeNext} />
      </div>
      <ul className="hidden space-y-6 rounded-[var(--radius-card)] bg-navy p-8 text-white md:block">
        {[
          { icon: BadgeCheck, t: "Every landlord is ID-checked", b: "We verify National IDs and proof of ownership before anything goes live." },
          { icon: Ban, t: "Viewing is always free", b: "Nobody on FindEkifo should ask you for a viewing fee." },
          { icon: Lock, t: "Deposits are held safely", b: "The landlord is paid only after you confirm you've moved in." },
        ].map(({ icon: Icon, t, b }) => (
          <li key={t} className="flex gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand-glow" aria-hidden />
            <div>
              <p className="font-semibold">{t}</p>
              <p className="mt-0.5 text-sm text-white/65">{b}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
