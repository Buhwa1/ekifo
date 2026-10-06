import { requireRole } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["ADMIN"], "/admin");
  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
