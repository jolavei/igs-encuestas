// Lectura + normalización de la microdata ASQ Departures.
//
// Dos piezas:
//  - `normalizeRows`  : núcleo PURO (headers + filas crudas -> registros + reporte).
//                       Sin dependencia de xlsx: testeable y reutilizable por el
//                       backfill desde el Google Sheet.
//  - `readDataSheet` / `parseWorkbook` : leen la hoja "Data" de un .xlsx (SheetJS).
//
// La ingesta a BigQuery (delete-por-temporada + load-append) vive en otro módulo;
// aquí sólo se produce el material normalizado y el diagnóstico para el preview.

import {
  ASQ_COLUMNS,
  ASQ_COLUMN_NAMES,
  coerceValue,
  parseQuarter,
  resolveHeader,
} from "./departuresSchema";

/** Valor crudo de una celda tal como lo entrega SheetJS/el Sheet. */
export type RawCell = string | number | boolean | Date | null | undefined;

/** Valor de una columna canónica ya coercionada. */
export type AsqValue = string | number | boolean | null;

/**
 * Un registro normalizado (columnas canónicas + metadatos derivados).
 * `_extra` (opcional) guarda las columnas inesperadas del archivo como red de
 * seguridad; por eso el índice admite también ese objeto.
 */
export interface AsqRecord {
  [column: string]: AsqValue | Record<string, string> | undefined;
  _extra?: Record<string, string>;
}

export interface AsqParseReport {
  sourceFile: string;
  sheetName: string;
  rowCount: number; // filas de datos consideradas (sin la de headers ni vacías)
  mappedColumns: string[]; // canónicas encontradas en el archivo
  missingColumns: string[]; // canónicas ausentes (ej. Language en el Sheet)
  unknownColumns: string[]; // headers no canónicos -> guardados en _extra
  ignoredColumns: string[]; // vestigiales presentes y descartadas (Column/class)
  duplicateHeaders: string[]; // headers repetidos en el archivo
  quarters: Record<string, number>; // por código crudo (SU25, ...)
  seasons: Record<string, number>; // por etiqueta legible (Summer 2025, ...)
  airports: Record<string, number>; // filas por código de aeropuerto
  ownAirportRows: number; // filas de aeropuertos propios (si se pasó ownAirports)
  warnings: string[];
}

export interface NormalizeInput {
  headers: RawCell[];
  rows: RawCell[][];
  sourceFile: string;
  sheetName?: string;
  /** Códigos de aeropuertos "propios" (para marcar _is_own_airport). */
  ownAirports?: Set<string>;
}

export interface NormalizeResult {
  records: AsqRecord[];
  report: AsqParseReport;
}

const COL_INDEX = new Map(ASQ_COLUMNS.map((c, idx) => [c.name, idx]));

/** Construye _row_key estable para dedupe (Quarter|QuestNo, con respaldo). */
function rowKey(rec: AsqRecord, rowIndex: number): string {
  const q = (rec.Quarter as string) || "NA";
  const quest = (rec.QuestNo as string) || "";
  if (quest) return `${q}|${quest}`;
  const ref = (rec.Reference_ID as string) || "";
  const ap = (rec.Airport as string) || "";
  return `${q}|${ap}|${ref || `row${rowIndex}`}`;
}

/**
 * Núcleo puro de normalización. Mapea headers a columnas canónicas por NOMBRE,
 * coerciona cada valor a su tipo, deriva metadatos y arma el reporte.
 */
export function normalizeRows(input: NormalizeInput): NormalizeResult {
  const { headers, rows, sourceFile, ownAirports } = input;
  const sheetName = input.sheetName ?? "Data";

  // 1) Resolver headers -> destino de cada columna del archivo.
  type ColTarget =
    | { kind: "canonical"; colIndex: number }
    | { kind: "extra"; header: string }
    | { kind: "ignored" };
  const targets: ColTarget[] = [];
  const seenCanonical = new Set<string>();
  const duplicateHeaders = new Set<string>();
  const unknownColumns: string[] = [];
  const ignoredColumns: string[] = [];

  for (const rawHeader of headers) {
    const header = String(rawHeader ?? "").trim();
    if (!header) {
      targets.push({ kind: "ignored" });
      continue;
    }
    const { column, ignored } = resolveHeader(header);
    if (ignored) {
      ignoredColumns.push(header);
      targets.push({ kind: "ignored" });
      continue;
    }
    if (column) {
      if (seenCanonical.has(column.name)) duplicateHeaders.add(column.name);
      seenCanonical.add(column.name);
      targets.push({ kind: "canonical", colIndex: COL_INDEX.get(column.name)! });
    } else {
      unknownColumns.push(header);
      targets.push({ kind: "extra", header });
    }
  }

  // 2) Recorrer filas y construir registros normalizados.
  const records: AsqRecord[] = [];
  const quarters: Record<string, number> = {};
  const seasons: Record<string, number> = {};
  const airports: Record<string, number> = {};
  let ownAirportRows = 0;

  rows.forEach((row, rowIndex) => {
    // Saltar filas totalmente vacías.
    if (!row || row.every((c) => c === null || c === undefined || c === "")) return;

    const rec: AsqRecord = {};
    const extra: Record<string, string> = {};

    targets.forEach((target, c) => {
      const raw = row[c];
      if (target.kind === "canonical") {
        const col = ASQ_COLUMNS[target.colIndex];
        rec[col.name] = coerceValue(col, raw);
      } else if (target.kind === "extra") {
        if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
          extra[target.header] = String(raw).trim();
        }
      }
    });

    // Asegurar que TODAS las canónicas existan (las ausentes en el archivo => null).
    for (const name of ASQ_COLUMN_NAMES) {
      if (!(name in rec)) rec[name] = null;
    }

    // Considerar la fila "real" sólo si tiene aeropuerto o identificador.
    const airport = (rec.Airport as string) || null;
    if (!airport && !rec.QuestNo && !rec.Reference_ID) return;

    // Metadatos derivados.
    const pq = parseQuarter(rec.Quarter);
    const isOwn = ownAirports && airport ? ownAirports.has(airport) : null;
    rec._source_file = sourceFile;
    rec._season_label = pq.label || null;
    rec._is_own_airport = isOwn;
    rec._row_key = rowKey(rec, rowIndex);
    if (Object.keys(extra).length > 0) rec._extra = extra;

    // Conteos para el reporte.
    const qcode = (rec.Quarter as string) || "(sin Quarter)";
    quarters[qcode] = (quarters[qcode] ?? 0) + 1;
    if (pq.label) seasons[pq.label] = (seasons[pq.label] ?? 0) + 1;
    if (airport) {
      airports[airport] = (airports[airport] ?? 0) + 1;
      if (isOwn) ownAirportRows += 1;
    }

    records.push(rec);
  });

  // 3) Reporte de diagnóstico.
  const missingColumns = ASQ_COLUMN_NAMES.filter((n) => !seenCanonical.has(n));
  const warnings: string[] = [];
  if (missingColumns.length)
    warnings.push(`Faltan ${missingColumns.length} columnas canónicas: ${missingColumns.join(", ")}`);
  if (unknownColumns.length)
    warnings.push(`Columnas no reconocidas (guardadas en _extra): ${unknownColumns.join(", ")}`);
  if (duplicateHeaders.size)
    warnings.push(`Headers duplicados: ${[...duplicateHeaders].join(", ")}`);
  if (Object.keys(quarters).some((q) => q.startsWith("(") || parseQuarter(q).season === "UNKNOWN"))
    warnings.push("Alguna fila no tiene un código de temporada (Quarter) reconocible.");

  return {
    records,
    report: {
      sourceFile,
      sheetName,
      rowCount: records.length,
      mappedColumns: [...seenCanonical],
      missingColumns,
      unknownColumns,
      ignoredColumns,
      duplicateHeaders: [...duplicateHeaders],
      quarters,
      seasons,
      airports,
      ownAirportRows,
      warnings,
    },
  };
}

/** Elige la hoja "Data" (o la primera si no existe una con ese nombre). */
function pickDataSheet(sheetNames: string[]): string {
  return sheetNames.find((n) => /^data$/i.test(n)) ?? sheetNames[0];
}

export interface ReadResult {
  headers: RawCell[];
  rows: RawCell[][];
  sheetName: string;
}

/**
 * Lee la hoja "Data" de un workbook .xlsx (Buffer o ruta) como array de arrays.
 * Usa serials crudos (cellDates:false) para fechas/horas deterministas —ver
 * departuresSchema.coerceDate/coerceTime—. Importa SheetJS de forma dinámica
 * para no arrastrarlo al bundle de rutas que no ingestan.
 */
export async function readDataSheet(
  input: Buffer | string,
  sheetName?: string
): Promise<ReadResult> {
  const mod = await import("xlsx");
  // xlsx es CommonJS: según el interop, la API puede venir en `.default`.
  const XLSX = ((mod as unknown as { default?: typeof mod }).default ?? mod);
  const wb =
    typeof input === "string"
      ? XLSX.readFile(input, { cellDates: false, dense: true })
      : XLSX.read(input, { type: "buffer", cellDates: false, dense: true });
  const chosen =
    sheetName && wb.SheetNames.includes(sheetName) ? sheetName : pickDataSheet(wb.SheetNames);
  const ws = wb.Sheets[chosen];
  if (!ws) throw new Error(`El archivo no tiene la hoja de datos ("${chosen}").`);
  const aoa = XLSX.utils.sheet_to_json<RawCell[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  const [headers, ...rows] = aoa;
  return { headers: headers ?? [], rows, sheetName: chosen };
}

export interface ParseWorkbookOptions {
  sourceFile: string;
  ownAirports?: Set<string>;
}

/** Lee un .xlsx y lo normaliza en un paso (lectura + normalización). */
export async function parseWorkbook(
  input: Buffer | string,
  opts: ParseWorkbookOptions
): Promise<NormalizeResult> {
  const { headers, rows, sheetName } = await readDataSheet(input);
  return normalizeRows({
    headers,
    rows,
    sheetName,
    sourceFile: opts.sourceFile,
    ownAirports: opts.ownAirports,
  });
}
