// Cliente de LECTURA de BigQuery para el Dashboard (server-only).
// Reutiliza las credenciales de la service account `bigquery-sync@` (ya con
// permiso de lectura) que en producción viven en variables de entorno.
//
// Variables de entorno:
//   GCP_PROJECT_ID  proyecto (ej. igs-encuestas)
//   GCP_SA_KEY      JSON (como texto) de la service account
//   BQ_LOCATION     ubicación del dataset (default: US)
//
// Importa @google-cloud/bigquery de forma dinámica para no forzar el bundle
// en rutas que no lo usan (mismo patrón que scripts/sync-bigquery.mjs).

import { Readable } from "node:stream";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BigQueryClient = any;

let _client: BigQueryClient | null = null;

/** Definición de un campo del esquema BQ (formato de @google-cloud/bigquery). */
export interface BqField {
  name: string;
  type: string; // STRING | INTEGER | FLOAT | BOOLEAN | TIMESTAMP | DATE | JSON ...
  mode?: "NULLABLE" | "REQUIRED" | "REPEATED";
}

/** Error tipado cuando faltan credenciales, para que la API responda 503 claro. */
export class BigQueryCredentialsError extends Error {
  code = "BQ_NO_CREDS" as const;
  constructor() {
    super("Faltan las credenciales de BigQuery (GCP_PROJECT_ID / GCP_SA_KEY).");
    this.name = "BigQueryCredentialsError";
  }
}

/** Proyecto GCP; default al de este sistema para construir nombres de tabla. */
export function bqProjectId(): string {
  return process.env.GCP_PROJECT_ID || "igs-encuestas";
}

async function getClient(): Promise<BigQueryClient> {
  const projectId = process.env.GCP_PROJECT_ID;
  const key = process.env.GCP_SA_KEY;
  if (!projectId || !key) throw new BigQueryCredentialsError();
  if (_client) return _client;
  const { BigQuery } = await import("@google-cloud/bigquery");
  _client = new BigQuery({ projectId, credentials: JSON.parse(key) });
  return _client;
}

/** Ejecuta una consulta parametrizada (named params) y devuelve las filas. */
export async function bqQuery<T = Record<string, unknown>>(
  query: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const client = await getClient();
  const [rows] = await client.query({
    query,
    params,
    location: process.env.BQ_LOCATION || "US",
  });
  return rows as T[];
}

/**
 * Última modificación de una tabla (cuándo se reescribió por última vez, p. ej.
 * al correr Dataform). Es una llamada a metadatos (sin costo de consulta).
 * Devuelve `null` si la tabla no existe o si la metadata no trae la marca.
 * Propaga BigQueryCredentialsError cuando faltan credenciales.
 */
export async function bqTableLastModified(
  datasetId: string,
  tableId: string
): Promise<Date | null> {
  const client = await getClient();
  const [metadata] = await client.dataset(datasetId).table(tableId).getMetadata();
  const ms = Number(metadata?.lastModifiedTime);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
}

// --- ESCRITURA (ingesta) ----------------------------------------------------
// El mismo SA de lectura (`bigquery-sync@`) tiene `dataEditor`, así que puede
// crear tablas, correr DML y cargar datos. Se usa para la ingesta ASQ.

function bqLocation(): string {
  return process.env.BQ_LOCATION || "US";
}

/** Crea el dataset si no existe (idempotente). */
export async function ensureDataset(datasetId: string): Promise<void> {
  const client = await getClient();
  const dataset = client.dataset(datasetId);
  const [exists] = await dataset.exists();
  if (!exists) await dataset.create({ location: bqLocation() });
}

/**
 * Crea la tabla con el esquema dado si no existe (idempotente). No modifica el
 * esquema si la tabla ya existe. `clustering` acelera filtros/DELETE por columna.
 */
export async function ensureTable(
  datasetId: string,
  tableId: string,
  fields: BqField[],
  opts: { clustering?: string[] } = {}
): Promise<void> {
  const client = await getClient();
  const table = client.dataset(datasetId).table(tableId);
  const [exists] = await table.exists();
  if (exists) return;
  await client.dataset(datasetId).createTable(tableId, {
    schema: { fields },
    location: bqLocation(),
    ...(opts.clustering ? { clustering: { fields: opts.clustering } } : {}),
  });
}

/** Ejecuta un DML (DELETE/UPDATE/MERGE) y devuelve las filas afectadas. */
export async function bqDml(
  query: string,
  params: Record<string, unknown> = {}
): Promise<number> {
  const client = await getClient();
  const [job] = await client.createQueryJob({ query, params, location: bqLocation() });
  await job.getQueryResults(); // espera a que termine
  const [metadata] = await job.getMetadata();
  return Number(metadata?.statistics?.query?.numDmlAffectedRows ?? 0);
}

export interface BqLoadResult {
  jobId: string | null;
  outputRows: number;
}

/**
 * Carga NDJSON (una fila JSON por línea) a una tabla vía load job (WRITE_APPEND
 * por defecto). Los load jobs NO usan el streaming buffer, así que la tabla queda
 * disponible de inmediato para DELETE/consulta (clave para la idempotencia ASQ).
 */
export async function bqLoadNdjson(
  datasetId: string,
  tableId: string,
  ndjson: string,
  fields: BqField[],
  opts: { writeDisposition?: "WRITE_APPEND" | "WRITE_TRUNCATE" } = {}
): Promise<BqLoadResult> {
  const client = await getClient();
  const table = client.dataset(datasetId).table(tableId);
  const metadata = {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    schema: { fields },
    writeDisposition: opts.writeDisposition || "WRITE_APPEND",
    location: bqLocation(),
  };
  return await new Promise<BqLoadResult>((resolve, reject) => {
    let jobId: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Readable.from([ndjson])
      .pipe(table.createWriteStream(metadata))
      .on("job", (job: any) => {
        jobId = job?.id ?? job?.metadata?.jobReference?.jobId ?? null;
      })
      .on("error", reject)
      .on("complete", (arg: any) => {
        const md = arg?.metadata ?? arg;
        const err = md?.status?.errorResult;
        if (err) {
          reject(new Error(`Load job falló: ${err.message || JSON.stringify(err)}`));
          return;
        }
        const outputRows = Number(md?.statistics?.load?.outputRows ?? 0);
        resolve({ jobId, outputRows });
      });
  });
}
