import type { Role } from "@/lib/enums";
import AppShell from "./AppShell";

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
    <AppShell role={role} email={email} name={name}>
      {children}
    </AppShell>
  );
}
