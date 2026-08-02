import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { BigQueryCredentialsError } from "@/lib/bigquery";
import { PROCESOS, FASES, AIRPORTS, AIRLINES } from "@/lib/dashboardTiempos";
import { getScopedTiemposAirports } from "@/lib/dashboardTiemposScope";
import { queryTiempos } from "@/lib/reports/tiemposQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  proceso: z.enum(PROCESOS),
  airport: z.enum(AIRPORTS.map((a) => a.name) as [string, ...string[]]),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fase: z.enum(FASES).optional(),
  airline: z.enum(AIRLINES).optional(),
});

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "SURVEYOR", "CLIENT"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const url = new URL(req.url);
  const parsed = schema.safeParse({
    proceso: url.searchParams.get("proceso"),
    airport: url.searchParams.get("airport"),
    desde: url.searchParams.get("desde"),
    hasta: url.searchParams.get("hasta"),
    fase: url.searchParams.get("fase") ?? undefined,
    airline: url.searchParams.get("airline") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }
  const { proceso, airport, desde, hasta, fase, airline } = parsed.data;

  // Alcance: encuestador/cliente sólo pueden consultar los aeropuertos donde el
  // cuestionario está habilitado y vigente para su usuario (ADMIN ve todos).
  const allowed = await getScopedTiemposAirports({ id: user.id, role: user.role });
  const allowedNames = allowed.map((a) => a.name);
  if (!allowedNames.includes(airport)) {
    return NextResponse.json({ error: "Aeropuerto fuera de tu alcance." }, { status: 403 });
  }
  const isAdmin = user.role === "ADMIN";

  try {
    const data = await queryTiempos({
      proceso,
      airport,
      desde,
      hasta,
      fase,
      airline,
      scopeAirports: isAdmin ? undefined : allowedNames,
    });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof BigQueryCredentialsError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : "Error consultando BigQuery.";
    return NextResponse.json({ error: msg, code: "BQ_QUERY_ERROR" }, { status: 502 });
  }
}
