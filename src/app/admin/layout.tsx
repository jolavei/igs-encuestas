import { requireUser } from "@/lib/rbac";
import DashboardShell from "@/components/DashboardShell";

// Siempre datos frescos desde la base (sin caché estático en producción).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN"]);
  return (
    <DashboardShell role={user.role} email={user.email}>
      {children}
    </DashboardShell>
  );
}
