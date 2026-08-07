// SOLO LECTURA. Desglosa las respuestas (ResponseSet) de una SEDE para entender de
// dónde salen los números que ve el rol CLIENTE en "Resultados por sede"
// (src/app/cliente/page.tsx -> locationMetrics):
//   - "Respuestas" = TODOS los ResponseSet de la sede (sin filtrar por cuestionario/plan/fecha).
//   - "CSAT" = top-box de las respuestas RATING/LIKERT de la sede (notas en las 2 casillas altas).
//   - "NPS"  = de las respuestas tipo NPS de la sede.
//
// Este script NO borra nada: lista cada respuesta con su origen, cuestionario+versión,
// encuestador, plan, si está sincronizada a BQ y sus notas, y recalcula NPS/CSAT igual
// que la app para que cuadre con lo que se ve en pantalla. Si resultan ser de prueba,
// se limpian con scripts/limpiar-respuestas-dummy.mjs (ese sí borra, por plan).
//
// Variables de entorno:
//   DATABASE_URL  Postgres de PRODUCCIÓN (Neon). NO uses --env-file=.env (ese es el local).
//   SEDE          Subcadena del nombre de la sede a buscar. Def: "PMC".
//
// Uso (PowerShell, con Node fuera del PATH):
//   $env:PATH = "C:\Program Files\nodejs;$env:PATH"
//   $env:DATABASE_URL = "postgresql://...neon.tech/...?sslmode=require"
//   $env:SEDE = "PMC"; node scripts/diagnostico-respuestas-sede.mjs

import pg from "pg";

const { DATABASE_URL, SEDE } = process.env;
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

// createdAt es "timestamp without time zone" guardado en UTC; se reinterpreta como UTC
// y se convierte a hora de Chile dentro del SQL (no depende del huso de la máquina).
const createdChile = `to_char((rs."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI')`;

await client.connect();
console.log(`\nConectado a: ${safeHost(DATABASE_URL)}  (SOLO LECTURA)`);

try {
  // --- Sedes que hacen match con el nombre buscado. ---
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
    console.log(`\nNinguna sede cuyo nombre contenga "${sede}". Prueba con otra subcadena (SEDE=...).`);
    process.exit(0);
  }

  for (const loc of locs) {
    console.log(`\n════════════════════════════════════════════════════════════`);
    console.log(`SEDE: ${loc.company} · ${loc.name}   (id ${loc.id})`);

    // --- Todas las respuestas de la sede, con contexto. ---
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
          ORDER BY rs."createdAt" ASC`,
        [loc.id]
      )
    ).rows;

    // --- Notas por respuesta (RATING/LIKERT -> CSAT, NPS -> NPS). ---
    const notas = (
      await client.query(
        `SELECT a."responseSetId" AS rsid, ques.type AS qtype, a."valueNumber" AS val
           FROM "Answer" a
           JOIN "ResponseSet" rs ON rs.id = a."responseSetId"
           JOIN "Question" ques ON ques.id = a."questionId"
          WHERE rs."locationId" = $1
            AND a."valueNumber" IS NOT NULL
            AND ques.type IN ('RATING','LIKERT','NPS')`,
        [loc.id]
      )
    ).rows;

    const csatVals = notas.filter((n) => n.qtype === "RATING" || n.qtype === "LIKERT").map((n) => Number(n.val));
    const npsVals = notas.filter((n) => n.qtype === "NPS").map((n) => Number(n.val));

    console.log(`\n  Respuestas (ResponseSet) en la sede: ${rows.length}\n`);
    for (const r of rows) {
      console.log(`  ${r.id}`);
      console.log(
        `    ${r.created_chile} · ${r.source} · ${r.questionnaire} v${r.version} (${r.version_status})` +
          ` · ${r.surveyor || "sin encuestador"} · plan: ${r.plan_id || "—"} · ${r.synced ? "en BQ" : "no sync"}`
      );
    }

    // --- Recalcular NPS/CSAT igual que la app para que cuadre con la pantalla. ---
    const nCsat = csatVals.length;
    let csat = null;
    if (nCsat > 0) {
      // top-box de 2 casillas sobre escala 1..5 (umbral >= 4), igual que computeCsat con max=5.
      const max = Math.max(5, ...csatVals);
      const threshold = max - 1;
      csat = Math.round((csatVals.filter((v) => v >= threshold).length / nCsat) * 100);
    }
    const nNps = npsVals.length;
    let nps = null;
    if (nNps > 0) {
      const prom = npsVals.filter((v) => v >= 9).length;
      const det = npsVals.filter((v) => v <= 6).length;
      nps = Math.round(((prom - det) / nNps) * 100);
    }

    console.log(`\n  → Lo que muestra el cliente para esta sede:`);
    console.log(`      Respuestas: ${rows.length}`);
    console.log(`      NPS:  ${nps ?? "—"}   (sobre ${nNps} nota(s) NPS)`);
    console.log(`      CSAT: ${csat != null ? csat + "%" : "—"}   (sobre ${nCsat} nota(s) RATING/LIKERT)`);
    if (nCsat > 0) console.log(`      Notas RATING/LIKERT: [${csatVals.join(", ")}]`);
  }
} catch (e) {
  console.error("\nError:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
