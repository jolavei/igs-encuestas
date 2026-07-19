import Link from "next/link";

// Una fila = un plan de trabajo vigente. Los datos ya vienen calculados y
// formateados desde el server (fechas, %, etc.).
export type PlanRow = {
  id: string;
  questionnaire: string;
  company: string;
  location: string;
  windowStart: string;
  windowEnd: string;
  done: number;
  target: number;
  pct: number;
  reached: boolean;
  lastResponse: string | null;
  source: string | null;
};

// Rango de fechas: cada fecha se mantiene entera (nunca se parte a la mitad).
// Si no cabe en una línea, la segunda fecha completa pasa a la línea de abajo
// (el único corte permitido es el separador " – " entre ambas fechas).
function DateRange({ from, to }: { from: string; to: string }) {
  return (
    <span>
      <span className="whitespace-nowrap">{from}</span>
      {" – "}
      <span className="whitespace-nowrap">{to}</span>
    </span>
  );
}

// % de cumplimiento con una barra fina (misma pieza en tabla y tarjetas).
function PctMeter({ pct, reached }: { pct: number; reached: boolean }) {
  return (
    <div className="min-w-[3.5rem]">
      <span className={`text-sm font-medium ${reached ? "text-green-600" : "text-slate-700"}`}>
        {pct}%{reached && " ✓"}
      </span>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${reached ? "bg-green-500" : "bg-brand-500"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export default function PlanesVigentesTable({ rows }: { rows: PlanRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No hay planes de trabajo vigentes en este momento.
      </p>
    );
  }

  return (
    <>
      {/* Escritorio: tabla (scroll horizontal solo si hiciera falta) */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2.5 py-2">Cuestionario</th>
              <th className="px-2.5 py-2">Empresa</th>
              <th className="px-2.5 py-2">Sede</th>
              <th className="whitespace-nowrap px-2.5 py-2">Vigencia</th>
              <th className="px-2.5 py-2 text-right">Realizadas</th>
              <th className="px-2.5 py-2 text-right">Meta</th>
              <th className="px-2.5 py-2">% Meta</th>
              <th className="px-2.5 py-2">Última encuesta</th>
              <th className="px-2.5 py-2">Origen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-2.5 py-2 font-medium">
                  <Link href={`/admin/planes#plan-${r.id}`} className="hover:text-brand-600">
                    {r.questionnaire}
                  </Link>
                </td>
                <td className="px-2.5 py-2 text-slate-600">{r.company}</td>
                <td className="px-2.5 py-2 text-slate-600">{r.location}</td>
                <td className="px-2.5 py-2 text-slate-600">
                  <DateRange from={r.windowStart} to={r.windowEnd} />
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums">{r.done}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{r.target || "—"}</td>
                <td className="px-2.5 py-2">
                  <PctMeter pct={r.pct} reached={r.reached} />
                </td>
                <td className="px-2.5 py-2 text-slate-600">
                  {r.lastResponse ? (
                    <span className="whitespace-nowrap">{r.lastResponse}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2.5 py-2 text-slate-600">{r.source ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: una tarjeta por plan */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <Link key={r.id} href={`/admin/planes#plan-${r.id}`} className="card block space-y-3">
            <div>
              <h3 className="font-semibold leading-tight">{r.questionnaire}</h3>
              <p className="text-sm text-slate-500">
                {r.company} · {r.location}
              </p>
            </div>
            <PctMeter pct={r.pct} reached={r.reached} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Realizadas / Meta</dt>
                <dd className="tabular-nums">
                  {r.done} / {r.target || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Vigencia</dt>
                <dd>
                  <DateRange from={r.windowStart} to={r.windowEnd} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Última encuesta</dt>
                <dd>
                  {r.lastResponse ? (
                    <span className="whitespace-nowrap">{r.lastResponse}</span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Origen</dt>
                <dd>{r.source ?? "—"}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </>
  );
}
