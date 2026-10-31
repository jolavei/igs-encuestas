import { NextResponse } from "next/server";
import { apiUser } from "@/lib/rbac";
import { listReportPhotos } from "@/lib/reports/photos";
import { downloadObject } from "@/lib/gcs";
import { buildDeck, type DeckPhotoData } from "@/lib/reports/pptx";
import { loadEdition } from "@/lib/reports/editions";
import { enabledKeys } from "@/lib/reports/modules";
import { loadReport, reportFileName, resolveReportParams, type ReportParams } from "@/lib/reports/reportLoader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El semestral/anual consulta el histórico completo en BigQuery: puede tardar más que el mensual.
export const maxDuration = 60;

// Tope defensivo para el comentario libre de la diapositiva "Comentarios y sugerencias".
const MAX_COMENTARIOS = 3000;

// Módulos, análisis y comentarios salen de la edición guardada; `comentarios` (si
// viene) reemplaza el comentario guardado solo en esta descarga.
async function generate(airportRaw: string, params: ReportParams, comentariosOverride: string | null) {
  const airport = airportRaw.trim().toUpperCase();
  if (!airport) return NextResponse.json({ error: "Falta el aeropuerto." }, { status: 400 });
  const first = resolveReportParams(params);
  if (!first) return NextResponse.json({ error: "Periodo inválido." }, { status: 400 });

  const edition = await loadEdition(airport, first.kind, first.key);
  const ctx = resolveReportParams(params, edition.focusSeason) ?? first;
  const modules = enabledKeys(edition.entries);
  const report = await loadReport(airport, ctx, { modules });
  if (!report) {
    return NextResponse.json({ error: "Aeropuerto no encontrado o sin empresa asociada." }, { status: 404 });
  }

  const photoRows = modules.includes("fotos-comentarios") ? await listReportPhotos(airport, ctx.key) : [];
  const photos: DeckPhotoData[] = await Promise.all(
    photoRows.map(async (p) => {
      const bytes = await downloadObject(p.objectPath);
      return { caption: p.caption, dataUri: `data:${p.contentType};base64,${bytes.toString("base64")}` };
    })
  );

  const buffer = await buildDeck(report, {
    modules,
    notes: edition.notes,
    comentarios: (comentariosOverride ?? edition.comentarios).slice(0, MAX_COMENTARIOS),
    photos,
  });

  // Response acepta una vista de buffer en runtime; el tipo BodyInit de este
  // setup no reconoce Uint8Array genérico, de ahí el cast.
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${reportFileName(airport, ctx)}"`,
      "Cache-Control": "no-store",
    },
  });
}

// GET: descarga directa (enlace desde el informe HTML y el editor).
//   ?airport=PMC&mes=2026-10 · ?airport=PMC&tipo=semestral&periodo=SU26 · ?…&tipo=anual&periodo=2025&foco=WI25
export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const q = new URL(req.url).searchParams;
  return generate(
    q.get("airport") || "",
    { tipo: q.get("tipo"), periodo: q.get("periodo"), mes: q.get("mes"), foco: q.get("foco") },
    q.get("comentarios")
  );
}

// POST: igual que GET, con los parámetros y el comentario en el cuerpo (compatibilidad).
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  let body: ReportParams & { airport?: string; comentarios?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const comentarios = typeof body.comentarios === "string" ? body.comentarios : null;
  return generate(body.airport || "", body, comentarios);
}
