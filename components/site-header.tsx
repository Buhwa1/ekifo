import Link from "next/link";
import { Building2, LayoutDashboard, ShieldCheck, UserRound, LogIn } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "./logo";

export async function SiteHeader() {
  const user = await currentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy/95 text-white backdrop-blur supports-[backdrop-filter]:bg-navy/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2 font-extrabold tracking-tight" aria-label="FindEkifo home">
          <Logo className="size-7" />
          <span className="text-[17px]">Find<span className="text-emerald-400">Ekifo</span></span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          {user?.role === "ADMIN" ? (
            <NavLink href="/admin" icon={<ShieldCheck className="size-4" />}>Admin</NavLink>
          ) : null}
          {user && (user.role === "LANDLORD" || user.role === "ADMIN") ? (
            <NavLink href="/owner" icon={<LayoutDashboard className="size-4" />}>My spaces</NavLink>
          ) : (
            <NavLink href={user ? "/owner/verify" : "/login?next=/owner/verify"} icon={<Building2 className="size-4" />}>List a space</NavLink>
          )}
          {user ? (
            <>
              <NavLink href="/me" icon={<UserRound className="size-4" />}>Account</NavLink>
              <form action={logoutAction}>
                <button className="rounded-lg px-2.5 py-1.5 text-white/60 hover:bg-white/10 hover:text-white">Sign out</button>
              </form>
            </>
          ) : (
            <NavLink href="/login" icon={<LogIn className="size-4" />}>Sign in</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}
