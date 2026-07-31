import { getSessionUser } from "@/lib/rbac";
import { getScopedTiemposAirports } from "@/lib/dashboardTiemposScope";
import TiemposDashboard from "./TiemposDashboard";

// Página del dashboard "Mediciones de tiempos", compartida por admin, encuestador
// y cliente. Cada rol la monta desde su propio layout (que ya autenticó). Los
// aeropuertos visibles se acotan al alcance del usuario en el servidor.
export default async function TiemposPage() {
  const user = await getSessionUser();
  const airports = user
    ? await getScopedTiemposAirports({ id: user.id, role: user.role })
    : [];

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold">Mediciones de tiempos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Evolutivo y distribución de tiempos de procesos por aeropuerto
        </p>
      </div>
      <TiemposDashboard airports={airports} />
    </div>
  );
}
