import TiemposPage from "@/components/dashboard/TiemposPage";

// La autorización (ADMIN) la aplica el layout de /admin. Datos siempre frescos.
export const dynamic = "force-dynamic";

export default function DashboardTiemposPage() {
  return <TiemposPage />;
}
