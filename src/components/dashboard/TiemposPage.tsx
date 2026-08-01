import { getSessionUser } from "@/lib/rbac";
import { getScopedTiemposAirports } from "@/lib/dashboardTiemposScope";
import { bqTableLastModified } from "@/lib/bigquery";
import TiemposDashboard from "./TiemposDashboard";

// Formatea una fecha a "DD-MM-YYYY, HH:MM" en horario de Chile (mismo huso que
// usa el resto del dashboard). es-CL usa "/" en la fecha, así que la armamos a mano.
function fmtSync(d: Date): string {
  const p = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}-${g("month")}-${g("year")}, ${g("hour")}:${g("minute")}`;
}

// Última vez que se reescribió la tabla consolidada en BigQuery (la corrida de
// Dataform que refresca los datos). Si faltan credenciales o la tabla no existe,
// no mostramos la burbuja en vez de romper la página.
async function getLastSync(): Promise<string | null> {
  try {
    const d = await bqTableLastModified("encuestas", "mediciones_tiempos_consolidado");
    return d ? fmtSync(d) : null;
  } catch {
    return null;
  }
}

// Página del dashboard "Mediciones de tiempos", compartida por admin, encuestador
// y cliente. Cada rol la monta desde su propio layout (que ya autenticó). Los
// aeropuertos visibles se acotan al alcance del usuario en el servidor.
export default async function TiemposPage() {
  const user = await getSessionUser();
  const [airports, lastSync] = await Promise.all([
    user ? getScopedTiemposAirports({ id: user.id, role: user.role }) : Promise.resolve([]),
    getLastSync(),
  ]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mediciones de tiempos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Evolutivo y distribución de tiempos de procesos por aeropuerto
          </p>
        </div>
        {lastSync && <SyncBadge label={lastSync} />}
      </div>
      <TiemposDashboard airports={airports} />
    </div>
  );
}

// Burbuja "en vivo" con un punto verde parpadeando: última sincronización de los
// datos desde BigQuery. La animación es CSS pura (animate-ping), así que funciona
// en este componente de servidor sin volverlo cliente.
function SyncBadge({ label }: { label: string }) {
  return (
    <span
      title="Última vez que se actualizaron los datos desde BigQuery"
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      Última sincronización: {label}
    </span>
  );
}
