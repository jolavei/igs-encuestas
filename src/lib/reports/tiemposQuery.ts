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

/** Modalidad de Check in: tiene su propio Estándar IATA (counter 20 min, quiosco 5 min). */
export type CheckinMode = "counter" | "quiosco";

export type HotspotCell = { dow: number; hour: number; n: number; prom: number }; // dow: 0 = lunes … 6 = domingo
export type HotspotBin = { min: number; n: number }; // medición con duración en [min, min + 1)
export type HotspotAirline = { airline: string; n: number; prom: number; p90: number };
export type HotspotData = {
  total: { n: number; prom: number; p90: number } | null;
  cells: HotspotCell[];
  bins: HotspotBin[];
  airlines: HotspotAirline[];
  days: { dow: number; n: number; prom: number }[];
  hours: { hour: number; n: number; prom: number }[];
};

/**
 * Mapa de hotspots de un proceso en una ventana: promedio por día de la semana × hora de
 * inicio de la medición (hora de Chile), distribución por minuto y resumen por aerolínea.
 */
export async function queryTiemposHotspot(p: {
  proceso: Proceso;
  fase?: Fase;
  mode?: CheckinMode;
  airport: string;
  desde: string;
  hasta: string;
}): Promise<HotspotData> {
  const table = `\`${bqProjectId()}.encuestas.mediciones_tiempos_consolidado\``;
  const t1 = T1[p.proceso];
  const airlineCol = p.proceso === "Check in" ? "checkin_airline" : p.proceso === "Retiro de equipajes" ? "baggage_claim_airline" : "NULL";
  const airlineExpr =
    p.proceso === "Retiro de equipajes" ? `REGEXP_REPLACE(${airlineCol}, r' - (Counter|Quiosco)$', '')` : `CAST(${airlineCol} AS STRING)`;
  const modeClause =
    p.mode === "quiosco"
      ? " AND checkin_airline LIKE '%Quiosco%'"
      : p.mode === "counter"
        ? " AND (checkin_airline IS NULL OR checkin_airline NOT LIKE '%Quiosco%')"
        : "";
  const stats = `COUNT(*) AS n, AVG(dur) AS prom, APPROX_QUANTILES(dur, 100)[OFFSET(90)] AS p90`;
  const sql = `
    WITH v AS (
      SELECT MOD(EXTRACT(DAYOFWEEK FROM DATETIME(${t1}, 'America/Santiago')) + 5, 7) AS dow,
        EXTRACT(HOUR FROM DATETIME(${t1}, 'America/Santiago')) AS hour,
        ${airlineExpr} AS airline,
        ${durExprOf(p.proceso, p.fase)} AS dur
      FROM ${table}
      WHERE process = @proceso AND location_name = @airport AND ${t1} IS NOT NULL
        AND DATE(responded_at, 'America/Santiago') BETWEEN DATE(@desde) AND DATE(@hasta)${modeClause}${reportSourceClause}
    ),
    m AS (SELECT * FROM v WHERE dur >= 0 AND dur <= @cap)
    SELECT 'total' AS k, 0 AS a, 0 AS b, '' AS airline, ${stats} FROM m
    UNION ALL SELECT 'cell', dow, hour, '', ${stats} FROM m GROUP BY dow, hour
    UNION ALL SELECT 'day', dow, 0, '', ${stats} FROM m GROUP BY dow
    UNION ALL SELECT 'hour', hour, 0, '', ${stats} FROM m GROUP BY hour
    UNION ALL SELECT 'bin', CAST(FLOOR(dur) AS INT64), 0, '', ${stats} FROM m GROUP BY 2
    UNION ALL SELECT 'airline', 0, 0, airline, ${stats} FROM m WHERE airline IS NOT NULL AND airline != '' GROUP BY airline`;
  const rows = await bqQuery<Record<string, unknown>>(sql, {
    proceso: p.proceso,
    airport: p.airport,
    desde: p.desde,
    hasta: p.hasta,
    cap: CAP_MIN,
    sourceCutoff: REPORT_SOURCE_CUTOFF,
  });
  const of = (k: string) => rows.filter((r) => r.k === k);
  const total = of("total")[0];
  return {
    total: total && num(total.n) > 0 ? { n: num(total.n), prom: num(total.prom), p90: num(total.p90) } : null,
    cells: of("cell").map((r) => ({ dow: num(r.a), hour: num(r.b), n: num(r.n), prom: num(r.prom) })),
    days: of("day").map((r) => ({ dow: num(r.a), n: num(r.n), prom: num(r.prom) })),
    hours: of("hour").map((r) => ({ hour: num(r.a), n: num(r.n), prom: num(r.prom) })),
    bins: of("bin")
      .map((r) => ({ min: num(r.a), n: num(r.n) }))
      .sort((a, b) => a.min - b.min),
    airlines: of("airline")
      .map((r) => ({ airline: String(r.airline), n: num(r.n), prom: num(r.prom), p90: num(r.p90) }))
      .sort((a, b) => b.n - a.n),
  };
}

// ---------------------------------------------------------------------------
// Fila vs atención (desde el 1-oct-2026)
// ---------------------------------------------------------------------------
//
// Hitos de la app (cuestionario v6+): t1 ingreso a la fila · t2 salida de la fila (inicio
// de la atención) · t3 fin de la atención. Fila = t2 − t1 (lo que se informa desde siempre
// y a lo que aplica el Estándar IATA); atención = t3 − t2 (sin meta); total = t3 − t1.
// El histórico de Sheets solo medía la fila: la atención se informa desde SERVICE_FROM y
// solo con datos de la app. Retiro de equipajes no aplica (ya tiene sus dos tramos).

export const SERVICE_FROM = REPORT_SOURCE_CUTOFF;

const T2: Record<string, string> = {
  "Check in": "checkin_t2",
  AVSEC: "avsec_t2",
  "Pasaporte emigración": "passport_outbound_t2",
  "Pasaporte inmigración": "passport_inbound_t2",
  "Control aduana / SAG": "border_protection_t2",
};
const T3: Record<string, string> = {
  "Check in": "checkin_t3",
  AVSEC: "avsec_t3",
  "Pasaporte emigración": "passport_outbound_t3",
  "Pasaporte inmigración": "passport_inbound_t3",
  "Control aduana / SAG": "border_protection_t3",
};

/** ¿El proceso tiene tramo de atención (t3)? Retiro de equipajes no. */
export const hasService = (proceso: Proceso) => proceso in T3;

let serviceColumns: { ok: boolean; at: number } | null = null;

/**
 * ¿La tabla consolidada ya trae los terceros hitos (*_t3)? Hasta que se despliegue la nueva
 * definición de Dataform no existen: los informes muestran solo la fila, sin error.
 * Se cachea (un "no" se vuelve a revisar a los 10 minutos).
 */
export async function hasServiceColumns(): Promise<boolean> {
  if (serviceColumns && (serviceColumns.ok || Date.now() - serviceColumns.at < 600_000)) return serviceColumns.ok;
  try {
    const rows = await bqQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS n FROM \`${bqProjectId()}.encuestas.INFORMATION_SCHEMA.COLUMNS\`
       WHERE table_name = 'mediciones_tiempos_consolidado' AND column_name IN UNNEST(@cols)`,
      { cols: Object.values(T3) }
    );
    serviceColumns = { ok: num(rows[0]?.n) === Object.keys(T3).length, at: Date.now() };
  } catch {
    serviceColumns = { ok: false, at: Date.now() };
  }
  return serviceColumns.ok;
}

export type ServiceAgg = { n: number; prom: number; med: number; p90: number; totProm: number; totMed: number; totP90: number };
export type ServiceStats = {
  all: ServiceAgg | null; // toda la ventana (desde SERVICE_FROM)
  months: ({ ym: string } & ServiceAgg)[];
  airlines: { airline: string; ym: string; n: number; prom: number }[]; // solo Check in
};

/**
 * Atención y total de un proceso en una ventana (se recorta a SERVICE_FROM), solo con
 * mediciones de la app que tienen los tres hitos válidos (sin negativos, máx. CAP_MIN).
 */
export async function queryServiceStats(p: {
  proceso: Proceso;
  airport: string;
  desde: string;
  hasta: string;
}): Promise<ServiceStats> {
  const empty: ServiceStats = { all: null, months: [], airlines: [] };
  const t1 = T1[p.proceso];
  const t2 = T2[p.proceso];
  const t3 = T3[p.proceso];
  if (!t3) return empty;
  const desde = p.desde > SERVICE_FROM ? p.desde : SERVICE_FROM;
  if (p.hasta < desde) return empty;
  const table = `\`${bqProjectId()}.encuestas.mediciones_tiempos_consolidado\``;
  const aggs = `COUNT(*) AS n, AVG(aten) AS prom,
      APPROX_QUANTILES(aten, 100)[OFFSET(50)] AS med, APPROX_QUANTILES(aten, 100)[OFFSET(90)] AS p90,
      AVG(tot) AS tot_prom, APPROX_QUANTILES(tot, 100)[OFFSET(50)] AS tot_med, APPROX_QUANTILES(tot, 100)[OFFSET(90)] AS tot_p90`;
  const sql = `
    WITH m AS (
      SELECT FORMAT_TIMESTAMP('%Y-%m', responded_at, 'America/Santiago') AS ym,
        ${p.proceso === "Check in" ? "checkin_airline" : "CAST(NULL AS STRING)"} AS airline,
        TIMESTAMP_DIFF(${t3}, ${t2}, SECOND) / 60.0 AS aten,
        TIMESTAMP_DIFF(${t3}, ${t1}, SECOND) / 60.0 AS tot,
        TIMESTAMP_DIFF(${t2}, ${t1}, SECOND) / 60.0 AS fila
      FROM ${table}
      WHERE process = @proceso AND location_name = @airport AND origen = 'app'
        AND ${t1} IS NOT NULL AND ${t2} IS NOT NULL AND ${t3} IS NOT NULL
        AND DATE(responded_at, 'America/Santiago') BETWEEN DATE(@desde) AND DATE(@hasta)
    ),
    v AS (SELECT * FROM m WHERE fila >= 0 AND aten >= 0 AND tot >= 0 AND tot <= @cap)
    SELECT 'all' AS k, '' AS ym, '' AS airline, ${aggs} FROM v
    UNION ALL
    SELECT 'month', ym, '', ${aggs} FROM v GROUP BY ym
    UNION ALL
    SELECT 'airline', ym, airline, ${aggs} FROM v WHERE airline IS NOT NULL AND airline != '' GROUP BY ym, airline`;
  const rows = await bqQuery<Record<string, unknown>>(sql, {
    proceso: p.proceso,
    airport: p.airport,
    desde,
    hasta: p.hasta,
    cap: CAP_MIN,
  });
  const agg = (r: Record<string, unknown>): ServiceAgg => ({
    n: num(r.n),
    prom: num(r.prom),
    med: num(r.med),
    p90: num(r.p90),
    totProm: num(r.tot_prom),
    totMed: num(r.tot_med),
    totP90: num(r.tot_p90),
  });
  const all = rows.find((r) => r.k === "all");
  return {
    all: all && num(all.n) > 0 ? agg(all) : null,
    months: rows.filter((r) => r.k === "month").map((r) => ({ ym: String(r.ym), ...agg(r) })),
    airlines: rows
      .filter((r) => r.k === "airline")
      .map((r) => ({ airline: String(r.airline), ym: String(r.ym), n: num(r.n), prom: num(r.prom) })),
  };
}
