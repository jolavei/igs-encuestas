import { NextResponse } from "next/server";
import { apiUser } from "@/lib/rbac";
import { getBasePage } from "@/lib/responseBase/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Base de respuestas de un plan de trabajo: un tramo de envíos en formato ancho (una fila
// por envío, una columna por pregunta). ?cursor=<id del último envío del tramo anterior>.
export async function GET(req: Request, { params }: { params: { planId: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const cursor = new URL(req.url).searchParams.get("cursor");
  if (cursor && cursor.length > 60) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }
  const page = await getBasePage(params.planId, cursor || null);
  if (!page) return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  return NextResponse.json(page);
}
