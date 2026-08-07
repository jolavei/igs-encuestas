// Borra respuestas (ResponseSet) de una SEDE, de forma ACOTADA y con simulación por
// defecto. Complementa a limpiar-respuestas-dummy.mjs (ese borra por PLAN; este por
// SEDE, así alcanza también respuestas de origen QR sin workPlanId, que son las que
// ve el rol CLIENTE en "Resultados por sede").
//
// Al borrar un ResponseSet se borran en cascada sus Answer (ON DELETE CASCADE).
//
// FLUJO SEGURO (cada paso te dice qué correr después):
//   1) Sin IDS            -> LISTA todas las respuestas de la sede con su cuestionario,
//                            versión (DRAFT/ACTIVE), origen, encuestador, plan y si ya
//                            está sincronizada a BigQuery. NO borra.
//   2) IDS=<id,id,...>    -> marca esas respuestas (o IDS=ALL = todas las que hayan
//      (o IDS=ALL)           quedado tras aplicar los filtros). Sin APPLY solo simula.
//   3) + APPLY=true       -> borra de verdad, en transacción.
//
// Filtros para acotar (opcionales, se combinan con IDS):
//   QUESTIONNAIRE  Subcadena del título del cuestionario. Ej: "Experiencia" borra solo
//                  las de la encuesta de experiencia y NO toca "Mediciones de tiempos".
//   ONLYDRAFT      "true" => solo respuestas de versiones en estado DRAFT (borrador).
//   INCLUYE_BQ     "true" => permite borrar aunque estén sincronizadas a BigQuery.
//                  Por defecto (sin esto) las sincronizadas a BQ se PROTEGEN y se saltan.
//
// Variables de entorno:
//   DATABASE_URL   Postgres de PRODUCCIÓN (Neon). NO uses --env-file=.env (ese es el local).
//   SEDE           Subcadena del nombre de la sede. Def: "PMC".
//   IDS            ids de ResponseSet a borrar, separados por coma. "ALL" = todas las filtradas.
//   APPLY          "true" => borra. Sin esto solo simula.
//
// Uso (PowerShell, con Node fuera del PATH):
//   $env:PATH = "C:\Program Files\nodejs;$env:PATH"
//   $env:DATABASE_URL = "postgresql://...neon.tech/...?sslmode=require"
//   $env:SEDE = "PMC"; node scripts/limpiar-respuestas-sede.mjs                 # paso 1: lista
//   $env:QUESTIONNAIRE = "Experiencia"; $env:IDS = "ALL"; node scripts/limpiar-respuestas-sede.mjs   # paso 2: simula
//   $env:APPLY = "true"; node scripts/limpiar-respuestas-sede.mjs               # paso 3: aplica

import pg from "pg";

const { DATABASE_URL, SEDE, QUESTIONNAIRE, ONLYDRAFT, INCLUYE_BQ, IDS, APPLY } = process.env;
const apply = APPLY === "true";
const onlyDraft = ONLYDRAFT === "true";
const incluyeBq = INCLUYE_BQ === "true";
const sede = SEDE || "PMC";

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (usa la de Neon/producción, no --env-file=.env).");
  process.exit(1);
}

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

const createdChile = `to_char((rs."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI')`;

await client.connect();
console.log(`\nConectado a: ${safeHost(DATABASE_URL)}${apply ? "   [APPLY: BORRARÁ]" : "   (simulación)"}`);

try {
  // --- Resolver la sede (debe ser exactamente una para evitar borrados accidentales). ---
  const locs = (
    await client.query(
      `SELECT l.id, l.name, c.name AS company
         FROM "Location" l JOIN "Company" c ON c.id = l."companyId"
        WHERE l.name ILIKE $1
        ORDER BY c.name, l.name`,
      [`%${sede}%`]
    )
  ).rows;

  if (locs.length === 0) {
    console.log(`\nNinguna sede cuyo nombre contenga "${sede}".`);
    process.exit(1);
  }
  if (locs.length > 1) {
    console.log(`\nHay ${locs.length} sedes que hacen match con "${sede}"; afina SEDE=... para dejar una sola:`);
    for (const l of locs) console.log(`    ${l.company} · ${l.name}`);
    process.exit(1);
  }
  const loc = locs[0];
  console.log(`\nSEDE: ${loc.company} · ${loc.name}   (id ${loc.id})`);
  console.log(
    `Filtros -> cuestionario: ${QUESTIONNAIRE ? `"${QUESTIONNAIRE}"` : "(todos)"} · ` +
      `solo borrador: ${onlyDraft ? "sí" : "no"} · sincronizadas a BQ: ${incluyeBq ? "INCLUIDAS" : "protegidas (se saltan)"}`
  );

  // --- Respuestas de la sede que cumplen los filtros. ---
  const rows = (
    await client.query(
      `SELECT rs.id,
              ${createdChile} AS created_chile,
              rs.source,
              rs."workPlanId" AS plan_id,
              rs."syncedAt" IS NOT NULL AS synced,
              u.email AS surveyor,
              q.title AS questionnaire,
              v."versionNumber" AS version,
              v.status AS version_status
         FROM "ResponseSet" rs
         JOIN "QuestionnaireVersion" v ON v.id = rs."versionId"
         JOIN "Questionnaire" q ON q.id = v."questionnaireId"
         LEFT JOIN "User" u ON u.id = rs."surveyorId"
        WHERE rs."locationId" = $1
          AND ($2::text IS NULL OR q.title ILIKE '%' || $2 || '%')
          AND ($3::bool = false OR v.status = 'DRAFT')
        ORDER BY rs."createdAt" ASC`,
      [loc.id, QUESTIONNAIRE || null, onlyDraft]
    )
  ).rows;

  console.log(`\nRespuestas que cumplen los filtros: ${rows.length}\n`);
  for (const r of rows) {
    const prot = r.synced && !incluyeBq ? "  ⟵ PROTEGIDA (en BQ, no se borra)" : "";
    console.log(`  ${r.id}${prot}`);
    console.log(
      `    ${r.created_chile} · ${r.source} · ${r.questionnaire} v${r.version} (${r.version_status})` +
        ` · ${r.surveyor || "sin encuestador"} · plan: ${r.plan_id || "—"} · ${r.synced ? "en BQ" : "no sync"}`
    );
  }

  // --- Paso 1: sin IDS, solo listar. ---
  if (!IDS) {
    console.log(
      `\nSiguiente: para borrar, corre con IDS=<id,id,...> (o IDS=ALL para todas las de arriba).` +
        `\n  Primero sin APPLY (simulación) y luego con APPLY=true para aplicar.`
    );
    process.exit(0);
  }

  // --- Paso 2/3: resolver objetivos dentro de la sede+filtros. ---
  // Candidatas = filas listadas, menos las protegidas por BQ (salvo INCLUYE_BQ=true).
  const candidatas = rows.filter((r) => incluyeBq || !r.synced);
  const validIds = new Set(candidatas.map((r) => r.id));

  const all = IDS.trim().toUpperCase() === "ALL";
  const requested = all ? [...validIds] : IDS.split(",").map((s) => s.trim()).filter(Boolean);

  const targets = requested.filter((id) => validIds.has(id));
  const foreign = requested.filter((id) => !validIds.has(id));

  if (foreign.length > 0) {
    console.log(`\n⚠ Se ignoran ${foreign.length} id(s) que no están entre las candidatas (fuera de sede/filtros o protegidas por BQ):`);
    for (const id of foreign) console.log(`    ${id}`);
  }

  if (targets.length === 0) {
    console.log(`\nNada que borrar (0 ids válidos tras aplicar sede + filtros).`);
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

  // --- Borrado real, en transacción. ---
  await client.query("BEGIN");
  const del = await client.query(
    `DELETE FROM "ResponseSet" WHERE "locationId" = $1 AND id = ANY($2::text[])`,
    [loc.id, targets]
  );
  await client.query("COMMIT");

  console.log(`\nListo: ${del.rowCount} respuesta(s) borrada(s) de la sede.`);
  console.log(`Los números del cliente (Respuestas/NPS/CSAT) se recalculan solos en la próxima carga.`);
} catch (e) {
  try {
    await client.query("ROLLBACK");
  } catch {}
  console.error("\nError:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
