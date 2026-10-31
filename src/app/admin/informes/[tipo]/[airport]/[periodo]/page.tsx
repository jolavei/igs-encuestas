import Link from "next/link";
import { notFound } from "next/navigation";
import { getMonthlyReport, getReportAirportItem } from "@/lib/reports/monthlyReport";
import { KIND_LABEL, kindFromSlug, resolvePeriod } from "@/lib/reports/period";
import { loadEdition } from "@/lib/reports/editions";
import { monthlyReadiness } from "@/lib/reports/readiness";
import ReportEditor from "@/components/reports/ReportEditor";

export const dynamic = "force-dynamic";

// Editor de la edición de un informe: módulos, análisis, comentarios, fotos y estado.
// Por ahora solo el mensual genera diapositivas; semestral y anual llegan en las
// próximas fases.
export default async function EditarInforme({
  params,
}: {
  params: { tipo: string; airport: string; periodo: string };
}) {
  const kind = kindFromSlug(params.tipo);
  const code = decodeURIComponent(params.airport).trim().toUpperCase();
  const ctx = kind ? resolvePeriod(kind, params.periodo) : null;
  if (!kind || !ctx || kind !== "MENSUAL") notFound();

  const airport = await getReportAirportItem(code, ctx.key);
  if (!airport) notFound();

  // El informe completo (todos los módulos) alimenta la vista previa de diapositivas:
  // al encender un módulo, sus diapositivas aparecen sin recargar.
  const [edition, report] = await Promise.all([loadEdition(code, kind, ctx.key), getMonthlyReport(code, ctx.key)]);
  const readiness = (await monthlyReadiness([airport], ctx, new Map([[code, edition]]))).get(code) ?? {};

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/admin/informes?tipo=mensual&periodo=${ctx.key}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← Informes
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {airport.code} · Informe {KIND_LABEL[kind].toLowerCase()} · {ctx.label}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {airport.name} · temporada {ctx.season.label}. Lo que escribas queda guardado en esta edición.
        </p>
      </div>

      <ReportEditor
        airport={code}
        kind={kind}
        periodKey={ctx.key}
        initial={edition}
        readiness={readiness}
        outlineData={{
          processes: (report?.processes ?? []).map((p) => ({ proceso: p.proceso, faseLabel: p.faseLabel })),
          aga: (report?.aga ?? []).map((a) => ({
            audience: a.audience,
            voice: { appraisal: a.voice.appraisal, quotes: a.voice.quotes.map(() => null) },
          })),
        }}
      />
    </div>
  );
}
