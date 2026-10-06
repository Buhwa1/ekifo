import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { PhoneLogin } from "@/components/phone-login";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentUser()) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-extrabold tracking-tight">Sign in with your phone</h1>
      <p className="mt-1 text-muted">No password. We'll text you a 6-digit code.</p>
      <PhoneLogin next={next ?? ""} />
    </div>
  );
}
