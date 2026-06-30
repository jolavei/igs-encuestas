import type { Role } from "@/lib/enums";
import Sidebar from "./Sidebar";

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
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={role} email={email} name={name} />
      <main className="min-w-0 flex-1 pt-14 lg:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
