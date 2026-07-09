import type { Role } from "@/lib/enums";
import AppShell from "./AppShell";
import FreshnessGuard from "./FreshnessGuard";
import { getAppVersion } from "@/lib/version";

export default function DashboardShell({
  role,
  email,
  name,
  children,
}: {
  role: Role;
  email?: string | null;
  name?: string | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <FreshnessGuard version={getAppVersion()} />
      <AppShell role={role} email={email} name={name}>
        {children}
      </AppShell>
    </>
  );
}
