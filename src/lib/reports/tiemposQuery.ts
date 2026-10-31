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

// Se descartan duraciones negativas (horas invertidas) y absurdas (> 2 h). El 0 SÍ
// cuenta: los formularios capturan HH:MM, así que una medición de menos de un minuto
// (p. ej. autoservicio de quiosco muy rápido) queda como 0 y es una medición válida.
export const CAP_MIN = 120;

// Corte de fuente para el informe mensual (NO afecta al dashboard): hasta septiembre
// de 2026 inclusive se informa solo con el histórico de Google Sheets (origen
// "form_historico"); desde octubre de 2026 solo con lo levantado en la app propia
// (origen "app"). Ver dataform/mediciones_tiempos_consolidado.sqlx.
export const REPORT_SOURCE_CUTOFF = "2026-10-01";
const reportSourceClause =
  " AND ((DATE(responded_at, 'America/Santiago') < DATE(@sourceCutoff) AND origen = 'form_historico')" +
  " OR (DATE(responded_at, 'America/Santiago') >= DATE(@sourceCutoff) AND origen = 'app'))";

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
  // Omite sólo la consulta de temporadas (el informe sí usa byAirport = agregado
  // del periodo, pero no necesita la lista de temporadas).
  skipSeasons?: boolean;
  // Aplica el corte de fuente del informe mensual (ver REPORT_SOURCE_CUTOFF). El
  // dashboard NO lo usa (sigue mezclando Sheets + app en todo el histórico).
  reportSource?: boolean;
};

export type TiemposQueryResult = { byAirport: Agg[]; series: Serie[]; seasons: Periodo[] };

/** Ejecuta las 3 consultas agregadas (byAirport, series mensual, temporadas con datos). */
export async function queryTiempos(p: TiemposQueryParams): Promise<TiemposQueryResult> {
  const { proceso, airport, desde, hasta, fase, airline, scopeAirports, seriesOnly, skipSeasons, reportSource } = p;

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
    airlineClause +
    (reportSource ? reportSourceClause : "");

  const byAirportSql = `
    SELECT location_name AS name, COUNT(*) AS n, AVG(dur) AS prom,
      APPROX_QUANTILES(dur, 100)[OFFSET(50)] AS med,
      APPROX_QUANTILES(dur, 100)[OFFSET(90)] AS p90
    FROM (SELECT location_name, ${durExpr} AS dur FROM ${table} WHERE ${common}${airportFilter})
    WHERE dur >= 0 AND dur <= @cap
    GROUP BY name`;

  const seriesSql = `
    SELECT FORMAT_TIMESTAMP('%Y-%m', responded_at, 'America/Santiago') AS ym,
      COUNT(*) AS n, AVG(dur) AS prom,
      APPROX_QUANTILES(dur, 100)[OFFSET(50)] AS med,
      APPROX_QUANTILES(dur, 100)[OFFSET(90)] AS p90
    FROM (SELECT responded_at, ${durExpr} AS dur FROM ${table} WHERE ${common} AND location_name = @airport)
    WHERE dur >= 0 AND dur <= @cap
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
  if (reportSource) params.sourceCutoff = REPORT_SOURCE_CUTOFF;

  const empty = Promise.resolve<Record<string, unknown>[]>([]);
  const [byAirportRaw, seriesRaw, seasonsRaw] = await Promise.all([
    seriesOnly ? empty : bqQuery<Record<string, unknown>>(byAirportSql, params),
    bqQuery<Record<string, unknown>>(seriesSql, params),
    seriesOnly || skipSeasons ? empty : bqQuery<Record<string, unknown>>(seasonsSql, { airport }),
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
  reportSource?: boolean;
}): Promise<AirlineSerieRow[]> {
  const { proceso, airport, desde, hasta, fase, reportSource } = p;
  const durExpr =
    proceso === "Retiro de equipajes" ? DUR_RETIRO[hasFase(proceso) ? fase ?? "espera" : "espera"] : DUR[proceso];
  const baseCol = proceso === "Check in" ? "checkin_airline" : "baggage_claim_airline";
  // En Retiro la aerolínea NO tiene modalidad: se une el sufijo "- Counter/Quiosco"
  // que arrastra el histórico (LATAM Airlines - Counter -> LATAM Airlines).
  const airlineExpr =
    proceso === "Retiro de equipajes" ? `REGEXP_REPLACE(${baseCol}, r' - (Counter|Quiosco)$', '')` : baseCol;
  const table = `\`${bqProjectId()}.encuestas.mediciones_tiempos_consolidado\``;

  const sql = `
    SELECT airline, FORMAT_TIMESTAMP('%Y-%m', responded_at, 'America/Santiago') AS ym,
      COUNT(*) AS n, AVG(dur) AS prom
    FROM (
      SELECT ${airlineExpr} AS airline, responded_at, ${durExpr} AS dur
      FROM ${table}
      WHERE process = @proceso
        AND DATE(responded_at, 'America/Santiago') BETWEEN DATE(@desde) AND DATE(@hasta)
        AND location_name = @airport
        AND ${baseCol} IS NOT NULL AND ${baseCol} != ''${reportSource ? reportSourceClause : ""}
    )
    WHERE dur >= 0 AND dur <= @cap
    GROUP BY airline, ym
    ORDER BY airline, ym`;

  const params: Record<string, unknown> = { proceso, desde, hasta, airport, cap: CAP_MIN };
  if (reportSource) params.sourceCutoff = REPORT_SOURCE_CUTOFF;
  const rows = await bqQuery<Record<string, unknown>>(sql, params);
  return rows.map((r) => ({ airline: String(r.airline), ym: String(r.ym), n: num(r.n), prom: num(r.prom) }));
}

export type TiemposCount = { airport: string; window: number; month: number };

/**
 * Cantidad de mediciones por aeropuerto en una ventana (todas las procesos/fases,
 * con el corte de fuente del informe), y cuántas caen en `month` ("YYYY-MM").
 * La usa la página de Informes para mostrar si el módulo de tiempos tiene datos.
 */
export async function countTiemposByAirport(p: {
  airports: string[];
  desde: string;
  hasta: string;
  month: string;
}): Promise<TiemposCount[]> {
  const table = `\`${bqProjectId()}.encuestas.mediciones_tiempos_consolidado\``;
  const sql = `
    SELECT location_name AS airport, COUNT(*) AS w,
      COUNTIF(FORMAT_TIMESTAMP('%Y-%m', responded_at, 'America/Santiago') = @month) AS m
    FROM ${table}
    WHERE location_name IN UNNEST(@airports)
      AND DATE(responded_at, 'America/Santiago') BETWEEN DATE(@desde) AND DATE(@hasta)${reportSourceClause}
    GROUP BY airport`;
  const rows = await bqQuery<Record<string, unknown>>(sql, {
    airports: p.airports,
    desde: p.desde,
    hasta: p.hasta,
    month: p.month,
    sourceCutoff: REPORT_SOURCE_CUTOFF,
  });
  return rows.map((r) => ({ airport: String(r.airport), window: num(r.w), month: num(r.m) }));
}

// ---------------------------------------------------------------------------
// Informes semestrales / anuales
// ---------------------------------------------------------------------------

const durExprOf = (proceso: Proceso, fase?: Fase) =>
  proceso === "Retiro de equipajes" ? DUR_RETIRO[hasFase(proceso) ? fase ?? "espera" : "espera"] : DUR[proceso];

// Inicio de la medición de cada proceso (para la franja horaria).
const T1: Record<string, string> = {
  "Check in": "checkin_t1",
  AVSEC: "avsec_t1",
  "Pasaporte emigración": "passport_outbound_t1",
  "Pasaporte inmigración": "passport_inbound_t1",
  "Control aduana / SAG": "border_protection_t1",
  "Retiro de equipajes": "baggage_claim_t1",
};

// Código de temporada ASQ ("SU26" / "WI25") de la fecha de respuesta, en hora de Chile.
const SEASON_CODE_SQL = `
  CASE
    WHEN EXTRACT(MONTH FROM DATETIME(responded_at, 'America/Santiago')) BETWEEN 4 AND 9
      THEN CONCAT('SU', FORMAT('%02d', MOD(EXTRACT(YEAR FROM DATETIME(responded_at, 'America/Santiago')), 100)))
    WHEN EXTRACT(MONTH FROM DATETIME(responded_at, 'America/Santiago')) >= 10
      THEN CONCAT('WI', FORMAT('%02d', MOD(EXTRACT(YEAR FROM DATETIME(responded_at, 'America/Santiago')), 100)))
    ELSE CONCAT('WI', FORMAT('%02d', MOD(EXTRACT(YEAR FROM DATETIME(responded_at, 'America/Santiago')) - 1, 100)))
  END`;

export type SeasonAggRow = { code: string; n: number; prom: number; med: number; p90: number };

/**
 * Agregado por temporada de un proceso en un aeropuerto, desde el inicio del histórico
 * hasta `hasta`, con el corte de fuente del informe (Sheets antes del 1-oct-2026, web después).
 */
export async function queryTiemposBySeason(p: {
  proceso: Proceso;
  fase?: Fase;
  airport: string;
  hasta: string;
}): Promise<SeasonAggRow[]> {
  const table = `\`${bqProjectId()}.encuestas.mediciones_tiempos_consolidado\``;
  const sql = `
    SELECT code, COUNT(*) AS n, AVG(dur) AS prom,
      APPROX_QUANTILES(dur, 100)[OFFSET(50)] AS med,
      APPROX_QUANTILES(dur, 100)[OFFSET(90)] AS p90
    FROM (
      SELECT ${SEASON_CODE_SQL} AS code, ${durExprOf(p.proceso, p.fase)} AS dur
      FROM ${table}
      WHERE process = @proceso AND location_name = @airport
        AND DATE(responded_at, 'America/Santiago') <= DATE(@hasta)${reportSourceClause}
    )
    WHERE dur >= 0 AND dur <= @cap
    GROUP BY code`;
  const rows = await bqQuery<Record<string, unknown>>(sql, {
    proceso: p.proceso,
    airport: p.airport,
    hasta: p.hasta,
    cap: CAP_MIN,
    sourceCutoff: REPORT_SOURCE_CUTOFF,
  });
  return rows.map((r) => ({
    code: String(r.code),
    n: num(r.n),
    prom: num(r.prom),
    med: num(r.med),
    p90: num(r.p90),
  }));
}

/** Franjas horarias del inicio de la medición (hora de Chile). */
export const HOUR_BANDS = ["00–06 h", "06–12 h", "12–18 h", "18–24 h"] as const;

/** Promedio y n por franja horaria (índice de HOUR_BANDS) de un proceso en una ventana. */
export async function queryTiemposByHourBand(p: {
  proceso: Proceso;
  fase?: Fase;
  airport: string;
  desde: string;
  hasta: string;
}): Promise<{ band: number; n: number; prom: number }[]> {
  const table = `\`${bqProjectId()}.encuestas.mediciones_tiempos_consolidado\``;
  const t1 = T1[p.proceso];
  const sql = `
    SELECT band, COUNT(*) AS n, AVG(dur) AS prom
    FROM (
      SELECT DIV(EXTRACT(HOUR FROM DATETIME(${t1}, 'America/Santiago')), 6) AS band,
        ${durExprOf(p.proceso, p.fase)} AS dur
      FROM ${table}
      WHERE process = @proceso AND location_name = @airport AND ${t1} IS NOT NULL
        AND DATE(responded_at, 'America/Santiago') BETWEEN DATE(@desde) AND DATE(@hasta)${reportSourceClause}
    )
    WHERE dur >= 0 AND dur <= @cap AND band IS NOT NULL
    GROUP BY band ORDER BY band`;
  const rows = await bqQuery<Record<string, unknown>>(sql, {
    proceso: p.proceso,
    airport: p.airport,
    desde: p.desde,
    hasta: p.hasta,
    cap: CAP_MIN,
    sourceCutoff: REPORT_SOURCE_CUTOFF,
  });
  return rows.map((r) => ({ band: num(r.band), n: num(r.n), prom: num(r.prom) }));
}
