import Link from "next/link";
import {
  listReportAirports,
  currentMonth,
  isValidMonth,
  monthLabel,
} from "@/lib/reports/monthlyReport";
import MonthPicker from "@/components/reports/MonthPicker";

export const dynamic = "force-dynamic";

// Últimos N meses como opciones {value, label} para el selector.
function recentMonths(n: number): { value: string; label: string }[] {
  const [y0, m0] = currentMonth().split("-").map(Number);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ value: v, label: monthLabel(v) });
  }
  return out;
}

export default async function InformesIndex({ searchParams }: { searchParams: { mes?: string } }) {
  const mes = searchParams.mes && isValidMonth(searchParams.mes) ? searchParams.mes : currentMonth();

  const options = recentMonths(12);
  if (!options.some((o) => o.value === mes)) {
    options.unshift({ value: mes, label: monthLabel(mes) });
  }

  const airports = await listReportAirports(mes);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Informes mensuales</h1>
          <p className="mt-1 text-sm text-slate-500">
            Un informe por aeropuerto con plan de trabajo vigente: cumplimiento ASQ y mediciones de tiempos.
          </p>
        </div>
        <MonthPicker value={mes} options={options} />
      </div>

      {airports.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Ningún aeropuerto con plan de trabajo vigente en {monthLabel(mes)}.
          <br />
          Revisa que existan planes activos (Planes de trabajo) y que el aeropuerto esté asociado a una empresa
          en Encuestas ASQ.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {airports.map((a) => (
            <div key={a.code} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{a.code}</p>
                  <h2 className="truncate text-lg font-semibold text-slate-800">{a.name}</h2>
                  {a.sedeLabel && <p className="truncate text-sm text-slate-500">{a.sedeLabel}</p>}
                </div>
              </div>
              <p className="text-sm text-slate-500">
                {a.plans} {a.plans === 1 ? "plan vigente" : "planes vigentes"}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/informe/${a.code}?mes=${mes}`}
                  target="_blank"
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  Ver informe
                </Link>
                <a
                  href={`/api/reports/pptx?airport=${a.code}&mes=${mes}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  Descargar PPTX
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
