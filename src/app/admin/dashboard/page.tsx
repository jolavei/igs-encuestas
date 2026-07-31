import TiemposDashboard from "@/components/dashboard/TiemposDashboard";

// La autorización (ADMIN) la aplica el layout de /admin. Datos siempre frescos.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold">Mediciones de tiempos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Evolutivo y distribución de tiempos de procesos por aeropuerto
        </p>
      </div>
      <TiemposDashboard />
    </div>
  );
}
