// Sincroniza las tablas operacionales (Neon/Postgres) -> BigQuery (dataset crudo).
// Carga completa por tabla (WRITE_TRUNCATE): simple e idempotente, ideal para
// volúmenes de encuestas. Pensado para correr por GitHub Actions en un cron.
//
// Variables de entorno:
//   DATABASE_URL    connection string de Neon (Postgres)
//   GCP_PROJECT_ID  proyecto de Google Cloud con BigQuery
//   GCP_SA_KEY      JSON (como texto) de la cuenta de servicio con permisos BigQuery
//   BQ_DATASET      dataset destino (default: raw_postgres)
//   BQ_LOCATION     ubicación del dataset (default: US)
//   DRY_RUN         "true" => solo lee Postgres y muestra conteos, no toca BigQuery
//
// Uso local de prueba (solo lectura):
//   node --env-file=.env -e "process.env.DRY_RUN='true'" ...   (o exporta DRY_RUN)
//   node scripts/sync-bigquery.mjs

import pg from "pg";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const {
  DATABASE_URL,
  GCP_PROJECT_ID,
  GCP_SA_KEY,
  BQ_DATASET = "raw_postgres",
  BQ_LOCATION = "US",
  DRY_RUN,
} = process.env;

const dryRun = DRY_RUN === "true";

// Tablas que NO se sincronizan: auth/sesiones (contienen tokens), el log de sync
// (metadato interno) e internas (prefijo _).
const EXCLUDE = new Set(["Account", "Session", "VerificationToken", "SyncLog"]);

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
if (!dryRun && (!GCP_PROJECT_ID || !GCP_SA_KEY)) {
  console.error("Falta GCP_PROJECT_ID o GCP_SA_KEY (o usa DRY_RUN=true)");
  process.exit(1);
}

// Mapeo de tipo Postgres -> tipo BigQuery.
function bqType(pgType) {
  switch (pgType) {
    case "integer":
    case "smallint":
    case "bigint":
      return "INT64";
    case "double precision":
    case "real":
    case "numeric":
      return "FLOAT64";
    case "boolean":
      return "BOOL";
    case "timestamp without time zone":
    case "timestamp with time zone":
      return "TIMESTAMP";
    case "date":
      return "DATE";
    default:
      return "STRING"; // text, varchar, uuid, json, etc.
  }
}

// Convierte un valor de Postgres al formato que espera BigQuery según el tipo.
function toBqValue(value, type) {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "INT64":
      return Number(value);
    case "FLOAT64":
      return Number(value);
    case "BOOL":
      return Boolean(value);
    case "TIMESTAMP":
      return value instanceof Date ? value.toISOString() : String(value);
    case "DATE":
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

async function main() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("sslmode") ? { rejectUnauthorized: false } : undefined,
  });

  // Lista de tablas de negocio.
  const { rows: tableRows } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  // Solo identificadores válidos (defensa anti-inyección, aunque vengan del catálogo).
  const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const tables = tableRows
    .map((r) => r.table_name)
    .filter((t) => !t.startsWith("_") && !EXCLUDE.has(t) && SAFE_IDENT.test(t));

  // Cliente BigQuery (solo si no es dry-run).
  let dataset = null;
  let bq = null;
  if (!dryRun) {
    const { BigQuery } = await import("@google-cloud/bigquery");
    bq = new BigQuery({
      projectId: GCP_PROJECT_ID,
      credentials: JSON.parse(GCP_SA_KEY),
    });
    dataset = bq.dataset(BQ_DATASET);
    const [exists] = await dataset.exists();
    if (!exists) {
      await bq.createDataset(BQ_DATASET, { location: BQ_LOCATION });
      console.log(`Dataset creado: ${BQ_DATASET} (${BQ_LOCATION})`);
    }
  }

  let totalRows = 0;
  for (const table of tables) {
    // Esquema de la tabla.
    const { rows: cols } = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table]
    );
    const fields = cols
      .filter((c) => SAFE_IDENT.test(c.column_name))
      .map((c) => ({ name: c.column_name, type: bqType(c.data_type) }));

    // Datos.
    const { rows } = await pool.query(`SELECT * FROM "${table}"`);
    totalRows += rows.length;

    if (dryRun) {
      console.log(`[dry-run] ${table}: ${rows.length} filas, ${fields.length} columnas`);
      continue;
    }

    if (rows.length === 0) {
      // Tabla vacía: crear/reemplazar con el esquema correcto (load no acepta vacío).
      const ddl = fields.map((f) => `\`${f.name}\` ${f.type}`).join(", ");
      await bq.query({
        query: `CREATE OR REPLACE TABLE \`${GCP_PROJECT_ID}.${BQ_DATASET}.${table}\` (${ddl})`,
        location: BQ_LOCATION,
      });
      console.log(`${table}: 0 filas (tabla vacía creada)`);
      continue;
    }

    // NDJSON con valores ya convertidos al tipo BigQuery.
    const ndjson = rows
      .map((row) => {
        const obj = {};
        for (const f of fields) obj[f.name] = toBqValue(row[f.name], f.type);
        return JSON.stringify(obj);
      })
      .join("\n");

    const tmpFile = join(tmpdir(), `bq_${table}_${Date.now()}.ndjson`);
    writeFileSync(tmpFile, ndjson);
    try {
      await dataset.table(table).load(tmpFile, {
        sourceFormat: "NEWLINE_DELIMITED_JSON",
        schema: { fields },
        writeDisposition: "WRITE_TRUNCATE",
        autodetect: false,
        location: BQ_LOCATION,
      });
      console.log(`${table}: ${rows.length} filas cargadas`);
    } finally {
      rmSync(tmpFile, { force: true });
    }
  }

  // Registrar la sincronización exitosa (para mostrar la última hora en el panel).
  if (!dryRun) {
    try {
      await pool.query(
        `INSERT INTO "SyncLog" (id, target, tables, rows, "syncedAt")
         VALUES ($1, 'bigquery', $2, $3, now())`,
        [randomUUID(), tables.length, totalRows]
      );
    } catch (e) {
      console.warn("No se pudo registrar SyncLog (¿falta la migración?):", e.message);
    }
  }

  await pool.end();
  console.log(
    `\n${dryRun ? "[dry-run] " : ""}Listo: ${tables.length} tablas, ${totalRows} filas en total.`
  );
}

main().catch((e) => {
  console.error("Error en sync:", e.message);
  process.exit(1);
});
