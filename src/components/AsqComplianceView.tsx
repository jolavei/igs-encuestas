import type { AsqAirportView } from "@/lib/asqScope";

function pct(done: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
}

function Pct({ done, target }: { done: number; target: number }) {
  const p = pct(done, target);
  const reached = target > 0 && done >= target;
  return (
    <span className={reached ? "font-medium text-green-600" : "text-slate-500"}>
      {p}%{reached && " ✓"}
    </span>
  );
}

// Vista de solo lectura del cumplimiento ASQ, acotada a las sedes del usuario.
export default function AsqComplianceView({ airports }: { airports: AsqAirportView[] }) {
  return (
    <>
      {/* Cajas de avance por aeropuerto (clic -> baja a su tabla) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {airports.map((a) => (
          <a
            key={a.airport}
            href={`#aeropuerto-${a.airport}`}
            className="card group transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50/40"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">{a.airport}</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {a.collected}
              <span className="text-base font-medium text-slate-400"> / {a.target || "—"}</span>
            </p>
            <p className="text-sm">
              <Pct done={a.collected} target={a.target} />
            </p>
          </a>
        ))}
      </div>

      {/* Una tabla por aeropuerto */}
      <div className="space-y-6">
        {airports.map((a) => (
          <div key={a.airport} id={`aeropuerto-${a.airport}`} className="card space-y-3 scroll-mt-20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {a.airport}
                {a.sedeLabel && (
                  <span className="ml-2 text-sm font-normal text-slate-400">{a.sedeLabel}</span>
                )}
              </h2>
              <span className="text-sm text-slate-500">
                {a.collected} / {a.target || "—"} · <Pct done={a.collected} target={a.target} />
              </span>
            </div>

            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Aerolínea-Destino</th>
                    <th className="px-3 py-2 text-right">Plan (Target)</th>
                    <th className="px-3 py-2 text-right">Realizadas</th>
                    <th className="px-3 py-2 text-right">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {a.rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                      <td className="px-3 py-2">{row.airlineDestination}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.target}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.collected}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Pct done={row.collected} target={row.target} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 bg-slate-50/70 font-semibold text-slate-700">
                    <td className="px-3 py-2 text-slate-500">Total {a.airport}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.target}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.collected}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Pct done={a.collected} target={a.target} />
                    </td>
                  </tr>
                  {a.rows.length === 0 && (
                    <tr className="border-t border-slate-100 text-slate-400">
                      <td className="px-3 py-2 italic" colSpan={4}>
                        Sin rutas registradas para esta temporada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
