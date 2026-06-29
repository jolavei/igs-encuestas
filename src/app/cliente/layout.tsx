import { requireUser } from "@/lib/rbac";
import DashboardShell from "@/components/DashboardShell";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN", "CLIENT"]);
  return (
    <DashboardShell role="CLIENT" email={user.email}>
      {children}
    </DashboardShell>
  );
}
