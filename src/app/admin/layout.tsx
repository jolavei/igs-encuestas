import { requireUser } from "@/lib/rbac";
import DashboardShell from "@/components/DashboardShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN"]);
  return (
    <DashboardShell role={user.role} email={user.email}>
      {children}
    </DashboardShell>
  );
}
