import { requireUser } from "@/lib/rbac";
import DashboardShell from "@/components/DashboardShell";

export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN", "CLIENT"]);
  return (
    <DashboardShell role="CLIENT" email={user.email} name={user.name}>
      {children}
    </DashboardShell>
  );
}
