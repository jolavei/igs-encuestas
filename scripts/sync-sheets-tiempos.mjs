// Consolida los 3 Google Sheets (Google Forms de tiempos de procesos, sedes
// IQQ/CJC/PMC) en UNA tabla de BigQuery con el MISMO esquema que
// `encuestas.mediciones_de_tiempos`, para poder unir el histórico con las
// mediciones que se levantan desde la app.
//
// - Lee cada hoja con la Google Sheets API v4 (la cuenta de servicio debe tener
//   los archivos compartidos en modo lectura + la Sheets API habilitada).
// - Mapea por POSICIÓN de columna (ver scripts/sheets-tiempos-map.mjs): los forms
//   tienen encabezados duplicados por sección.
// - Construye los TIMESTAMP combinando la fecha de la "Marca temporal" con la
//   hora-del-día de cada medición, en hora de Chile (respeta horario de verano).
//   Si la hora de fin es menor a la de inicio, asume cruce de medianoche (+24 h).
// - Carga completa (WRITE_TRUNCATE): cada corrida reemplaza la tabla. Idempotente.
//
// Variables de entorno:
//   GCP_PROJECT_ID   proyecto de Google Cloud (ej. igs-encuestas)
//   GCP_SA_KEY       JSON (texto) de la cuenta de servicio (BigQuery + Sheets)
//   BQ_DATASET       dataset destino (default: tiempos_procesos)
//   BQ_LOCATION      ubicación del dataset (default: US)
//   BQ_TABLE         tabla destino (default: mediciones_sheets)
//   DRY_RUN          "true" => lee y mapea, imprime estadísticas, NO toca BigQuery
//
// Uso local (requiere el JSON de la SA en GCP_SA_KEY):
//   DRY_RUN=true node --env-file=.env.prod scripts/sync-sheets-tiempos.mjs

import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GoogleAuth } from "google-auth-library";
import { SEDES, normalizeProcess, normalizeAirline } from "./sheets-tiempos-map.mjs";

const {
  GCP_PROJECT_ID,
  GCP_SA_KEY,
  BQ_DATASET = "tiempos_procesos",
  BQ_LOCATION = "US",
  BQ_TABLE = "mediciones_sheets",
  DRY_RUN,
} = process.env;

const dryRun = DRY_RUN === "true";
const SOURCE = "GOOGLE_FORM"; // marca de origen (la app usa FIELD | QR_PUBLIC)

// --- Esquema destino: idéntico a encuestas.mediciones_de_tiempos ---
export const FIELDS = [
  { name: "response_id", type: "STRING" },
  { name: "company_name", type: "STRING" },
  { name: "location_name", type: "STRING" },
  { name: "source", type: "STRING" },
  { name: "responded_at", type: "TIMESTAMP" },
  { name: "version_number", type: "INT64" },
  { name: "process", type: "STRING" },
  { name: "checkin_airline", type: "STRING" },
  { name: "checkin_t1", type: "TIMESTAMP" },
  { name: "checkin_t2", type: "TIMESTAMP" },
  { name: "checkin_comments", type: "STRING" },
  { name: "avsec_t1", type: "TIMESTAMP" },
  { name: "avsec_t2", type: "TIMESTAMP" },
  { name: "avsec_comments", type: "STRING" },
  { name: "baggage_claim_t1", type: "TIMESTAMP" },
  { name: "baggage_claim_t2", type: "TIMESTAMP" },
  { name: "baggage_claim_t3", type: "TIMESTAMP" },
  { name: "baggage_claim_comments", type: "STRING" },
  { name: "passport_outbound_t1", type: "TIMESTAMP" },
  { name: "passport_outbound_t2", type: "TIMESTAMP" },
  { name: "passport_outbound_comments", type: "STRING" },
  { name: "passport_inbound_t1", type: "TIMESTAMP" },
  { name: "passport_inbound_t2", type: "TIMESTAMP" },
  { name: "passport_inbound_comments", type: "STRING" },
  { name: "border_protection_t1", type: "TIMESTAMP" },
  { name: "border_protection_t2", type: "TIMESTAMP" },
  { name: "border_protection_comments", type: "STRING" },
];

// --- Hora de Chile (mismo algoritmo que src/lib/dates.ts) ---
const CHILE_TZ = "America/Santiago";
const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHILE_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function chileOffsetMs(instant) {
  const parts = partsFmt.formatToParts(instant);
  const at = (t) => Number(parts.find((p) => p.type === t).value);
  const wall = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour"), at("minute"), at("second"));
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}
const utcToChileDay = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: CHILE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Reloj de pared chileno (Y-M-D H:M:S) -> instante Date (UTC). */
function chileWallToUtc(y, mo, d, hh, mm, ss) {
  const wall = Date.UTC(y, mo - 1, d, hh, mm, ss);
  const first = new Date(wall - chileOffsetMs(new Date(wall)));
  const second = new Date(wall - chileOffsetMs(first));
  const target = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const valid = [first, second].filter((c) => utcToChileDay(c) === target);
  return valid[0] || second;
}

// --- Parseo de la hoja ---
function parseStamp(str) {
  // "18/8/2025 14:50:40" (d/m/yyyy [H]H:MM[:SS])
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{1,2}))?/.exec((str || "").trim());
  if (!m) return null;
  return { y: +m[3], mo: +m[2], d: +m[1], hh: +m[4], mm: +m[5], ss: +(m[6] || 0) };
}
function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{1,2}))?/.exec((str || "").trim());
  if (!m) return null;
  return { hh: +m[1], mm: +m[2], ss: +(m[3] || 0) };
}
const iso = (date) => (date ? date.toISOString() : null);

/** Construye el TIMESTAMP (ISO) de un hito a partir de la fecha de medición + hora. */
function buildTs(measDate, timeStr) {
  const t = parseTime(timeStr);
  if (!t) return null;
  return chileWallToUtc(measDate.y, measDate.mo, measDate.d, t.hh, t.mm, t.ss);
}
/**
 * Ordena cronológicamente y corrige cruces de medianoche (+24h) SOLO cuando el
 * resultado es plausible (salto <= maxGapMin). Un "fin < inicio" que tras el +24h
 * daría un salto enorme es casi siempre un error de captura (horas invertidas):
 * en ese caso se descarta ese hito (null) para no inventar duraciones de ~24h.
 * Devuelve { times, invalid }.
 */
function chainClean(instants, maxGapMin = 360) {
  const out = [];
  let prev = null;
  let invalid = false;
  for (let cur of instants) {
    if (!cur) { out.push(null); continue; }
    if (prev) {
      while (cur.getTime() < prev.getTime()) cur = new Date(cur.getTime() + 86400000);
      if (cur.getTime() - prev.getTime() > maxGapMin * 60000) {
        out.push(null); // salto implausible -> probable error de captura
        invalid = true;
        continue; // no se usa como ancla para los hitos siguientes
      }
    }
    out.push(cur);
    prev = cur;
  }
  return { times: out, invalid };
}
const joinComments = (...parts) => {
  const p = parts.filter((x) => x != null && String(x).trim() !== "");
  return p.length ? p.join(" · ") : null;
};

// --- Resolución de índices de columna por (nombre, ocurrencia) ---
const norm = (s) => (s || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
function resolveCols(headers, colsSpec) {
  const H = headers.map(norm);
  const idx = {};
  const missing = [];
  for (const [field, spec] of Object.entries(colsSpec)) {
    const target = norm(spec.name);
    const want = spec.occ || 1;
    let count = 0, found = -1;
    for (let i = 0; i < H.length; i++) {
      if (H[i] === target && ++count === want) { found = i; break; }
    }
    idx[field] = found;
    if (found === -1) missing.push(`${field} ("${spec.name}"${spec.occ ? ` #${spec.occ}` : ""})`);
  }
  return { idx, missing };
}

// --- Sheets API ---
async function readSheet(token, spreadsheetId, tab) {
  const range = encodeURIComponent(tab);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}` +
    `?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status} para ${spreadsheetId} (${tab}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.values || [];
}

// --- Transformación de una sede ---
export function transformSede(sede, rows) {
  const stats = {
    total: rows.length - 1,
    porProceso: { "Check in": 0, AVSEC: 0, "Retiro de equipajes": 0 },
    excluidas: 0,
    stampInvalida: 0,
    invalidos: 0,
    aerolineaDesconocida: new Set(),
  };
  if (rows.length < 2) return { out: [], stats, missing: ["(hoja vacía)"] };

  const { idx, missing } = resolveCols(rows[0], sede.cols);
  const get = (row, field) => (idx[field] >= 0 ? row[idx[field]] : undefined);
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const process = normalizeProcess(get(row, "process"));
    if (!process) { stats.excluidas++; continue; }

    const stamp = parseStamp(get(row, "timestamp"));
    if (!stamp) { stats.stampInvalida++; continue; }
    const respondedAt = chileWallToUtc(stamp.y, stamp.mo, stamp.d, stamp.hh, stamp.mm, stamp.ss);
    const measDate = { y: stamp.y, mo: stamp.mo, d: stamp.d };

    // Fila base con todo en null (todas las columnas del esquema destino).
    const o = Object.fromEntries(FIELDS.map((f) => [f.name, null]));
    o.response_id = `${sede.code}-r${r + 1}`; // fila real de la hoja (1-based, +cabecera)
    o.company_name = sede.company_name;
    o.location_name = sede.location_name;
    o.source = SOURCE;
    o.responded_at = iso(respondedAt);
    o.process = process;

    if (process === "Check in") {
      const rawAir = get(row, "checkin_airline");
      const air = normalizeAirline(rawAir);
      if (rawAir && rawAir.trim() && !air) stats.aerolineaDesconocida.add(rawAir.trim());
      const t1raw = get(row, "checkin_t1"), t2raw = get(row, "checkin_t2");
      const { times: [t1, t2], invalid } = chainClean([buildTs(measDate, t1raw), buildTs(measDate, t2raw)]);
      if (invalid) stats.invalidos++;
      o.checkin_airline = air;
      o.checkin_t1 = iso(t1);
      o.checkin_t2 = iso(t2);
      const counters = get(row, "checkin_counters");
      o.checkin_comments = joinComments(
        counters ? `N° counters: ${counters}` : null,
        rawAir && rawAir.trim() ? `Aerolínea (orig): ${rawAir.trim()}` : null,
        invalid ? `⚠ horas fuera de rango (orig ${t1raw || "?"}–${t2raw || "?"})` : null,
        get(row, "obs")
      );
      stats.porProceso["Check in"]++;
    } else if (process === "AVSEC") {
      const t1raw = get(row, "avsec_t1"), t2raw = get(row, "avsec_t2");
      const { times: [t1, t2], invalid } = chainClean([buildTs(measDate, t1raw), buildTs(measDate, t2raw)]);
      if (invalid) stats.invalidos++;
      o.avsec_t1 = iso(t1);
      o.avsec_t2 = iso(t2);
      const xray = get(row, "avsec_xray");
      o.avsec_comments = joinComments(
        xray ? `Máquinas rayos X: ${xray}` : null,
        invalid ? `⚠ horas fuera de rango (orig ${t1raw || "?"}–${t2raw || "?"})` : null,
        get(row, "obs")
      );
      stats.porProceso.AVSEC++;
    } else if (process === "Retiro de equipajes") {
      const t1raw = get(row, "baggage_t1"), t2raw = get(row, "baggage_t2"), t3raw = get(row, "baggage_t3");
      const { times: [t1, t2, t3], invalid } = chainClean([
        buildTs(measDate, t1raw), buildTs(measDate, t2raw), buildTs(measDate, t3raw),
      ]);
      if (invalid) stats.invalidos++;
      o.baggage_claim_t1 = iso(t1);
      o.baggage_claim_t2 = iso(t2);
      o.baggage_claim_t3 = iso(t3);
      const rawAir = get(row, "retiro_airline");
      const air = normalizeAirline(rawAir) || (rawAir && rawAir.trim()) || null;
      o.baggage_claim_comments = joinComments(
        air ? `Aerolínea: ${air}` : null,
        invalid ? `⚠ horas fuera de rango (orig ${t1raw || "?"}–${t2raw || "?"}–${t3raw || "?"})` : null,
        get(row, "obs")
      );
      stats.porProceso["Retiro de equipajes"]++;
    }

    out.push(o);
  }
  return { out, stats, missing };
}

async function main() {
  if (!GCP_SA_KEY) {
    console.error("Falta GCP_SA_KEY (JSON de la cuenta de servicio).");
    process.exit(1);
  }
  if (!dryRun && !GCP_PROJECT_ID) {
    console.error("Falta GCP_PROJECT_ID (o usa DRY_RUN=true).");
    process.exit(1);
  }
  const credentials = JSON.parse(GCP_SA_KEY);

  const auth = new GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/bigquery",
    ],
  });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  let all = [];
  for (const sede of SEDES) {
    process.stdout.write(`\nLeyendo ${sede.code} (${sede.tab})... `);
    const rows = await readSheet(token, sede.spreadsheetId, sede.tab);
    console.log(`${rows.length} filas (con cabecera).`);
    const { out, stats, missing } = transformSede(sede, rows);
    if (missing.length) console.warn(`  ⚠ columnas no encontradas: ${missing.join(", ")}`);
    console.log(
      `  mapeadas: ${out.length} | Check-in: ${stats.porProceso["Check in"]}, ` +
        `AVSEC: ${stats.porProceso.AVSEC}, Retiro: ${stats.porProceso["Retiro de equipajes"]} | ` +
        `excluidas: ${stats.excluidas}, timestamp inválido: ${stats.stampInvalida}, ` +
        `horas fuera de rango: ${stats.invalidos}`
    );
    if (stats.aerolineaDesconocida.size)
      console.warn(`  ⚠ aerolíneas sin normalizar: ${[...stats.aerolineaDesconocida].join(" | ")}`);
    if (out.length && dryRun) {
      console.log("  muestra (2 filas):");
      for (const s of out.slice(0, 2)) console.log("   ", JSON.stringify(s));
    }
    all = all.concat(out);
  }

  console.log(`\nTotal filas a cargar: ${all.length}`);
  if (dryRun) {
    console.log("[dry-run] No se escribe en BigQuery.");
    return;
  }
  if (all.length === 0) {
    console.error("No hay filas para cargar; se aborta para no vaciar la tabla.");
    process.exit(1);
  }

  const { BigQuery } = await import("@google-cloud/bigquery");
  const bq = new BigQuery({ projectId: GCP_PROJECT_ID, credentials });
  const dataset = bq.dataset(BQ_DATASET);
  const [exists] = await dataset.exists();
  if (!exists) {
    await bq.createDataset(BQ_DATASET, { location: BQ_LOCATION });
    console.log(`Dataset creado: ${BQ_DATASET} (${BQ_LOCATION})`);
  }

  const ndjson = all.map((o) => JSON.stringify(o)).join("\n");
  const tmpFile = join(tmpdir(), `bq_${BQ_TABLE}_${Date.now()}.ndjson`);
  writeFileSync(tmpFile, ndjson);
  try {
    await dataset.table(BQ_TABLE).load(tmpFile, {
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      schema: { fields: FIELDS },
      writeDisposition: "WRITE_TRUNCATE",
      autodetect: false,
      location: BQ_LOCATION,
    });
    console.log(`\nListo: ${all.length} filas en ${GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE}`);
  } finally {
    rmSync(tmpFile, { force: true });
  }
}

// Solo corre el sync cuando el archivo se ejecuta directamente (no al importarlo).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("Error en sync-sheets-tiempos:", e.message);
    process.exit(1);
  });
}
