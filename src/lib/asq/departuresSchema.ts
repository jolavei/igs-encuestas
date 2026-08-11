// Esquema CANÓNICO de la microdata ACI ASQ Departures (una fila por pasajero).
//
// Única fuente de verdad para ingestar los archivos "definitivos" (Excel) y el
// histórico (Google Sheet). El mapeo de columnas se hace por NOMBRE de header
// (no por posición), de modo que si ACI reordena columnas la ingesta no se rompe.
// Cuando cambie el formato, se ajusta AQUÍ (tipo o alias), no a mano en la planilla.
//
// Notas de formato observadas:
//  - Excel "definitivo": 114 columnas, incluye `Language`, sin `Column`/`class`.
//  - Google Sheet histórico: mismas columnas SIN `Language` y con dos columnas
//    vestigiales al final (`Column`, `class`) que se descartan (IGNORED_HEADERS).
//  - Ratings 1..5 y códigos numéricos; celda vacía / "None" / "N/A" => NULL.

export type AsqBqType = "STRING" | "INT64" | "FLOAT64" | "DATE";
// Cómo coercionar el valor crudo (número/serial/fecha/texto) hacia el tipo BQ.
export type AsqKind = "string" | "int" | "float" | "date" | "time";

export interface AsqColumn {
  /** Nombre canónico (== nombre de columna en BigQuery). */
  name: string;
  /** Tipo de la columna en BigQuery. */
  type: AsqBqType;
  /** Regla de coerción del valor crudo. */
  kind: AsqKind;
  /** Variantes de header vistas en la práctica (renombres históricos). */
  aliases?: string[];
}

// Builders concisos para declarar las columnas en el orden del formato definitivo.
const s = (name: string, aliases?: string[]): AsqColumn => ({ name, type: "STRING", kind: "string", aliases });
const i = (name: string, aliases?: string[]): AsqColumn => ({ name, type: "INT64", kind: "int", aliases });
const f = (name: string, aliases?: string[]): AsqColumn => ({ name, type: "FLOAT64", kind: "float", aliases });
const d = (name: string, aliases?: string[]): AsqColumn => ({ name, type: "DATE", kind: "date", aliases });
// Horas/duraciones: se guardan como texto "HH:MM:SS" (los controles nativos y BQ
// no necesitan tipo TIME aquí, y así toleramos formatos AM/PM del histórico).
const t = (name: string, aliases?: string[]): AsqColumn => ({ name, type: "STRING", kind: "time", aliases });

// Las 114 columnas canónicas, en el orden del Excel definitivo.
export const ASQ_COLUMNS: AsqColumn[] = [
  s("Airport"), i("Airp_Size"), s("Airp_Region"), s("Airp_Country"), s("Traffic"),
  s("Terminal"), s("Gate"), s("Flight_Letters"), s("Flight_Numbers"), s("Flight_Destination"),
  s("Flight_Region_Dest"), t("Flight_Duration"), i("Dep_Day"), i("Dep_Month"), i("Dep_Year"),
  d("Dep_Date"), t("Dep_Time"), i("Time_day"), i("Week_day"), i("Connect"),
  i("Connect_Checkin"), i("Connect_Security"), i("Connect_border"), i("Reason"), i("Overall_Ex"),
  s("Best"), s("Worst"), i("Safe_Secure"), i("Happy"), i("Excited"),
  i("Confident"), i("Relaxed"), i("Emotional_State"), i("Transport"), i("Parking"),
  i("Checkin_Online"), i("Checkin_Offsite"), i("Checkin_Desk"), i("Checkin_Self"), i("Checkin_Selfbag"),
  i("Checkin_Other"), i("Checkin_Area"), i("Access_Ease"), i("Access_Signs"), i("Transport_VFM"),
  i("Checkin_Ease"), i("Checkin_Wait"), i("Checkin_Staff"), i("Security_Ease"), i("Security_Wait"),
  i("Security_Staff"), i("Border_Wait"), i("Border_Staff"), i("Restaurants"), i("Restaurants_VFM"),
  i("Shops"), i("Shops_VFM"), i("RestShops_Staff"), i("Gates_Comfort"), i("Seats_Availability"),
  i("Way_Ease"), i("FlightInfo_Availability"), i("Walking"), i("Connect_Ease"), i("Airport_Staff"),
  i("WiFi"), i("Charging_Availability"), i("Entertainement"), i("Washrooms_Availability"), i("Washrooms_Clean"),
  i("Health"), i("Clean"), i("Ambience"), i("Overall_Sat"), s("Important_1"),
  s("Important_2"), s("Important_3"), i("Time_Departure"), i("Alone"), i("Colleagues"),
  i("Friends"), i("Child_0_2"), i("Child_3_9"), i("Child_10_17"), i("Group"),
  i("Crowd"), i("Flight_Delay"), i("Number_Trip"), s("Nationality"), s("Nationality_Region"),
  s("Residency"), s("Residency_Region"), i("Age"), i("Gender"), s("Quarter"),
  s("Agent_Number"), t("System_Time"), d("System_Date"), s("QuestNo"), s("Reference_ID"),
  f("Weight"), i("Arrival_Category"), i("Checkin_Category"), i("Security_Category"), i("Border_Category"),
  i("RestShops_Category"), i("Gates_Category"), i("Throughout_Category"), i("Atmosphere_Category"), i("Ease_Index"),
  i("Waiting_Index"), i("Staff_Index"), i("Emotional_Score"), i("Language"),
];

// Columnas vestigiales del Sheet histórico: se descartan (no van a _extra ni a BQ).
export const IGNORED_HEADERS = new Set(["column", "class"]);

// Columnas de METADATOS que la ingesta agrega a cada fila en BigQuery.
// (_ingest_id / _ingested_at se asignan en el momento de la carga, no aquí.)
export const ASQ_META_COLUMNS: { name: string; type: AsqBqType }[] = [
  { name: "_ingest_id", type: "STRING" },
  { name: "_ingested_at", type: "STRING" }, // TIMESTAMP en BQ; ISO string en NDJSON
  { name: "_source_file", type: "STRING" },
  { name: "_season_label", type: "STRING" },
  { name: "_is_own_airport", type: "STRING" }, // BOOL en BQ; se serializa como bool
  { name: "_row_key", type: "STRING" },
  { name: "_extra", type: "STRING" }, // JSON en BQ; columnas inesperadas (red de seguridad)
];

const NAME_TO_COLUMN = new Map<string, AsqColumn>();
for (const col of ASQ_COLUMNS) {
  NAME_TO_COLUMN.set(normalizeHeader(col.name), col);
  for (const a of col.aliases ?? []) NAME_TO_COLUMN.set(normalizeHeader(a), col);
}

/** Normaliza un header para comparar: sin espacios extra, en minúsculas. */
export function normalizeHeader(h: string): string {
  return String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Resuelve un header del archivo a su columna canónica (o marca ignorado). */
export function resolveHeader(header: string): { column?: AsqColumn; ignored: boolean } {
  const key = normalizeHeader(header);
  if (IGNORED_HEADERS.has(key)) return { ignored: true };
  const column = NAME_TO_COLUMN.get(key);
  return { column, ignored: false };
}

export const ASQ_COLUMN_NAMES: string[] = ASQ_COLUMNS.map((c) => c.name);

// --- Coerción de valores ----------------------------------------------------

const NULLISH = /^(none|n\/?a|null|-|\.)$/i;

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "" || NULLISH.test(v.trim());
  return false;
}

/** Entero (rating/código). Vacío/"None" => null; no-numérico => null. */
export function coerceInt(v: unknown): number | null {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Flotante (ej. Weight). */
export function coerceFloat(v: unknown): number | null {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^\d.eE+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30); // día 0 del sistema de fechas 1900
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Fecha => "YYYY-MM-DD". Acepta:
 *  - número: serial Excel (Excel: cellDates=false),
 *  - Date de JS,
 *  - texto ISO "2025-04-13...", o "D-Mon-YY" (histórico: "7-Aug-19").
 */
export function coerceDate(v: unknown): string | null {
  if (isBlank(v)) return null;
  if (typeof v === "number") {
    const ms = EXCEL_EPOCH_UTC + Math.floor(v) * 86400000;
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  }
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
  }
  const str = String(v).trim();
  // ISO: tomar los primeros 10 caracteres si calzan.
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // "D-Mon-YY" o "D-Mon-YYYY" (histórico del Sheet).
  const dm = str.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const mon = MONTHS[dm[2].slice(0, 3).toLowerCase()];
    let year = parseInt(dm[3], 10);
    if (year < 100) year += 2000;
    if (mon) return `${year}-${pad2(mon)}-${pad2(day)}`;
  }
  return null;
}

/**
 * Hora/duración => "HH:MM:SS". Acepta:
 *  - número: fracción de día Excel (0.5708.. => 13:42:00),
 *  - Date de JS,
 *  - texto "13:42:00" o "7:35:00 PM" (histórico).
 */
export function coerceTime(v: unknown): string | null {
  if (isBlank(v)) return null;
  if (typeof v === "number") {
    const frac = v - Math.floor(v);
    let total = Math.round(frac * 86400);
    // Duraciones >= 24h (raro): conservar las horas totales.
    const whole = Math.floor(v);
    total += whole * 86400;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  }
  if (v instanceof Date) {
    return `${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())}:${pad2(v.getUTCSeconds())}`;
  }
  const str = String(v).trim();
  const m = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = m[3] ? parseInt(m[3], 10) : 0;
    const ap = m[4]?.toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return `${pad2(h)}:${pad2(min)}:${pad2(sec)}`;
  }
  return null;
}

/** Texto: recorta; vacío/"None" => null; preserva ceros a la izquierda. */
export function coerceString(v: unknown): string | null {
  if (isBlank(v)) return null;
  return String(v).trim();
}

/** Coerciona un valor crudo según el tipo de la columna. */
export function coerceValue(col: AsqColumn, v: unknown): string | number | null {
  switch (col.kind) {
    case "int": return coerceInt(v);
    case "float": return coerceFloat(v);
    case "date": return coerceDate(v);
    case "time": return coerceTime(v);
    default: return coerceString(v);
  }
}

// --- Temporada (Quarter) ----------------------------------------------------

export interface ParsedQuarter {
  season: "SUMMER" | "WINTER" | "UNKNOWN";
  year: number | null;
  label: string; // "Summer 2025" | "Winter 2025-26" | <código crudo>
}

/**
 * "SU25" => Summer 2025 ; "WI25" => Winter 2025-26 ; "SU2019" => Summer 2019.
 * Si no calza, devuelve el código crudo como label y season UNKNOWN.
 */
export function parseQuarter(raw: unknown): ParsedQuarter {
  const code = String(raw ?? "").trim().toUpperCase();
  const m = code.match(/^(SU|WI)\s*(\d{2,4})$/);
  if (!m) return { season: "UNKNOWN", year: null, label: code };
  const season = m[1] === "SU" ? "SUMMER" : "WINTER";
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  const label = season === "SUMMER"
    ? `Summer ${year}`
    : `Winter ${year}-${pad2((year + 1) % 100)}`;
  return { season, year, label };
}
