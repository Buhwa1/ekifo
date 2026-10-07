import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "./logo";
import { BottomNav, DesktopNav } from "./nav";

export async function SiteHeader() {
  const user = await currentUser();
  const nav = user ? { role: user.role, name: user.name, landlordStatus: user.landlordStatus } : null;
  const initials = (user?.name ?? "").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-30 bg-navy text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="mr-auto flex items-center gap-2" aria-label="FindEkifo home">
            <Logo className="size-7" />
            <span className="font-display text-[19px] font-bold tracking-tight">FindEkifo</span>
          </Link>
          <DesktopNav user={nav} />
          {user ? (
            <div className="flex items-center gap-1">
              <Link href="/me" className="grid size-9 place-items-center rounded-full bg-white/10 font-display text-sm font-bold ring-1 ring-white/15 hover:bg-white/15" aria-label="Your account">
                {initials || "Me"}
              </Link>
              <form action={logoutAction} className="hidden md:block">
                <button className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white">Sign out</button>
              </form>
            </div>
          ) : (
            <Link href="/login" className="rounded-[var(--radius-control)] bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-white/90">Sign in</Link>
          )}
        </div>
      </header>
      <BottomNav user={nav} />
    </>
  );
}
