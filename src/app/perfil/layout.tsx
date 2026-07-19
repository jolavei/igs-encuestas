import { requireUser } from "@/lib/rbac";
import DashboardShell from "@/components/DashboardShell";

// Ruta compartida por todos los roles: cada usuario ve su propio perfil dentro
// del shell de su rol (mismo menú lateral que le corresponde).
export const dynamic = "force-dynamic";

export default async function PerfilLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <DashboardShell role={user.role} email={user.email} name={user.name}>
      {children}
    </DashboardShell>
  );
}
