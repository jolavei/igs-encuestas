import { NextResponse } from "next/server";
import { apiUser } from "@/lib/rbac";
import { getMonthlyReport, isValidMonth, currentMonth } from "@/lib/reports/monthlyReport";
import { listReportPhotos } from "@/lib/reports/photos";
import { downloadObject } from "@/lib/gcs";
import { buildDeck, type DeckPhotoData } from "@/lib/reports/pptx";
import { loadEdition } from "@/lib/reports/editions";
import { enabledKeys } from "@/lib/reports/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tope defensivo para el comentario libre de la diapositiva "Comentarios y sugerencias".
const MAX_COMENTARIOS = 3000;

// Módulos, análisis y comentarios salen de la edición guardada; `comentarios` (si
// viene) reemplaza el comentario guardado solo en esta descarga.
async function generate(airportRaw: string, mesRaw: string, comentariosOverride: string | null) {
  const airport = airportRaw.trim().toUpperCase();
  const mes = mesRaw || currentMonth();
  if (!airport) return NextResponse.json({ error: "Falta el aeropuerto." }, { status: 400 });
  if (!isValidMonth(mes)) return NextResponse.json({ error: "Mes inválido (YYYY-MM)." }, { status: 400 });

  const edition = await loadEdition(airport, "MENSUAL", mes);
  const modules = enabledKeys(edition.entries);
  const report = await getMonthlyReport(airport, mes, { modules });
  if (!report) {
    return NextResponse.json({ error: "Aeropuerto no encontrado o sin empresa asociada." }, { status: 404 });
  }

  const photoRows = modules.includes("fotos-comentarios") ? await listReportPhotos(airport, mes) : [];
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
  const filename = `${mes.replace("-", "")} ${airport} Informe Mensual.pptx`;

  // Response acepta una vista de buffer en runtime; el tipo BodyInit de este
  // setup no reconoce Uint8Array genérico, de ahí el cast.
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// GET: descarga directa (enlace desde el informe HTML y el editor).
export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const url = new URL(req.url);
  return generate(
    url.searchParams.get("airport") || "",
    url.searchParams.get("mes") || "",
    url.searchParams.get("comentarios")
  );
}

// POST: igual que GET, con el comentario en el cuerpo (compatibilidad).
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  let body: { airport?: string; mes?: string; comentarios?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const comentarios = typeof body.comentarios === "string" ? body.comentarios : null;
  return generate(body.airport || "", body.mes || "", comentarios);
}
