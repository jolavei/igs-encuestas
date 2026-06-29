import { requireUser } from "@/lib/rbac";
import DashboardShell from "@/components/DashboardShell";

export const dynamic = "force-dynamic";

export default async function SurveyorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN", "SURVEYOR"]);
  return (
    <DashboardShell role="SURVEYOR" email={user.email}>
      {children}
    </DashboardShell>
  );
}
