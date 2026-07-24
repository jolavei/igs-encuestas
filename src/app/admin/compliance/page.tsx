import { prisma } from "@/lib/prisma";
import SeasonPicker from "@/components/SeasonPicker";
import AsqAirportMapper from "@/components/AsqAirportMapper";
import SyncBubble from "@/components/SyncBubble";

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

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: { season?: string };
}) {
  const seasons = await prisma.asqComplianceRun.findMany({
    distinct: ["seasonLabel"],
    select: { seasonLabel: true, season: true, year: true },
    // Cronológico, más reciente primero: dentro de un mismo año de inicio, el invierno
    // (Oct–Mar) es posterior al verano (Abr–Sep) => season desc pone WINTER antes.
    orderBy: [{ year: "desc" }, { season: "desc" }],
  });

  if (seasons.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Encuestas ASQ</h1>
          <SyncBubble syncedAt={null} />
        </div>
        <p className="max-w-2xl text-slate-500">
          Aún no hay datos. Corre el scraper con{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">npm run scrape:asq</code>{" "}
          para descargar la información desde el portal ACI-ASQ (aeropuertos × temporadas).
        </p>
      </div>
    );
  }

  const active =
    searchParams.season && seasons.some((s) => s.seasonLabel === searchParams.season)
      ? searchParams.season
      : seasons[0].seasonLabel;

  const [runs, companies, mappings] = await Promise.all([
    prisma.asqComplianceRun.findMany({
      where: { seasonLabel: active },
      include: { rows: { orderBy: { airlineDestination: "asc" } } },
      orderBy: { airport: "asc" },
    }),
    prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true, locations: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.asqAirportMapping.findMany(),
  ]);
  const mapByAirport = new Map(mappings.map((m) => [m.airport, m]));

  const perAirport = runs.map((r) => {
    const target = r.rows.reduce((a, b) => a + b.target, 0);
    const collected = r.rows.reduce((a, b) => a + b.collected, 0);
    return { run: r, target, collected };
  });
  const lastScraped = runs.reduce<Date | null>(
    (acc, r) => (!acc || r.scrapedAt > acc ? r.scrapedAt : acc),
    null
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Encabezado */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Encuestas ASQ</h1>
          <SyncBubble syncedAt={lastScraped} />
        </div>
        <SeasonPicker seasons={seasons} active={active} />
      </div>

      {/* Cajas de avance por aeropuerto (clic -> baja a su tabla) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {perAirport.map(({ run, target, collected }) => (
          <a
            key={run.id}
            href={`#aeropuerto-${run.airport}`}
            className="card group transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50/40"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">{run.airport}</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {collected}
              <span className="text-base font-medium text-slate-400"> / {target || "—"}</span>
            </p>
            <p className="flex items-center justify-between text-sm">
              <Pct done={collected} target={target} />
              <span className="text-brand-500 opacity-0 transition-opacity group-hover:opacity-100">
                ver detalle ↓
              </span>
            </p>
          </a>
        ))}
      </div>

      {/* Una tabla por aeropuerto */}
      <div className="space-y-6">
        {perAirport.map(({ run, target, collected }) => (
          <div
            key={run.id}
            id={`aeropuerto-${run.airport}`}
            className="card space-y-3 scroll-mt-20"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {run.airport}
                <span className="ml-2 text-sm font-normal text-slate-400">{run.seasonLabel}</span>
              </h2>
              <span className="text-sm text-slate-500">
                {collected} / {target || "—"} · <Pct done={collected} target={target} />
              </span>
            </div>

            {/* Empresa + sede asociada a este aeropuerto */}
            <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-2 sm:flex-row sm:items-center">
              <span className="shrink-0 text-sm text-slate-500 sm:w-36">Empresa · sede:</span>
              <AsqAirportMapper
                airport={run.airport}
                companyId={mapByAirport.get(run.airport)?.companyId ?? null}
                locationId={mapByAirport.get(run.airport)?.locationId ?? null}
                companies={companies}
              />
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
                  {run.rows.map((row) => (
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
                    <td className="px-3 py-2 text-slate-500">Total {run.airport}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{target}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{collected}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Pct done={collected} target={target} />
                    </td>
                  </tr>
                  {run.rows.length === 0 && (
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
    </div>
  );
}
