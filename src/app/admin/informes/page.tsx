import Link from "next/link";
import { listReportAirports, listReportAirportsBetween } from "@/lib/reports/monthlyReport";
import {
  KIND_LABEL,
  KIND_SLUG,
  REPORT_KINDS,
  currentMonth,
  defaultPeriodKey,
  kindFromSlug,
  periodOptions,
  resolvePeriod,
  seasonsOfAsqYear,
  type PeriodContext,
  type ReportKind,
} from "@/lib/reports/period";
import { moduleDef } from "@/lib/reports/modules";
import { loadEditions, type EditionState } from "@/lib/reports/editions";
import { monthlyReadiness, type ModuleReadiness } from "@/lib/reports/readiness";
import PeriodPicker from "@/components/reports/PeriodPicker";
import ReadinessChip from "@/components/reports/ReadinessChip";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium" }).format(new Date(iso));

function periodNote(ctx: PeriodContext): string {
  if (ctx.kind === "MENSUAL") {
    return `${ctx.label} en detalle, con el acumulado de la temporada ${ctx.season.label} hasta el cierre del mes.`;
  }
  const compare = ctx.compare.map((s) => s.label).join(" y ");
  if (ctx.kind === "SEMESTRAL") {
    return `${ctx.season.label} en detalle, comparada con ${compare}. Los evolutivos usan todas las temporadas disponibles.`;
  }
  const [su, wi] = seasonsOfAsqYear(Number(ctx.key));
  return `${ctx.season.label} en detalle, con ${su.label} y ${wi.label} comparadas. Los evolutivos usan todas las temporadas disponibles.`;
}

function editionStatus(ed: EditionState | undefined): string {
  if (!ed?.id) return "Sin edición";
  if (ed.status === "EMITIDO" && ed.emittedAt) return `Emitido el ${fmtDate(ed.emittedAt)}`;
  return ed.updatedAt ? `Borrador · guardado el ${fmtDate(ed.updatedAt)}` : "Borrador";
}

export default async function InformesIndex({
  searchParams,
}: {
  searchParams: { tipo?: string; periodo?: string; foco?: string; mes?: string };
}) {
  const kind: ReportKind = kindFromSlug(searchParams.tipo) ?? "MENSUAL";
  const today = currentMonth();
  // `?mes=` = enlaces antiguos del informe mensual.
  const requested = searchParams.periodo ?? (kind === "MENSUAL" ? searchParams.mes : undefined);
  const ctx =
    (requested && resolvePeriod(kind, requested, searchParams.foco)) ||
    resolvePeriod(kind, defaultPeriodKey(kind, today))!;

  const options = periodOptions(kind, today, 12);
  if (!options.some((o) => o.value === ctx.key)) options.unshift({ value: ctx.key, label: ctx.label });

  const airports =
    kind === "MENSUAL"
      ? await listReportAirports(ctx.key)
      : await listReportAirportsBetween(
          new Date(`${ctx.window.from}T00:00:00Z`),
          new Date(`${ctx.window.to}T23:59:59Z`)
        );
  const editions = await loadEditions(
    airports.map((a) => a.code),
    kind,
    ctx.key
  );
  const readiness: Map<string, ModuleReadiness> | null =
    kind === "MENSUAL" ? await monthlyReadiness(airports, ctx, editions) : null;

  const slug = KIND_SLUG[kind];
  const focus =
    kind === "ANUAL"
      ? {
          value: ctx.season.code,
          options: seasonsOfAsqYear(Number(ctx.key)).map((s) => ({ value: s.code, label: s.label })),
        }
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Informes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Un informe por aeropuerto con plan de trabajo vigente. Cada tarjeta muestra si los datos de cada módulo
          están listos.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm" aria-label="Tipo de informe">
          {REPORT_KINDS.map((k) => (
            <Link
              key={k}
              href={`/admin/informes?tipo=${KIND_SLUG[k]}`}
              aria-current={k === kind ? "page" : undefined}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                k === kind ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {KIND_LABEL[k]}
            </Link>
          ))}
        </nav>
        <PeriodPicker
          tipo={slug}
          label={kind === "MENSUAL" ? "Mes" : kind === "SEMESTRAL" ? "Temporada" : "Año"}
          value={ctx.key}
          options={options}
          focus={focus}
        />
      </div>

      <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-2 text-sm text-slate-600">
        {periodNote(ctx)}
        {kind !== "MENSUAL" && (
          <span className="block text-xs text-slate-500">
            El informe {KIND_LABEL[kind].toLowerCase()} se habilita en las próximas fases (tiempos y AGA primero,
            luego ACI ASQ). Ya puedes ver qué módulos tendrá cada aeropuerto.
          </span>
        )}
      </p>

      {airports.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Ningún aeropuerto con plan de trabajo vigente en {ctx.label}.
          <br />
          Revisa que existan planes activos (Planes de trabajo) y que el aeropuerto esté asociado a una empresa en
          Encuestas ASQ.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {airports.map((a) => {
            const ed = editions.get(a.code);
            const r = readiness?.get(a.code);
            const rows = (ed?.entries ?? [])
              .filter((e) => e.enabled)
              .map((e) => ({ def: moduleDef(e.key)!, ready: r?.[e.key] }))
              .filter((x) => x.ready?.state !== "na");
            return (
              <div key={a.code} className="card flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{a.code}</p>
                  <h2 className="truncate text-lg font-semibold text-slate-800">{a.name}</h2>
                  {a.sedeLabel && <p className="truncate text-sm text-slate-500">{a.sedeLabel}</p>}
                </div>

                <ul className="space-y-1.5 border-t border-slate-100 pt-3">
                  {rows.map(({ def, ready }) => (
                    <li key={def.key} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
                      <span className="text-slate-700">{def.label}</span>
                      {def.ready.includes(kind) ? (
                        ready && <ReadinessChip state={ready.state} text={ready.text} />
                      ) : (
                        <ReadinessChip state="off" text="Próxima fase" />
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-slate-500">{editionStatus(ed)}</span>
                  {kind === "MENSUAL" ? (
                    <Link
                      href={`/admin/informes/${slug}/${encodeURIComponent(a.code)}/${ctx.key}`}
                      className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
                    >
                      {ed?.id ? "Abrir edición" : "Preparar informe"}
                    </Link>
                  ) : (
                    <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-400">
                      Próximamente
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
