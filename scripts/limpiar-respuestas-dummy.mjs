// Elimina respuestas "dummy" (de prueba) de un plan de trabajo para que dejen de
// contar como avance. El avance de un plan se calcula contando las filas de
// "ResponseSet" con ese workPlanId (ver src/lib/planProgress.ts), así que borrar
// esas filas las quita del avance. Al borrar un "ResponseSet" se borran en cascada
// sus "Answer" (constraint ON DELETE CASCADE de la base).
//
// Herramienta guiada en 3 pasos (cada uno te dice qué correr después):
//   1) Sin PLAN  -> lista los planes del cuestionario (por defecto "Mediciones de
//                   tiempos") con empresa/sede/ventana y cuántas respuestas tiene
//                   cada uno. Identifica el de IQQ y copia su id.
//   2) PLAN=<id> -> lista TODAS las respuestas de ese plan (fecha Chile, origen,
//                   encuestador, sede, segmento, si ya se sincronizó a BigQuery).
//   3) PLAN=<id> IDS=<id,id,...>  ó  IDS=ALL  -> borra esas respuestas del plan.
//                   Sin APPLY solo simula; con APPLY=true borra de verdad.
//
// Variables de entorno:
//   DATABASE_URL   Postgres de PRODUCCIÓN (Neon). NO uses --env-file=.env (ese es
//                  el Postgres local). Pásala explícita (ejemplos abajo).
//   QUESTIONNAIRE  Título del cuestionario a buscar (subcadena). Def: "Mediciones de tiempos".
//   PLAN           id del WorkPlan sobre el que trabajar.
//   IDS            ids de ResponseSet a borrar, separados por coma. "ALL" = todas las del plan.
//   APPLY          "true" => borra. Sin esto solo muestra lo que haría.
//
// Uso (PowerShell, con Node fuera del PATH):
//   $env:PATH = "C:\Program Files\nodejs;$env:PATH"
//   $env:DATABASE_URL = "postgresql://...neon.tech/...?sslmode=require"
//   node scripts/limpiar-respuestas-dummy.mjs                    # paso 1: lista planes
//   $env:PLAN = "<id-del-plan-IQQ>"; node scripts/limpiar-respuestas-dummy.mjs   # paso 2: lista respuestas
//   $env:IDS = "id1,id2"; node scripts/limpiar-respuestas-dummy.mjs              # paso 3: simulación
//   $env:APPLY = "true"; node scripts/limpiar-respuestas-dummy.mjs               # paso 3: aplica

import pg from "pg";

const { DATABASE_URL, QUESTIONNAIRE, PLAN, IDS, APPLY } = process.env;
const apply = APPLY === "true";
const questionnaire = QUESTIONNAIRE || "Mediciones de tiempos";

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (usa la de Neon/producción, no --env-file=.env).");
  process.exit(1);
}

// Muestra sólo el host (sin credenciales) para confirmar a qué base apuntas.
function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(no se pudo leer el host)";
  }
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

// Fecha de creación mostrada en hora de Chile. La columna es "timestamp without
// time zone" que guarda el instante en UTC; se reinterpreta como UTC y se convierte
// a America/Santiago dentro de SQL para no depender del huso de la máquina.
const createdChileSql = `to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI')`;

await client.connect();
console.log(`\nConectado a: ${safeHost(DATABASE_URL)}${apply ? "   [APPLY: BORRARÁ]" : "   (simulación)"}`);

try {
  // ---- Paso 1: sin PLAN, listar los planes del cuestionario. --------------
  if (!PLAN) {
    const plans = await client.query(
      `SELECT wp.id,
              c.name AS company,
              l.name AS location,
              to_char(wp."windowStart", 'YYYY-MM-DD') AS start_day,
              to_char(wp."windowEnd",   'YYYY-MM-DD') AS end_day,
              wp.status,
              (SELECT count(*) FROM "ResponseSet" rs WHERE rs."workPlanId" = wp.id) AS responses
         FROM "WorkPlan" wp
         JOIN "Questionnaire" q ON q.id = wp."questionnaireId"
         JOIN "Company" c ON c.id = wp."companyId"
         LEFT JOIN "Location" l ON l.id = wp."locationId"
        WHERE q.title ILIKE $1
        ORDER BY wp."createdAt" DESC`,
      [`%${questionnaire}%`]
    );

    console.log(`\nPlanes del cuestionario que contiene "${questionnaire}": ${plans.rows.length}\n`);
    if (plans.rows.length === 0) {
      console.log("  (ninguno). Revisa el título con QUESTIONNAIRE=...");
    }
    for (const p of plans.rows) {
      console.log(`  PLAN ${p.id}`);
      console.log(
        `    ${p.company}${p.location ? " · " + p.location : ""} · ${p.start_day} → ${p.end_day} · ${p.status} · ${p.responses} respuesta(s)`
      );
    }
    console.log(
      `\nSiguiente: identifica el plan de IQQ y córrelo con PLAN=<ese id> para ver sus respuestas.`
    );
    process.exit(0);
  }

  // ---- Verificar que el plan existe. --------------------------------------
  const planRow = (
    await client.query(
      `SELECT wp.id, c.name AS company, l.name AS location, wp.status
         FROM "WorkPlan" wp
         JOIN "Company" c ON c.id = wp."companyId"
         LEFT JOIN "Location" l ON l.id = wp."locationId"
        WHERE wp.id = $1`,
      [PLAN]
    )
  ).rows[0];
  if (!planRow) {
    console.error(`\nNo existe un WorkPlan con id ${PLAN}.`);
    process.exit(1);
  }
  const planLabel = `${planRow.company}${planRow.location ? " · " + planRow.location : ""} (${planRow.status})`;

  // ---- Respuestas del plan. -----------------------------------------------
  const responses = (
    await client.query(
      `SELECT rs.id,
              ${createdChileSql.replace(/"createdAt"/g, 'rs."createdAt"')} AS created_chile,
              rs.source,
              rs."segmentValue"  AS seg1,
              rs."segmentValue2" AS seg2,
              rs."syncedAt" IS NOT NULL AS synced,
              u.email AS surveyor,
              l.name  AS location,
              (SELECT count(*) FROM "Answer" a WHERE a."responseSetId" = rs.id) AS answers
         FROM "ResponseSet" rs
         LEFT JOIN "User" u     ON u.id = rs."surveyorId"
         LEFT JOIN "Location" l ON l.id = rs."locationId"
        WHERE rs."workPlanId" = $1
        ORDER BY rs."createdAt" ASC`,
      [PLAN]
    )
  ).rows;

  console.log(`\nPlan ${PLAN}\n  ${planLabel}\n  ${responses.length} respuesta(s):\n`);
  for (const r of responses) {
    const seg = [r.seg1, r.seg2].filter(Boolean).join(" / ") || "—";
    console.log(`  ${r.id}`);
    console.log(
      `    ${r.created_chile} · ${r.source} · ${r.surveyor || "sin encuestador"} · ${r.location || "sin sede"} · seg: ${seg} · ${r.answers} resp. · ${r.synced ? "sincronizada a BQ" : "no sincronizada"}`
    );
  }

  // ---- Paso 2: sin IDS, sólo mostrar y explicar cómo borrar. --------------
  if (!IDS) {
    console.log(
      `\nSiguiente: para borrar, corre con IDS=<id,id,...> (o IDS=ALL para todas las de este plan).` +
        `\n  Primero sin APPLY (simulación) y luego con APPLY=true para aplicar.`
    );
    process.exit(0);
  }

  // ---- Paso 3: resolver objetivos y borrar. -------------------------------
  const all = IDS.trim().toUpperCase() === "ALL";
  const requested = all
    ? responses.map((r) => r.id)
    : IDS.split(",").map((s) => s.trim()).filter(Boolean);

  const validIds = new Set(responses.map((r) => r.id));
  const targets = requested.filter((id) => validIds.has(id));
  const foreign = requested.filter((id) => !validIds.has(id));

  if (foreign.length > 0) {
    console.log(
      `\n⚠ Se ignoran ${foreign.length} id(s) que NO pertenecen a este plan (por seguridad no se tocan):`
    );
    for (const id of foreign) console.log(`    ${id}`);
  }

  if (targets.length === 0) {
    console.log(`\nNada que borrar (0 ids válidos para este plan).`);
    process.exit(0);
  }

  console.log(`\n${targets.length} respuesta(s) marcadas para borrar:`);
  for (const id of targets) console.log(`    ${id}`);

  if (!apply) {
    console.log(
      `\nSimulación: se borrarían ${targets.length} respuesta(s) (con sus Answer en cascada).` +
        `\nCorre de nuevo con APPLY=true para aplicar.`
    );
    process.exit(0);
  }

  // Borrado real, en transacción. Answer cae por ON DELETE CASCADE.
  await client.query("BEGIN");
  const del = await client.query(
    `DELETE FROM "ResponseSet" WHERE "workPlanId" = $1 AND id = ANY($2::text[])`,
    [PLAN, targets]
  );
  await client.query("COMMIT");

  console.log(`\nListo: ${del.rowCount} respuesta(s) borrada(s) del plan.`);
  console.log(
    `El avance del plan ya no las cuenta. (Si ya estaban sincronizadas a BigQuery, siguen en la tabla del cuestionario en BQ; eso es aparte.)`
  );
} catch (e) {
  try {
    await client.query("ROLLBACK");
  } catch {}
  console.error("\nError:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
