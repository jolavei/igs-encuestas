// Ingesta de la microdata ASQ Departures a BigQuery (encuestas.asq_departures).
//
// Idempotencia "un archivo = un semestre": antes de cargar, se BORRAN las filas
// de las temporadas (Quarter) presentes en el archivo y luego se hace load-append.
// Re-subir un archivo corregido reemplaza esa temporada limpio.
//
// La generación de NDJSON y el esquema BQ son funciones PURAS (sin llamar a BQ),
// para poder verificarlas en seco (dry-run) sin credenciales.

import { randomUUID } from "node:crypto";
import {
  ASQ_COLUMNS,
  ASQ_COLUMN_NAMES,
  type AsqBqType,
} from "./departuresSchema";
import type { AsqRecord } from "./parseWorkbook";
import {
  bqProjectId,
  bqQuery,
  ensureDataset,
  ensureTable,
  bqDml,
  bqLoadNdjson,
  type BqField,
} from "@/lib/bigquery";

export const ASQ_DATASET = process.env.ASQ_BQ_DATASET || "encuestas";
export const ASQ_TABLE = process.env.ASQ_BQ_TABLE || "asq_departures";

/** AsqBqType (SQL estándar) -> nombre de tipo que espera @google-cloud/bigquery. */
const BQ_TYPE: Record<AsqBqType, string> = {
  STRING: "STRING",
  INT64: "INTEGER",
  FLOAT64: "FLOAT",
  DATE: "DATE",
};

/** Esquema completo de la tabla: 114 columnas canónicas + 7 de metadatos. */
export function asqTableFields(): BqField[] {
  const dataFields: BqField[] = ASQ_COLUMNS.map((c) => ({
    name: c.name,
    type: BQ_TYPE[c.type],
    mode: "NULLABLE",
  }));
  const metaFields: BqField[] = [
    { name: "_ingest_id", type: "STRING", mode: "NULLABLE" },
    { name: "_ingested_at", type: "TIMESTAMP", mode: "NULLABLE" },
    { name: "_source_file", type: "STRING", mode: "NULLABLE" },
    { name: "_season_label", type: "STRING", mode: "NULLABLE" },
    { name: "_is_own_airport", type: "BOOLEAN", mode: "NULLABLE" },
    { name: "_row_key", type: "STRING", mode: "NULLABLE" },
    { name: "_extra", type: "STRING", mode: "NULLABLE" }, // JSON serializado
  ];
  return [...dataFields, ...metaFields];
}

/** Nombre totalmente calificado `proyecto.dataset.tabla`. */
export function asqTableRef(): string {
  return `${bqProjectId()}.${ASQ_DATASET}.${ASQ_TABLE}`;
}

/** Convierte un registro normalizado a un objeto plano listo para NDJSON. */
function toBqRow(
  rec: AsqRecord,
  ingestId: string,
  ingestedAt: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // `?? null` NO pisa el 0 (nullish sólo atrapa null/undefined) -> ratings 0 ok.
  for (const name of ASQ_COLUMN_NAMES) out[name] = rec[name] ?? null;
  out._ingest_id = ingestId;
  out._ingested_at = ingestedAt;
  out._source_file = rec._source_file ?? null;
  out._season_label = rec._season_label ?? null;
  out._is_own_airport = rec._is_own_airport ?? null;
  out._row_key = rec._row_key ?? null;
  out._extra = rec._extra ? JSON.stringify(rec._extra) : null;
  return out;
}

/** Serializa los registros a NDJSON (una fila JSON por línea). */
export function recordsToNdjson(
  records: AsqRecord[],
  ingestId: string,
  ingestedAt: string
): string {
  return records.map((r) => JSON.stringify(toBqRow(r, ingestId, ingestedAt))).join("\n") + "\n";
}

/** Temporadas (códigos Quarter) distintas presentes en los registros. */
export function quartersIn(records: AsqRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const q = r.Quarter as string | null;
    if (q) set.add(q);
  }
  return [...set];
}

/**
 * Cuenta cuántas filas ya existen en BQ para esas temporadas (lo que la ingesta
 * REEMPLAZARÍA). Best-effort: devuelve null si la tabla no existe o faltan
 * credenciales, para que el preview no falle antes de la primera carga.
 */
export async function countExistingRows(quarters: string[]): Promise<number | null> {
  if (quarters.length === 0) return 0;
  try {
    const rows = await bqQuery<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM \`${asqTableRef()}\` WHERE Quarter IN UNNEST(@quarters)`,
      { quarters }
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null; // tabla inexistente / sin credenciales / etc.
  }
}

export interface IngestResult {
  ingestId: string;
  ingestedAt: string;
  table: string;
  rowCount: number;
  quarters: string[]; // temporadas presentes en el archivo
  replacedRows: number; // filas borradas por idempotencia (temporadas del archivo)
  loadedRows: number; // filas efectivamente cargadas
  loadJobId: string | null;
  ndjsonBytes: number;
  dryRun: boolean;
}

export interface IngestOptions {
  /** Si true, genera NDJSON y calcula el plan pero NO toca BigQuery. */
  dryRun?: boolean;
  /** UUID del batch (si no se pasa, se genera). */
  ingestId?: string;
  ingestedAt?: string;
}

/**
 * Ingesta idempotente: ensure dataset/tabla -> DELETE por temporada -> load-append.
 * En dry-run devuelve el mismo resumen (rowCount, temporadas, bytes) sin escribir.
 */
export async function ingestDepartures(
  records: AsqRecord[],
  opts: IngestOptions = {}
): Promise<IngestResult> {
  const ingestId = opts.ingestId ?? randomUUID();
  const ingestedAt = opts.ingestedAt ?? new Date().toISOString();
  const quarters = quartersIn(records);
  const ndjson = recordsToNdjson(records, ingestId, ingestedAt);
  const ndjsonBytes = Buffer.byteLength(ndjson, "utf8");
  const table = asqTableRef();

  const base: IngestResult = {
    ingestId,
    ingestedAt,
    table,
    rowCount: records.length,
    quarters,
    replacedRows: 0,
    loadedRows: 0,
    loadJobId: null,
    ndjsonBytes,
    dryRun: !!opts.dryRun,
  };

  if (opts.dryRun) return base;
  if (records.length === 0) return base;

  const fields = asqTableFields();
  await ensureDataset(ASQ_DATASET);
  await ensureTable(ASQ_DATASET, ASQ_TABLE, fields, { clustering: ["Quarter", "Airport"] });

  // Idempotencia: borrar las temporadas del archivo antes de recargar.
  let replacedRows = 0;
  if (quarters.length > 0) {
    replacedRows = await bqDml(
      `DELETE FROM \`${table}\` WHERE Quarter IN UNNEST(@quarters)`,
      { quarters }
    );
  }

  const load = await bqLoadNdjson(ASQ_DATASET, ASQ_TABLE, ndjson, fields);

  return {
    ...base,
    replacedRows,
    loadedRows: load.outputRows || records.length,
    loadJobId: load.jobId,
  };
}
