// Copia la tabla FlightSchedule desde la BD ORIGEN (DATABASE_URL, local) a la BD
// DESTINO (TARGET_DATABASE_URL, Neon/prod). NO llama a AeroDataBox → 0 API units.
// Idempotente: createMany skipDuplicates (usa el @@unique de la tabla).
//
// Requisitos:
//   - La tabla FlightSchedule debe existir en el destino (la crea el deploy de
//     Vercel al correr `prisma migrate deploy`). Si no existe, este script avisa.
//   - TARGET_DATABASE_URL = connection string de Neon (ponla en .env, que está
//     gitignoreado; no la pegues en otros lados).
//
// Uso:  node --env-file=.env scripts/copy-flights-to-neon.mjs

import { PrismaClient } from "@prisma/client";

const SRC = process.env.DATABASE_URL;
const DST = process.env.TARGET_DATABASE_URL;

if (!DST) {
  console.error("❌ Falta TARGET_DATABASE_URL (connection string de Neon) en .env");
  process.exit(1);
}
if (!SRC) {
  console.error("❌ Falta DATABASE_URL (origen local) en .env");
  process.exit(1);
}

const src = new PrismaClient({ datasources: { db: { url: SRC } } });
const dst = new PrismaClient({ datasources: { db: { url: DST } } });

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

console.log(`\nCopia FlightSchedule`);
console.log(`  Origen : ${hostOf(SRC)}`);
console.log(`  Destino: ${hostOf(DST)}\n`);

const rows = await src.flightSchedule.findMany();
console.log(`Filas en origen: ${rows.length}`);
if (rows.length === 0) {
  console.log("Nada que copiar.");
  process.exit(0);
}

const data = rows.map((r) => ({
  airportIata: r.airportIata,
  direction: r.direction,
  flightNumber: r.flightNumber,
  airlineCode: r.airlineCode,
  airlineName: r.airlineName,
  origin: r.origin,
  originName: r.originName,
  destination: r.destination,
  destinationName: r.destinationName,
  date: r.date,
  time: r.time,
  aircraft: r.aircraft,
}));

let inserted = 0;
try {
  for (let i = 0; i < data.length; i += 500) {
    const res = await dst.flightSchedule.createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
    inserted += res.count;
    process.stdout.write(`  copiadas ${Math.min(i + 500, data.length)}/${data.length}\r`);
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/does not exist|relation .* does not exist|P2021/i.test(msg)) {
    console.error(
      "\n❌ La tabla FlightSchedule no existe en el destino todavía.\n" +
        "   Espera a que termine el deploy de Vercel (aplica la migración) y reintenta.",
    );
  } else {
    console.error("\n❌ Error copiando:", msg.slice(0, 300));
  }
  process.exit(1);
}

const total = await dst.flightSchedule.count();
console.log(`\n\n✅ Insertadas ${inserted} filas nuevas. Total en destino: ${total}.`);
await src.$disconnect();
await dst.$disconnect();
