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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BigQueryClient = any;

let _client: BigQueryClient | null = null;

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
