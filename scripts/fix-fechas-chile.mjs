// Corrección puntual (se corre una sola vez): las fechas de calendario que se
// guardaron antes del fix de huso horario quedaron en medianoche UTC, que en
// Chile es el día anterior a las 20:00/21:00. Este script las reescribe al
// instante correcto del día chileno.
//
// Filas afectadas = las que están exactamente en 00:00:00.000 UTC, que es la
// firma de `new Date("YYYY-MM-DD")`. Las escritas con el código nuevo caen en
// 03:00/04:00 UTC, así que el script es idempotente: al correrlo de nuevo ya no
// encuentra nada que cambiar.
//
//   WorkPlan.windowStart -> 00:00:00.000 hora Chile de ese día
//   WorkPlan.windowEnd   -> 23:59:59.999 hora Chile de ese día
//   User.birthDate       -> 00:00:00.000 hora Chile de ese día
//
// Variables de entorno:
//   DATABASE_URL  connection string de Postgres (local o Neon)
//   APPLY         "true" => escribe. Sin esto solo muestra lo que haría.
//
// Uso:
//   node --env-file=.env scripts/fix-fechas-chile.mjs           (simulación)
//   APPLY=true node --env-file=.env scripts/fix-fechas-chile.mjs  (aplica)

import pg from "pg";

const { DATABASE_URL, APPLY } = process.env;
const apply = APPLY === "true";

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const CHILE_TZ = "America/Santiago";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHILE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function chileOffsetMs(instant) {
  const parts = partsFmt.formatToParts(instant);
  const at = (type) => Number(parts.find((p) => p.type === type).value);
  const wall = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour"), at("minute"), at("second"));
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

const utcToChileDay = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

// Mismo algoritmo que src/lib/dates.ts (aquí duplicado porque el script corre
// como .mjs suelto, sin el build de TypeScript).
function chileDayToUtc(ymd, edge = "start") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const wall =
    edge === "end"
      ? Date.UTC(y, mo - 1, d, 23, 59, 59, 999)
      : Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
  const first = new Date(wall - chileOffsetMs(new Date(wall)));
  const second = new Date(wall - chileOffsetMs(first));
  const valid = [first, second].filter((c) => utcToChileDay(c) === ymd);
  if (valid.length === 0) return second;
  return valid.reduce((a, b) => ((edge === "end" ? b > a : b < a) ? b : a));
}

// node-postgres interpreta y serializa los `timestamp without time zone` con la
// zona horaria de la máquina, así que el script nunca deja pasar objetos Date
// por el driver: lee los días como texto (to_char) y escribe texto UTC sin "Z",
// que Postgres guarda literalmente. Así el resultado no depende de dónde corra.
const toPgTimestamp = (d) => d.toISOString().replace("Z", "");

const fmt = (d) =>
  `${d.toISOString()} (Chile: ${new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TZ,
    dateStyle: "short",
  }).format(d)})`;

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

await client.connect();

// Firma de `new Date("YYYY-MM-DD")`: guardado exactamente en medianoche UTC.
const atMidnightUtc = (col) => `"${col}" IS NOT NULL AND "${col}"::time = '00:00:00'`;

try {
  let changes = 0;

  const plans = await client.query(
    `SELECT id,
            to_char("windowStart", 'YYYY-MM-DD') AS start_day,
            to_char("windowEnd", 'YYYY-MM-DD')   AS end_day
       FROM "WorkPlan"
      WHERE ${atMidnightUtc("windowStart")} OR ${atMidnightUtc("windowEnd")}
      ORDER BY "createdAt"`
  );
  console.log(`\nWorkPlan: ${plans.rows.length} plan(es) con fechas en medianoche UTC.`);
  for (const row of plans.rows) {
    const nextStart = chileDayToUtc(row.start_day, "start");
    const nextEnd = chileDayToUtc(row.end_day, "end");
    console.log(`  ${row.id}`);
    console.log(`    inicio ${row.start_day} 00:00 UTC -> ${fmt(nextStart)}`);
    console.log(`    fin    ${row.end_day} 00:00 UTC -> ${fmt(nextEnd)}`);
    if (apply) {
      await client.query(
        `UPDATE "WorkPlan" SET "windowStart" = $1::timestamp, "windowEnd" = $2::timestamp WHERE id = $3`,
        [toPgTimestamp(nextStart), toPgTimestamp(nextEnd), row.id]
      );
    }
    changes++;
  }

  const users = await client.query(
    `SELECT id, email, to_char("birthDate", 'YYYY-MM-DD') AS birth_day
       FROM "User"
      WHERE ${atMidnightUtc("birthDate")}
      ORDER BY email`
  );
  console.log(`\nUser: ${users.rows.length} usuario(s) con fecha de nacimiento en medianoche UTC.`);
  for (const row of users.rows) {
    const next = chileDayToUtc(row.birth_day, "start");
    console.log(`  ${row.email}: ${row.birth_day} 00:00 UTC -> ${fmt(next)}`);
    if (apply) {
      await client.query(`UPDATE "User" SET "birthDate" = $1::timestamp WHERE id = $2`, [
        toPgTimestamp(next),
        row.id,
      ]);
    }
    changes++;
  }

  console.log(
    apply
      ? `\nListo: ${changes} fila(s) actualizada(s).`
      : `\nSimulación: ${changes} fila(s) se actualizarían. Corre con APPLY=true para aplicar.`
  );
} finally {
  await client.end();
}
