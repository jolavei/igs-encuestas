import { NextResponse } from "next/server";
import { apiUser } from "@/lib/rbac";
import { getMonthlyReport, isValidMonth, currentMonth } from "@/lib/reports/monthlyReport";
import { buildDeck } from "@/lib/reports/pptx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tope defensivo para el comentario libre de la diapositiva "Comentarios y sugerencias".
const MAX_COMENTARIOS = 3000;

async function generate(airportRaw: string, mesRaw: string, comentarios: string) {
  const airport = airportRaw.trim().toUpperCase();
  const mes = mesRaw || currentMonth();
  if (!airport) return NextResponse.json({ error: "Falta el aeropuerto." }, { status: 400 });
  if (!isValidMonth(mes)) return NextResponse.json({ error: "Mes inválido (YYYY-MM)." }, { status: 400 });

  const report = await getMonthlyReport(airport, mes);
  if (!report) {
    return NextResponse.json({ error: "Aeropuerto no encontrado o sin empresa asociada." }, { status: 404 });
  }

  const buffer = await buildDeck(report, comentarios.slice(0, MAX_COMENTARIOS));
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

// GET: descarga directa sin comentarios (enlaces simples).
export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const url = new URL(req.url);
  return generate(url.searchParams.get("airport") || "", url.searchParams.get("mes") || "", "");
}

// POST: descarga con posible diapositiva de comentarios y sugerencias.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  let body: { airport?: string; mes?: string; comentarios?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  const comentarios = typeof body.comentarios === "string" ? body.comentarios : "";
  return generate(body.airport || "", body.mes || "", comentarios);
}
