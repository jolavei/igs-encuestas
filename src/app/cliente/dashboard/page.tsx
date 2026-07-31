import TiemposPage from "@/components/dashboard/TiemposPage";

// La autorización (CLIENT) la aplica el layout de /cliente. El alcance de
// aeropuertos se acota al usuario dentro de TiemposPage. Datos siempre frescos.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <TiemposPage />;
}
