// Backfill del histórico ASQ Departures desde el Google Sheet
// "ACI ASQ Survey Results" hacia BigQuery (encuestas.asq_departures).
//
// Reutiliza EXACTAMENTE el mismo pipeline que la ingesta de la web (normalizador +
// esquema canónico + carga idempotente), así el histórico queda consistente con lo
// que suban semestre a semestre. Carga temporada por temporada (memoria acotada).
//
// Pasos:
//   1) En el Google Sheet: Archivo → Descargar → Microsoft Excel (.xlsx).
//   2) node --env-file=.env --import tsx scripts/backfill-asq-sheet.ts <ruta.xlsx> [opciones]
//      (o `npm run backfill:asq -- <ruta.xlsx> [opciones]`)
//
// Opciones:
//   --dry-run            No escribe en BigQuery; imprime el plan por temporada.
//   --sheet=NOMBRE       Fuerza la pestaña a leer (default: "Data" o la primera).
//   --own=ARI,CJC,IQQ    Aeropuertos propios (si no, usa AsqAirportMapping vía Prisma).
//   --quarters=SU19,WI19 Sólo estas temporadas.
//   --force              Continúa aunque se reconozcan pocas columnas (<50/114).
//
// Requiere en el entorno: GCP_PROJECT_ID, GCP_SA_KEY (BigQuery). DATABASE_URL sólo
// si se resuelven los aeropuertos propios vía Prisma (o pasa --own para evitarlo).

import { basename } from "node:path";
import { readDataSheet, normalizeRows, type AsqRecord } from "@/lib/asq/parseWorkbook";
import { ingestDepartures, countExistingRows } from "@/lib/asq/ingestDepartures";

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  let file: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags[k] = v === undefined ? true : v;
    } else if (!file) {
      file = a;
    }
  }
  return { file, flags };
}

async function resolveOwnAirports(flags: Record<string, string | boolean>): Promise<Set<string>> {
  const fromFlag = (flags.own as string) || process.env.ASQ_OWN_AIRPORTS;
  if (fromFlag) return new Set(fromFlag.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  try {
    const { getOwnAirportCodes } = await import("@/lib/asq/ownAirports");
    return await getOwnAirportCodes();
  } catch (e) {
    console.warn(
      `  ⚠ No se pudo leer AsqAirportMapping (${e instanceof Error ? e.message : e}). ` +
        `_is_own_airport quedará en false. Pasa --own=ARI,CJC,... para fijarlos.`
    );
    return new Set();
  }
}

// Columnas de score/índice/peso que el export del Google Sheet trae escaladas
// ×1.000.000 (los decimales con coma "3,66" se volvieron el entero 3660000). Los
// valores válidos son 1..5 (scores) o ~0..3 (Weight), así que cualquier |v|>6 está
// escalado -> ÷1e6. En un Excel limpio (enteros 1..5) esto NO se dispara (no-op).
const SHEET_SCALED_COLUMNS = [
  "Arrival_Category", "Checkin_Category", "Security_Category", "Border_Category",
  "RestShops_Category", "Gates_Category", "Throughout_Category", "Atmosphere_Category",
  "Ease_Index", "Waiting_Index", "Staff_Index", "Emotional_Score", "Weight",
];

function unscaleSheetDecimals(records: AsqRecord[]): number {
  let fixed = 0;
  for (const r of records) {
    for (const c of SHEET_SCALED_COLUMNS) {
      const v = r[c];
      if (typeof v === "number" && Math.abs(v) > 6) {
        r[c] = v / 1_000_000;
        fixed++;
      }
    }
  }
  return fixed;
}

function groupByQuarter(records: AsqRecord[]): Map<string, AsqRecord[]> {
  const map = new Map<string, AsqRecord[]>();
  let sinQuarter = 0;
  for (const r of records) {
    const q = r.Quarter as string | null;
    if (!q) {
      sinQuarter++;
      continue;
    }
    let arr = map.get(q);
    if (!arr) {
      arr = [];
      map.set(q, arr);
    }
    arr.push(r);
  }
  if (sinQuarter) console.warn(`  ⚠ ${sinQuarter} filas sin Quarter (se omiten).`);
  return map;
}

async function main() {
  const { file, flags } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error("Falta la ruta al .xlsx. Uso: ... backfill-asq-sheet.ts <ruta.xlsx> [--dry-run]");
    process.exit(1);
  }
  const dryRun = !!flags["dry-run"];
  const sheet = flags.sheet as string | undefined;
  const onlyQuarters = flags.quarters
    ? new Set((flags.quarters as string).split(",").map((s) => s.trim().toUpperCase()))
    : null;

  console.log(`→ Leyendo ${file}${sheet ? ` (hoja "${sheet}")` : ""}…`);
  const { headers, rows, sheetName } = await readDataSheet(file, sheet);
  const ownAirports = await resolveOwnAirports(flags);
  const { records, report } = normalizeRows({
    headers,
    rows,
    sheetName,
    sourceFile: basename(file),
    ownAirports,
  });

  console.log(
    `   hoja "${sheetName}": ${report.rowCount} filas · ${report.mappedColumns.length}/114 columnas`
  );
  if (report.missingColumns.length)
    console.log(`   faltantes (→ null): ${report.missingColumns.join(", ")}`);
  if (report.ignoredColumns.length)
    console.log(`   descartadas: ${report.ignoredColumns.join(", ")}`);
  if (report.unknownColumns.length)
    console.log(`   desconocidas (→ _extra): ${report.unknownColumns.join(", ")}`);

  if (report.mappedColumns.length < 50 && !flags.force) {
    console.error(
      "\n✖ Se reconocieron muy pocas columnas. ¿La fila 1 tiene los headers? " +
        "Revisa la pestaña con --sheet=NOMBRE o fuerza con --force."
    );
    process.exit(1);
  }

  // Corregir el escalado ×1e6 de los scores/índices/peso del export del Sheet.
  if (!flags["no-unscale"]) {
    const fixed = unscaleSheetDecimals(records);
    if (fixed) console.log(`   des-escalado ÷1e6 aplicado a ${fixed} valores (scores/índices/peso)`);
  }

  let byQuarter = groupByQuarter(records);
  if (onlyQuarters) {
    byQuarter = new Map([...byQuarter].filter(([q]) => onlyQuarters.has(q.toUpperCase())));
  }
  const quarters = [...byQuarter.keys()].sort();
  console.log(`\n${dryRun ? "[dry-run] " : ""}Temporadas: ${quarters.join(", ") || "(ninguna)"}`);

  let totalLoaded = 0;
  let totalReplaced = 0;
  for (const q of quarters) {
    const recs = byQuarter.get(q)!;
    if (dryRun) {
      const existing = await countExistingRows([q]);
      console.log(
        `  ${q}: ${recs.length} filas · ya en BQ: ${existing === null ? "?" : existing}` +
          ` (se reemplazarían)`
      );
      continue;
    }
    process.stdout.write(`  ${q}: cargando ${recs.length} filas… `);
    const res = await ingestDepartures(recs);
    totalLoaded += res.loadedRows;
    totalReplaced += res.replacedRows;
    console.log(`OK (cargadas ${res.loadedRows}, reemplazadas ${res.replacedRows})`);
  }

  console.log(
    `\n${dryRun ? "[dry-run] Nada escrito." : `Listo: ${totalLoaded} filas cargadas, ${totalReplaced} reemplazadas.`}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n✖ Error en el backfill:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
