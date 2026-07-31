import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { bqQuery, bqProjectId, BigQueryCredentialsError } from "@/lib/bigquery";
import { PROCESOS, FASES, AIRPORTS, AIRLINES, hasAirline, hasFase } from "@/lib/dashboardTiempos";
import { getScopedTiemposAirports } from "@/lib/dashboardTiemposScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Duración en minutos por proceso (t2 − t1), calculada desde las columnas de
// hora (TIMESTAMP) de la tabla consolidada. El proceso se valida contra el enum,
// así que la expresión se elige de este whitelist (no hay SQL con input libre).
const DUR: Record<string, string> = {
  "Check in": "TIMESTAMP_DIFF(checkin_t2, checkin_t1, SECOND) / 60.0",
  AVSEC: "TIMESTAMP_DIFF(avsec_t2, avsec_t1, SECOND) / 60.0",
  "Pasaporte emigración": "TIMESTAMP_DIFF(passport_outbound_t2, passport_outbound_t1, SECOND) / 60.0",
  "Pasaporte inmigración": "TIMESTAMP_DIFF(passport_inbound_t2, passport_inbound_t1, SECOND) / 60.0",
  "Control aduana / SAG": "TIMESTAMP_DIFF(border_protection_t2, border_protection_t1, SECOND) / 60.0",
};
// Retiro de equipajes en dos fases: espera 1ª maleta (t2−t1) y descarga de correa (t3−t2).
const DUR_RETIRO: Record<string, string> = {
  espera: "TIMESTAMP_DIFF(baggage_claim_t2, baggage_claim_t1, SECOND) / 60.0",
  descarga: "TIMESTAMP_DIFF(baggage_claim_t3, baggage_claim_t2, SECOND) / 60.0",
};

// Se descartan duraciones no positivas (horas invertidas) y absurdas (> 2 h).
const CAP_MIN = 120;

const schema = z.object({
  proceso: z.enum(PROCESOS),
  airport: z.enum(AIRPORTS.map((a) => a.name) as [string, ...string[]]),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fase: z.enum(FASES).optional(),
  airline: z.enum(AIRLINES).optional(),
});

type Agg = { name: string; n: number; prom: number; med: number; p90: number };
type Serie = { ym: string } & Omit<Agg, "name">;

const num = (v: unknown): number => (v == null ? 0 : Number((v as { value?: unknown }).value ?? v));

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

  const durExpr =
    proceso === "Retiro de equipajes" ? DUR_RETIRO[hasFase(proceso) ? fase ?? "espera" : "espera"] : DUR[proceso];

  // Aerolínea: Check in filtra por checkin_airline; Retiro por baggage_claim_airline.
  const useAirline = hasAirline(proceso) && !!airline;
  const airlineCol = proceso === "Check in" ? "checkin_airline" : "baggage_claim_airline";
  const airlineClause = useAirline ? ` AND ${airlineCol} = @airline` : "";
  // Para no-admin, el resumen por aeropuerto se limita a sus aeropuertos.
  const airportFilter = isAdmin ? "" : " AND location_name IN UNNEST(@airports)";

  const table = `\`${bqProjectId()}.encuestas.mediciones_tiempos_consolidado\``;
  const common =
    "process = @proceso" +
    " AND DATE(responded_at, 'America/Santiago') BETWEEN DATE(@desde) AND DATE(@hasta)" +
    airlineClause;

  const byAirportSql = `
    SELECT location_name AS name, COUNT(*) AS n, AVG(dur) AS prom,
      APPROX_QUANTILES(dur, 100)[OFFSET(50)] AS med,
      APPROX_QUANTILES(dur, 100)[OFFSET(90)] AS p90
    FROM (SELECT location_name, ${durExpr} AS dur FROM ${table} WHERE ${common}${airportFilter})
    WHERE dur > 0 AND dur <= @cap
    GROUP BY name`;

  const seriesSql = `
    SELECT FORMAT_TIMESTAMP('%Y-%m', responded_at, 'America/Santiago') AS ym,
      COUNT(*) AS n, AVG(dur) AS prom,
      APPROX_QUANTILES(dur, 100)[OFFSET(50)] AS med,
      APPROX_QUANTILES(dur, 100)[OFFSET(90)] AS p90
    FROM (SELECT responded_at, ${durExpr} AS dur FROM ${table} WHERE ${common} AND location_name = @airport)
    WHERE dur > 0 AND dur <= @cap
    GROUP BY ym ORDER BY ym`;

  const params: Record<string, unknown> = { proceso, desde, hasta, airport, cap: CAP_MIN };
  if (useAirline) params.airline = airline;
  if (!isAdmin) params.airports = allowedNames;

  try {
    const [byAirportRaw, seriesRaw] = await Promise.all([
      bqQuery<Record<string, unknown>>(byAirportSql, params),
      bqQuery<Record<string, unknown>>(seriesSql, params),
    ]);

    const byAirport: Agg[] = byAirportRaw.map((r) => ({
      name: String(r.name),
      n: num(r.n),
      prom: num(r.prom),
      med: num(r.med),
      p90: num(r.p90),
    }));
    const series: Serie[] = seriesRaw.map((r) => ({
      ym: String(r.ym),
      n: num(r.n),
      prom: num(r.prom),
      med: num(r.med),
      p90: num(r.p90),
    }));

    return NextResponse.json({ byAirport, series });
  } catch (e) {
    if (e instanceof BigQueryCredentialsError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : "Error consultando BigQuery.";
    return NextResponse.json({ error: msg, code: "BQ_QUERY_ERROR" }, { status: 502 });
  }
}
