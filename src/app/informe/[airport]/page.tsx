import { requireUser } from "@/lib/rbac";
import { listReportPhotos } from "@/lib/reports/photos";
import { loadEdition } from "@/lib/reports/editions";
import { enabledKeys } from "@/lib/reports/modules";
import { loadReport, reportUrls, resolveReportParams } from "@/lib/reports/reportLoader";
import ReportDeck from "@/components/reports/ReportDeck";

// Vista imprimible de un informe (mensual, semestral o anual) sin el shell del panel,
// solo ADMIN. Módulos, análisis y comentarios salen de la edición guardada;
// `?comentarios=` (enlaces antiguos) reemplaza el comentario guardado solo en esta vista.
//   Mensual:   /informe/PMC?mes=2026-10
//   Semestral: /informe/PMC?tipo=semestral&periodo=SU26
//   Anual:     /informe/PMC?tipo=anual&periodo=2025&foco=WI25
export const dynamic = "force-dynamic";

function Fail({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center">
      <p className="text-lg font-medium text-slate-700">No se pudo generar el informe.</p>
      <p className="max-w-md text-sm text-slate-500">{text}</p>
      <a href="/admin/informes" className="text-sm text-brand-700 hover:underline">
        ← Volver a Informes
      </a>
    </div>
  );
}

export default async function InformePage({
  params,
  searchParams,
}: {
  params: { airport: string };
  searchParams: { mes?: string; tipo?: string; periodo?: string; foco?: string; comentarios?: string };
}) {
  await requireUser(["ADMIN"]);

  const code = decodeURIComponent(params.airport).trim().toUpperCase();
  const first = resolveReportParams(searchParams);
  if (!first) return <Fail text="El periodo pedido no es válido." />;
  const edition = await loadEdition(code, first.kind, first.key);
  // Anual: si no viene la temporada de detalle, la guardada en la edición.
  const ctx = resolveReportParams(searchParams, edition.focusSeason) ?? first;

  const modules = enabledKeys(edition.entries);
  const override = searchParams.comentarios?.slice(0, 3000);
  const comentarios = override ?? edition.comentarios;

  const [report, photoRows] = await Promise.all([
    loadReport(code, ctx, { modules }),
    modules.includes("fotos-comentarios") ? listReportPhotos(code, ctx.key) : Promise.resolve([]),
  ]);
  const photos = photoRows.map((p) => ({ id: p.id, caption: p.caption, url: `/api/reports/photos/${p.id}/raw` }));

  if (!report) {
    return <Fail text={`El aeropuerto “${code}” no está mapeado a una empresa (Encuestas ASQ → Empresa · sede) o no existe.`} />;
  }

  const urls = reportUrls(code, ctx);
  return (
    <ReportDeck
      data={report}
      modules={modules}
      notes={edition.notes}
      comentarios={comentarios}
      photos={photos}
      pptxHref={urls.pptx + (override !== undefined ? `&comentarios=${encodeURIComponent(override)}` : "")}
      backHref={urls.edit}
    />
  );
}
