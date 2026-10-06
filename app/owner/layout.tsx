import { requireUser } from "@/lib/auth";
import { OwnerNav } from "@/components/owner-nav";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/owner");
  const isOwner = user.role === "LANDLORD" || user.role === "ADMIN";
  return (
    <div>
      {isOwner ? <OwnerNav /> : null}
      {children}
    </div>
  );
}
