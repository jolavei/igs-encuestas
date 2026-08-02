// Consulta de "Mediciones de tiempos" a BigQuery, extraída de
// src/app/api/dashboard/tiempos/route.ts para reutilizarla también en la capa de
// datos de los informes mensuales (src/lib/reports/monthlyReport.ts).
//
// NO aplica RBAC: el caller (route o informe) resuelve el alcance y, para
// no-admin, pasa `scopeAirports` con los nombres canónicos permitidos.

import { bqQuery, bqProjectId } from "@/lib/bigquery";
import { hasAirline, hasFase, seasonFromAnchor, type Periodo, type Proceso, type Fase } from "@/lib/dashboardTiempos";

// Duración en minutos por proceso (t2 − t1). El proceso se valida contra el enum
// en el caller, así que la expresión sale de este whitelist (sin SQL de input libre).
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
export const CAP_MIN = 120;

export type Agg = { name: string; n: number; prom: number; med: number; p90: number };
export type Serie = { ym: string } & Omit<Agg, "name">;

const num = (v: unknown): number => (v == null ? 0 : Number((v as { value?: unknown }).value ?? v));

export type TiemposQueryParams = {
  proceso: Proceso;
  airport: string; // nombre canónico (location_name en BQ)
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  fase?: Fase;
  airline?: string;
  // Si se entrega, el resumen por aeropuerto se limita a estos nombres (no-admin).
  scopeAirports?: string[];
  // Solo la serie mensual (omite byAirport y seasons): usado por el informe, que
  // no necesita el resumen por aeropuerto ni la lista de temporadas.
  seriesOnly?: boolean;
};

export type TiemposQueryResult = { byAirport: Agg[]; series: Serie[]; seasons: Periodo[] };

/** Ejecuta las 3 consultas agregadas (byAirport, series mensual, temporadas con datos). */
export async function queryTiempos(p: TiemposQueryParams): Promise<TiemposQueryResult> {
  const { proceso, airport, desde, hasta, fase, airline, scopeAirports, seriesOnly } = p;

  const durExpr =
    proceso === "Retiro de equipajes" ? DUR_RETIRO[hasFase(proceso) ? fase ?? "espera" : "espera"] : DUR[proceso];

  // Aerolínea: Check in filtra por checkin_airline; Retiro por baggage_claim_airline.
  const useAirline = hasAirline(proceso) && !!airline;
  const airlineCol = proceso === "Check in" ? "checkin_airline" : "baggage_claim_airline";
  const airlineClause = useAirline ? ` AND ${airlineCol} = @airline` : "";
  const airportFilter = scopeAirports ? " AND location_name IN UNNEST(@airports)" : "";

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

  // Temporadas CON datos para este aeropuerto (fecha ancla: 1 abr = verano, 1 oct = invierno).
  const seasonsSql = `
    SELECT DISTINCT
      CASE
        WHEN EXTRACT(MONTH FROM DATETIME(responded_at, 'America/Santiago')) BETWEEN 4 AND 9
          THEN DATE(EXTRACT(YEAR FROM DATETIME(responded_at, 'America/Santiago')), 4, 1)
        WHEN EXTRACT(MONTH FROM DATETIME(responded_at, 'America/Santiago')) BETWEEN 10 AND 12
          THEN DATE(EXTRACT(YEAR FROM DATETIME(responded_at, 'America/Santiago')), 10, 1)
        ELSE DATE(EXTRACT(YEAR FROM DATETIME(responded_at, 'America/Santiago')) - 1, 10, 1)
      END AS anchor
    FROM ${table}
    WHERE location_name = @airport AND responded_at IS NOT NULL
    ORDER BY anchor DESC`;

  const params: Record<string, unknown> = { proceso, desde, hasta, airport, cap: CAP_MIN };
  if (useAirline) params.airline = airline;
  if (scopeAirports) params.airports = scopeAirports;

  const empty = Promise.resolve<Record<string, unknown>[]>([]);
  const [byAirportRaw, seriesRaw, seasonsRaw] = await Promise.all([
    seriesOnly ? empty : bqQuery<Record<string, unknown>>(byAirportSql, params),
    bqQuery<Record<string, unknown>>(seriesSql, params),
    seriesOnly ? empty : bqQuery<Record<string, unknown>>(seasonsSql, { airport }),
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

  const anchorStr = (r: Record<string, unknown>): string => {
    const a = r.anchor as { value?: unknown } | string | null;
    return String((a && typeof a === "object" ? a.value : a) ?? "");
  };
  const seasons = seasonsRaw
    .map(anchorStr)
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    .map(seasonFromAnchor);

  return { byAirport, series, seasons };
}

export type AirlineSerieRow = { airline: string; ym: string; n: number; prom: number };

/**
 * Serie mensual del PROMEDIO por aerolínea (una consulta agrupada), para los
 * mini-gráficos por aerolínea de Check in / Retiro. `airlineCol` = checkin_airline
 * (Check in) o baggage_claim_airline (Retiro).
 */
export async function queryTiemposByAirline(p: {
  proceso: Proceso;
  airport: string;
  desde: string;
  hasta: string;
  fase?: Fase;
}): Promise<AirlineSerieRow[]> {
  const { proceso, airport, desde, hasta, fase } = p;
  const durExpr =
    proceso === "Retiro de equipajes" ? DUR_RETIRO[hasFase(proceso) ? fase ?? "espera" : "espera"] : DUR[proceso];
  const airlineCol = proceso === "Check in" ? "checkin_airline" : "baggage_claim_airline";
  const table = `\`${bqProjectId()}.encuestas.mediciones_tiempos_consolidado\``;

  const sql = `
    SELECT airline, FORMAT_TIMESTAMP('%Y-%m', responded_at, 'America/Santiago') AS ym,
      COUNT(*) AS n, AVG(dur) AS prom
    FROM (
      SELECT ${airlineCol} AS airline, responded_at, ${durExpr} AS dur
      FROM ${table}
      WHERE process = @proceso
        AND DATE(responded_at, 'America/Santiago') BETWEEN DATE(@desde) AND DATE(@hasta)
        AND location_name = @airport
        AND ${airlineCol} IS NOT NULL AND ${airlineCol} != ''
    )
    WHERE dur > 0 AND dur <= @cap
    GROUP BY airline, ym
    ORDER BY airline, ym`;

  const rows = await bqQuery<Record<string, unknown>>(sql, { proceso, desde, hasta, airport, cap: CAP_MIN });
  return rows.map((r) => ({ airline: String(r.airline), ym: String(r.ym), n: num(r.n), prom: num(r.prom) }));
}
