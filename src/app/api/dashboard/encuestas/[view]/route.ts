import { NextResponse } from "next/server";
import { apiUser } from "@/lib/rbac";
import { isValidMonth } from "@/lib/reports/monthlyReport";
import { getSurveyDashboard } from "@/lib/surveys/data";
import { isSurveyViewKey } from "@/lib/surveys/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Datos del Dashboard de un cuestionario de experiencia (AGA Pasajeros / Acompañantes / Hotel).
// Filtros: plan (id | "all"), mes ("YYYY-MM" | "all"), segmento (pregunta + valor).
export async function GET(req: Request, { params }: { params: { view: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  if (!isSurveyViewKey(params.view)) return NextResponse.json({ error: "Vista inválida." }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const mes = sp.get("mes");
  if (mes && mes !== "all" && !isValidMonth(mes)) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }
  const data = await getSurveyDashboard(params.view, {
    plan: sp.get("plan") || null,
    mes: mes || null,
    segQ: sp.get("segQ") || null,
    segV: sp.get("segV") || null,
  });
  return NextResponse.json(data);
}
