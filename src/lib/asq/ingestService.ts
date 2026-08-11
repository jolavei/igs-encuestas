// Orquestación de la ingesta ASQ para las rutas API: baja el .xlsx de GCS,
// lo normaliza (marcando aeropuertos propios) y —según la ruta— hace el preview
// (dry-run) o la carga real a BigQuery. Reutilizado por /analyze e /ingest.

import { downloadObject } from "@/lib/gcs";
import { parseWorkbook, type AsqParseReport, type AsqRecord } from "./parseWorkbook";
import { getOwnAirportCodes } from "./ownAirports";
import {
  ingestDepartures,
  countExistingRows,
  type IngestOptions,
  type IngestResult,
} from "./ingestDepartures";

// Tope defensivo: evita agotar memoria si suben un archivo enorme por error.
const MAX_BYTES = 60 * 1024 * 1024; // 60 MB

/** Baja el objeto de GCS y lo normaliza. `fileName` alimenta `_source_file`. */
export async function parseObject(
  objectPath: string,
  fileName?: string
): Promise<{ records: AsqRecord[]; report: AsqParseReport; fileName: string }> {
  const buf = await downloadObject(objectPath);
  if (buf.length > MAX_BYTES) {
    throw new Error(`El archivo es demasiado grande (${(buf.length / 1e6).toFixed(1)} MB).`);
  }
  const source = fileName || objectPath.split("/").pop() || objectPath;
  const ownAirports = await getOwnAirportCodes();
  const { records, report } = await parseWorkbook(buf, { sourceFile: source, ownAirports });
  return { records, report, fileName: source };
}

export interface AnalyzeResult {
  fileName: string;
  report: AsqParseReport;
  table: string;
  ndjsonBytes: number;
  quarters: string[];
  /** Filas ya existentes en BQ para esas temporadas (que se reemplazarían); null si no se pudo consultar. */
  existingRowsForQuarters: number | null;
}

/** Preview (no escribe): parseo + diagnóstico + cuánto se reemplazaría en BQ. */
export async function analyzeObject(objectPath: string, fileName?: string): Promise<AnalyzeResult> {
  const { records, report, fileName: source } = await parseObject(objectPath, fileName);
  const dry = await ingestDepartures(records, { dryRun: true });
  const existingRowsForQuarters = await countExistingRows(dry.quarters);
  return {
    fileName: source,
    report,
    table: dry.table,
    ndjsonBytes: dry.ndjsonBytes,
    quarters: dry.quarters,
    existingRowsForQuarters,
  };
}

/** Carga real a BigQuery (ensure tabla → DELETE por temporada → load-append). */
export async function ingestObject(
  objectPath: string,
  fileName?: string,
  opts?: IngestOptions
): Promise<{ report: AsqParseReport; result: IngestResult; fileName: string }> {
  const { records, report, fileName: source } = await parseObject(objectPath, fileName);
  const result = await ingestDepartures(records, opts);
  return { report, result, fileName: source };
}
