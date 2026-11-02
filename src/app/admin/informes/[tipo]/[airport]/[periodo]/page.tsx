import Link from "next/link";
import { notFound } from "next/navigation";
import { getReportAirportItem } from "@/lib/reports/monthlyReport";
import { KIND_LABEL, KIND_SLUG, kindFromSlug, resolvePeriod, seasonsOfAsqYear } from "@/lib/reports/period";
import { loadEdition } from "@/lib/reports/editions";
import { monthlyReadiness, seasonOverview, type ModuleReadiness } from "@/lib/reports/readiness";
import { loadReport, reportUrls } from "@/lib/reports/reportLoader";
import ReportEditor from "@/components/reports/ReportEditor";

export const dynamic = "force-dynamic";

// Editor de la edición de un informe (mensual, semestral o anual): módulos, análisis,
// comentarios, fotos y estado. En el anual, ?foco= elige la temporada de detalle.
export default async function EditarInforme({
  params,
  searchParams,
}: {
  params: { tipo: string; airport: string; periodo: string };
  searchParams: { foco?: string };
}) {
  const kind = kindFromSlug(params.tipo);
  const code = decodeURIComponent(params.airport).trim().toUpperCase();
  const base = kind ? resolvePeriod(kind, params.periodo) : null;
  if (!kind || !base) notFound();

  const edition = await loadEdition(code, kind, base.key);
  const ctx = resolvePeriod(kind, base.key, searchParams.foco ?? edition.focusSeason) ?? base;
  const airport = await getReportAirportItem(code, kind === "MENSUAL" ? ctx.key : ctx.season.to.slice(0, 7));
  if (!airport) notFound();

  // El informe completo (todos los módulos) alimenta la vista previa de diapositivas:
  // al encender un módulo, sus diapositivas aparecen sin recargar.
  const [report, readiness] = await Promise.all([
    loadReport(code, ctx),
    kind === "MENSUAL"
      ? monthlyReadiness([airport], ctx, new Map([[code, edition]])).then((m) => m.get(code) ?? {})
      : seasonOverview(ctx).then((o) => o.readiness.get(code) ?? ({} as ModuleReadiness)),
  ]);
  const urls = reportUrls(code, ctx);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/admin/informes?tipo=${KIND_SLUG[kind]}&periodo=${ctx.key}${kind === "ANUAL" ? `&foco=${ctx.season.code}` : ""}`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Informes
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {airport.code} · Informe {KIND_LABEL[kind].toLowerCase()} · {ctx.label}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {airport.name} ·{" "}
          {kind === "MENSUAL"
            ? `temporada ${ctx.season.label}`
            : kind === "ANUAL"
              ? `${seasonsOfAsqYear(Number(ctx.key))
                  .map((s) => s.label)
                  .join(" + ")} · detalle ${ctx.season.label}`
              : `${ctx.window.from.split("-").reverse().join("-")} a ${ctx.window.to.split("-").reverse().join("-")}`}
          . Lo que escribas queda guardado en esta edición.
        </p>
      </div>

      <ReportEditor
        airport={code}
        kind={kind}
        periodKey={ctx.key}
        focusSeason={kind === "ANUAL" ? ctx.season.code : null}
        focusOptions={
          kind === "ANUAL" ? seasonsOfAsqYear(Number(ctx.key)).map((s) => ({ value: s.code, label: s.label })) : []
        }
        urls={urls}
        initial={edition}
        readiness={readiness}
        outlineData={{
          kind,
          processes: (report?.processes ?? []).map((p) => ({
            proceso: p.proceso,
            faseLabel: p.faseLabel,
            service: p.service?.kpi ? { kpi: true } : null,
          })),
          aga: (report?.aga ?? []).map((a) => ({
            audience: a.audience,
            month: { n: a.month.n },
            voice: { appraisal: a.voice.appraisal, quotes: a.voice.quotes.map(() => null) },
          })),
          seasonal: report?.seasonal
            ? {
                tiemposHistory: { seasons: report.seasonal.tiemposHistory.seasons },
                tiemposHot: report.seasonal.tiemposHot.map(() => null),
                asq: report.seasonal.asq
                  ? { groups: report.seasonal.asq.groups.map(() => null), history: report.seasonal.asq.history.map(() => null) }
                  : null,
              }
            : undefined,
        }}
      />
    </div>
  );
}
