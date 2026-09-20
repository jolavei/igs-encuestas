// Job de Planificación → itinerarios de aeropuertos (AeroDataBox).
//
// Definición: para cada empresa de tipo "aeropuerto" (con IATA en sus sedes),
// consulta TODOS los vuelos comerciales de SALIDA y LLEGADA (origen↔destino) con
// su número de vuelo, para la ventana "mes actual + mes siguiente".
//
// Uso:
//   node --env-file=.env scripts/planificacion-flights-job.mjs [opciones]
// Opciones:
//   --airports=IQQ,CJC     Fuerza estos IATA (por defecto: los de la BD)
//   --from=YYYY-MM-DD       Inicio (por defecto: hoy)
//   --to=YYYY-MM-DD         Fin inclusive (por defecto: último día del mes siguiente)
//   --max-units=N          Tope de API units a gastar en esta corrida (default 200)
//   --out=ruta.json        Dónde escribir el resultado (default: temp del SO)
//   --save-db              Guarda en la tabla FlightSchedule (createMany skipDuplicates)
//   --refresh              Con --save-db: borra las filas previas de los aeropuertos
//                          procesados antes de insertar (reemplazo limpio; para el cron)
//   --dry-run              No llama a la API; solo estima llamadas y units
//
// Cuesta 2 units por llamada; cada día = 2 llamadas (ventanas de 12 h) que traen
// ambos sentidos → 4 units/día/aeropuerto.

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOST = "aerodatabox.p.rapidapi.com";
const UNITS_PER_CALL = 2;

// ---- args ----
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DRY = !!args["dry-run"];
const SAVE_DB = !!args["save-db"];
const REFRESH = !!args["refresh"]; // borra las filas previas de los aeropuertos procesados antes de insertar
const MAX_UNITS = Number(args["max-units"] ?? 200);
const OUT = args.out || join(tmpdir(), "planificacion-vuelos.json");
const KEY = process.env.AERODATABOX_API_KEY;

// ---- fechas ----
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function eachDay(from, to) {
  const out = [];
  for (let d = new Date(from + "T00:00:00"); iso(d) <= to; d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}
const now = new Date();
const defaultFrom = iso(now);
const defaultTo = iso(new Date(now.getFullYear(), now.getMonth() + 2, 0)); // último día del mes siguiente
const FROM = args.from || defaultFrom;
const TO = args.to || defaultTo;

// ---- aeropuertos ----
async function resolveAirports() {
  if (args.airports) {
    return String(args.airports)
      .split(",")
      .map((s) => ({ iata: s.trim().toUpperCase(), name: s.trim().toUpperCase() }));
  }
  const prisma = new PrismaClient();
  const companies = await prisma.company.findMany({
    where: { kind: "aeropuerto" },
    include: { locations: true },
  });
  await prisma.$disconnect();
  const out = [];
  for (const c of companies)
    for (const l of c.locations) if (l.iataCode) out.push({ iata: l.iataCode.toUpperCase(), name: `${c.name} · ${l.name}` });
  return out;
}

// ---- API ----
function windowsFor(day) {
  // Dos tramos de 12 h (el endpoint no admite más).
  return [
    [`${day}T00:00`, `${day}T11:59`],
    [`${day}T12:00`, `${day}T23:59`],
  ];
}
function normNum(s) {
  return (s ?? "").replace(/\s+/g, "").toUpperCase();
}
async function fetchBoth(iata, from, to) {
  const url =
    `https://${HOST}/flights/airports/iata/${iata}/${from}/${to}` +
    `?direction=Both&withLeg=true&withCancelled=false&withCodeshared=true&withLocation=false`;
  const res = await fetch(url, { headers: { "X-RapidAPI-Key": KEY, "X-RapidAPI-Host": HOST } });
  const remaining = Number(res.headers.get("x-ratelimit-api-units-remaining"));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const data = await res.json();
  return { data, remaining };
}

function rowsFrom(iata, data) {
  const rows = [];
  for (const f of data.departures ?? []) {
    rows.push({
      airportIata: iata,
      direction: "salida",
      flightNumber: normNum(f.number),
      airline: f.airline?.name ?? "",
      airlineCode: f.airline?.iata ?? "",
      origin: iata,
      destination: f.arrival?.airport?.iata ?? "",
      destinationName: f.arrival?.airport?.name ?? "",
      date: (f.departure?.scheduledTime?.local ?? "").slice(0, 10),
      time: (f.departure?.scheduledTime?.local ?? "").slice(11, 16),
      aircraft: f.aircraft?.model ?? "",
    });
  }
  for (const f of data.arrivals ?? []) {
    rows.push({
      airportIata: iata,
      direction: "llegada",
      flightNumber: normNum(f.number),
      airline: f.airline?.name ?? "",
      airlineCode: f.airline?.iata ?? "",
      origin: f.departure?.airport?.iata ?? "",
      originName: f.departure?.airport?.name ?? "",
      destination: iata,
      date: (f.arrival?.scheduledTime?.local ?? "").slice(0, 10),
      time: (f.arrival?.scheduledTime?.local ?? "").slice(11, 16),
      aircraft: f.aircraft?.model ?? "",
    });
  }
  return rows;
}

// ---- run ----
const airports = await resolveAirports();
const days = eachDay(FROM, TO);
const totalCalls = airports.length * days.length * 2;
console.log(`\nJob Planificación · ${FROM} → ${TO} (${days.length} días)`);
console.log(`Aeropuertos (${airports.length}): ${airports.map((a) => a.iata).join(", ") || "(ninguno)"}`);
console.log(`Llamadas necesarias: ${totalCalls}  ·  units estimadas: ${totalCalls * UNITS_PER_CALL}`);

if (airports.length === 0) {
  console.log('\n⚠ No hay aeropuertos. Crea empresas kind="aeropuerto" con IATA o usa --airports=IQQ,CJC,PMC');
  process.exit(0);
}
if (DRY) {
  console.log("\n(dry-run: no se llamó a la API)");
  process.exit(0);
}
if (!KEY) {
  console.error("❌ Falta AERODATABOX_API_KEY en .env");
  process.exit(1);
}

const seen = new Set();
const all = [];
let consumed = 0;
let stopped = null;

outer: for (const ap of airports) {
  for (const day of days) {
    for (const [wf, wt] of windowsFor(day)) {
      if (consumed + UNITS_PER_CALL > MAX_UNITS) {
        stopped = `tope --max-units=${MAX_UNITS}`;
        break outer;
      }
      let r;
      try {
        r = await fetchBoth(ap.iata, wf, wt);
      } catch (e) {
        console.error(`  ${ap.iata} ${wf}: ${e.message}`);
        if (/HTTP 429/.test(e.message)) { stopped = "cuota agotada (429)"; break outer; }
        continue;
      }
      consumed += UNITS_PER_CALL;
      for (const row of rowsFrom(ap.iata, r.data)) {
        const k = `${row.direction}|${row.flightNumber}|${row.date}|${row.time}|${row.origin}|${row.destination}`;
        if (seen.has(k)) continue;
        seen.add(k);
        all.push(row);
      }
      if (Number.isFinite(r.remaining) && r.remaining <= 4) { stopped = "units de la cuenta casi agotadas"; break outer; }
    }
  }
  console.log(`  ✓ ${ap.iata}: acumulados ${all.length} vuelos (units usadas: ${consumed})`);
}

// ---- resumen ----
writeFileSync(OUT, JSON.stringify({ from: FROM, to: TO, airports: airports.map((a) => a.iata), rows: all }, null, 2));
const salidas = all.filter((r) => r.direction === "salida").length;
const llegadas = all.filter((r) => r.direction === "llegada").length;
const rutas = new Set(all.map((r) => `${r.origin}-${r.destination}`)).size;
console.log(`\n=== Resumen ===`);
console.log(`Vuelos: ${all.length}  (salidas ${salidas} · llegadas ${llegadas})`);
console.log(`Rutas O-D distintas: ${rutas}`);
console.log(`API units usadas en esta corrida: ${consumed}`);
if (stopped) console.log(`⚠ Detenido por: ${stopped} (resultado parcial)`);
console.log(`Archivo: ${OUT}`);

// ---- guardado en BD (idempotente: createMany skipDuplicates por el @@unique) ----
if (SAVE_DB && all.length > 0) {
  const prisma = new PrismaClient();
  if (REFRESH) {
    const iatas = [...new Set(all.map((r) => r.airportIata))];
    const del = await prisma.flightSchedule.deleteMany({ where: { airportIata: { in: iatas } } });
    console.log(`🧹 refresh: ${del.count} filas previas borradas (${iatas.join(", ")})`);
  }
  let inserted = 0;
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500).map((r) => ({
      airportIata: r.airportIata,
      direction: r.direction,
      flightNumber: r.flightNumber,
      airlineCode: r.airlineCode || null,
      airlineName: r.airline || null,
      origin: r.origin,
      originName: r.originName || null,
      destination: r.destination,
      destinationName: r.destinationName || null,
      date: r.date,
      time: r.time,
      aircraft: r.aircraft || null,
    }));
    const res = await prisma.flightSchedule.createMany({ data: chunk, skipDuplicates: true });
    inserted += res.count;
  }
  await prisma.$disconnect();
  console.log(`💾 BD: ${inserted} filas nuevas guardadas (de ${all.length}; duplicadas omitidas).`);
}

console.log("\nMuestra:");
for (const r of all.slice(0, 8)) {
  console.log(`  [${r.direction}] ${r.flightNumber.padEnd(7)} ${r.date} ${r.time}  ${r.origin} → ${r.destination}`);
}
