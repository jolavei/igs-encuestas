import { NextResponse } from "next/server";
import { apiUser } from "@/lib/rbac";
import { getMonthlyReport, isValidMonth, currentMonth } from "@/lib/reports/monthlyReport";
import { buildDeck } from "@/lib/reports/pptx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const url = new URL(req.url);
  const airport = (url.searchParams.get("airport") || "").trim().toUpperCase();
  const mes = url.searchParams.get("mes") || currentMonth();
  if (!airport) return NextResponse.json({ error: "Falta el aeropuerto." }, { status: 400 });
  if (!isValidMonth(mes)) return NextResponse.json({ error: "Mes inválido (YYYY-MM)." }, { status: 400 });

  const report = await getMonthlyReport(airport, mes);
  if (!report) {
    return NextResponse.json({ error: "Aeropuerto no encontrado o sin empresa asociada." }, { status: 404 });
  }

  const buffer = await buildDeck(report);
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
