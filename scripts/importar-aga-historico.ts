// Importa el histórico de las Encuestas AGA (formulario antiguo de Google Forms, en
// Google Sheets) como versión histórica (v0) de cada cuestionario AGA en la web.
//
// Para cada público (Pasajeros / Acompañantes):
//   1. Lee la hoja de respuestas con la cuenta de servicio (GCP_SA_KEY, solo lectura).
//   2. Mapea cada columna con src/lib/surveys/agaHistoric.ts (si queda alguna columna
//      sin regla, se detiene y la lista).
//   3. Reemplaza lo importado antes (idempotente): borra respuestas, plan y versión v0.
//   4. Crea la versión v0 (ARCHIVED) con secciones y preguntas, un plan "Histórico Google
//      Forms" (COMPLETED) de la misma empresa/sede del plan AGA vigente, y una respuesta
//      por fila con source = IMPORT_SHEETS.
// Solo se importan respuestas anteriores al corte de fuente (1-oct-2026): desde ahí la
// fuente válida es la web.
//
// Uso:
//   node --env-file=.env --import tsx scripts/importar-aga-historico.ts --dry-run
//   node --env-file=.env --import tsx scripts/importar-aga-historico.ts [--publico=pasajeros|acompanantes]
// DATABASE_URL decide la base destino (local o Neon).

import { randomUUID } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { PrismaClient } from "@prisma/client";
import {
  chileDay,
  convertRow,
  mapColumns,
  normHeader,
  sectionsOf,
  type ColumnSpec,
  type HistoricAudience,
  type RowIssue,
} from "@/lib/surveys/agaHistoric";
import { AGA_HISTORIC_SOURCE } from "@/lib/reports/agaSurvey";
import { REPORT_SOURCE_CUTOFF } from "@/lib/reports/tiemposQuery";

const SOURCES: { audience: HistoricAudience; slug: string; title: string; sheetId: string; gid: number }[] = [
  {
    audience: "Pasajeros",
    slug: "pasajeros",
    title: "Encuesta AGA - Pasajeros",
    sheetId: "1HQzvoN-pLFKo7huAHMDXdk4s9e9MBpS8I0H9gK_asNg",
    gid: 1360776275,
  },
  {
    audience: "Acompañantes",
    slug: "acompanantes",
    title: "Encuesta AGA - Acompañantes",
    sheetId: "154K5h9pxKZFQ0kcJvbiOql3nP1h8pRuoCiUEuwn6edA",
    gid: 820641878,
  },
];

export const HISTORIC_PLAN_NAME = "Histórico Google Forms";
const HISTORIC_VERSION = 0;
const BATCH = 2000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.find((a) => a.startsWith("--publico="))?.split("=")[1];

const prisma = new PrismaClient();

async function sheetsToken(): Promise<string> {
  const key = process.env.GCP_SA_KEY;
  if (!key) throw new Error("Falta GCP_SA_KEY (cuenta de servicio con acceso de lectura a los Sheets).");
  const auth = new GoogleAuth({
    credentials: JSON.parse(key),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return (await (await auth.getClient()).getAccessToken()).token!;
}

async function readSheet(token: string, sheetId: string, gid: number): Promise<unknown[][]> {
  const H = { headers: { Authorization: `Bearer ${token}` } };
  const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title)`, H);
  if (!meta.ok) throw new Error(`Sheets API ${meta.status}: ${(await meta.text()).slice(0, 200)}`);
  const tabs = ((await meta.json()) as { sheets: { properties: { sheetId: number; title: string } }[] }).sheets;
  const tab = tabs.find((t) => t.properties.sheetId === gid)?.properties.title;
  if (!tab) throw new Error(`No hay pestaña con gid ${gid} en ${sheetId}.`);
  // Valores sin formato: las marcas temporales llegan como número de serie (la hoja de
  // pasajeros muestra fechas en dos formatos distintos).
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}` +
      `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
    H
  );
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { values?: unknown[][] }).values ?? [];
}

type QuestionDef = { col: number; spec: Exclude<ColumnSpec, { kind: "timestamp" } | { kind: "skip" }> };

const QTYPE = { rating: "RATING", gate: "SINGLE_CHOICE", choice: "SINGLE_CHOICE", text: "TEXT" } as const;

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);

async function importAudience(token: string, src: (typeof SOURCES)[number]) {
  console.log(`\n=== ${src.title} ===`);
  const rows = await readSheet(token, src.sheetId, src.gid);
  const headers = (rows[0] ?? []).map((h) => String(h ?? ""));
  const specs = mapColumns(src.audience, headers);

  const unmapped = specs.map((s, i) => (s ? null : `  [${i}] ${normHeader(headers[i]).slice(0, 110)}`)).filter(Boolean);
  if (unmapped.length) {
    throw new Error(`Columnas sin regla de mapeo (agrégalas en agaHistoric.ts):\n${unmapped.join("\n")}`);
  }

  const issues: RowIssue[] = [];
  const converted = rows
    .slice(1)
    .map((r, i) => convertRow(specs, r, i + 2, issues))
    .filter((r): r is NonNullable<typeof r> => r !== null && r.answers.length > 0);
  const valid = converted.filter((r) => chileDay(r.createdAt) < REPORT_SOURCE_CUTOFF);
  const dropped = converted.length - valid.length;

  const days = valid.map((r) => chileDay(r.createdAt)).sort();
  console.log(
    `Filas: ${rows.length - 1} · importables: ${valid.length}` +
      (dropped ? ` · ${dropped} desde el ${REPORT_SOURCE_CUTOFF} (fuente = web, se omiten)` : "") +
      ` · rango ${days[0]} → ${days.at(-1)}`
  );
  if (issues.length) {
    const sample = issues.slice(0, 10).map((x) => `  fila ${x.row} col ${x.col}: "${x.value}" (${x.reason})`);
    console.log(`Avisos: ${issues.length}\n${sample.join("\n")}`);
  }
  const bySeason = new Map<string, number>();
  for (const d of days) {
    const [y, m] = d.split("-").map(Number);
    const code = m >= 4 && m <= 9 ? `SU${String(y).slice(2)}` : `WI${String(m >= 10 ? y : y - 1).slice(2)}`;
    bySeason.set(code, (bySeason.get(code) ?? 0) + 1);
  }
  console.log(`Por temporada: ${[...bySeason.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")}`);

  const questions: QuestionDef[] = specs
    .map((spec, col) => ({ col, spec }))
    .filter((q): q is QuestionDef => !!q.spec && q.spec.kind !== "timestamp" && q.spec.kind !== "skip");
  const sections = sectionsOf(specs);
  console.log(`Versión histórica: ${sections.length} secciones · ${questions.length} preguntas`);

  if (dryRun) return;

  const questionnaire = await prisma.questionnaire.findFirst({
    where: { title: src.title },
    include: {
      versions: { where: { status: "ACTIVE" }, include: { questions: { include: { section: true } } } },
      workPlans: { where: { status: { not: "CANCELLED" }, name: { not: HISTORIC_PLAN_NAME } }, orderBy: { windowStart: "desc" } },
    },
  });
  if (!questionnaire) throw new Error(`No existe el cuestionario "${src.title}".`);
  const basePlan = questionnaire.workPlans[0];
  if (!basePlan) throw new Error(`"${src.title}" no tiene plan de trabajo: no sé a qué empresa/sede asignar el histórico.`);

  // equivalenceKey de la web para las preguntas equivalentes (misma sección y texto).
  const webKeys = new Map<string, string>();
  for (const q of questionnaire.versions[0]?.questions ?? []) {
    if (q.equivalenceKey) webKeys.set(`${q.section?.title ?? ""}|${q.text}`, q.equivalenceKey);
  }

  // Idempotente: se borra lo importado antes (respuestas → plan → versión v0).
  const old = await prisma.questionnaireVersion.findUnique({
    where: { questionnaireId_versionNumber: { questionnaireId: questionnaire.id, versionNumber: HISTORIC_VERSION } },
  });
  if (old) {
    const del = await prisma.responseSet.deleteMany({ where: { versionId: old.id } });
    await prisma.questionnaireVersion.delete({ where: { id: old.id } });
    console.log(`Reemplazo: ${del.count} respuestas importadas antes`);
  }
  await prisma.workPlan.deleteMany({ where: { questionnaireId: questionnaire.id, name: HISTORIC_PLAN_NAME } });

  const version = await prisma.questionnaireVersion.create({
    data: {
      questionnaireId: questionnaire.id,
      versionNumber: HISTORIC_VERSION,
      status: "ARCHIVED",
      note: `Histórico del formulario antiguo (Google Forms), importado desde Google Sheets ${src.sheetId}. Escala: Muy Bueno 5 · Bueno 4 · Regular 3 · Malo 2 · Muy Malo 1 · No opina = N/A. Sin NPS ni satisfacción general.`,
    },
  });
  const sectionIds = new Map<string, string>();
  for (const [i, title] of sections.entries()) {
    const s = await prisma.questionSection.create({
      data: { versionId: version.id, order: i + 1, title, routing: i === sections.length - 1 ? "SUBMIT" : "NEXT" },
    });
    sectionIds.set(title, s.id);
  }
  const questionIdByCol = new Map<number, string>();
  await prisma.question.createMany({
    data: questions.map((q, i) => {
      const id = randomUUID();
      questionIdByCol.set(q.col, id);
      const { section, text } = q.spec;
      return {
        id,
        versionId: version.id,
        sectionId: sectionIds.get(section)!,
        order: i + 1,
        type: QTYPE[q.spec.kind],
        text,
        config:
          q.spec.kind === "rating"
            ? JSON.stringify({ maxStars: 5 })
            : q.spec.kind === "gate"
              ? JSON.stringify({ options: [{ value: "Sí", label: "Sí" }, { value: "No", label: "No" }], multi: false })
              : null,
        equivalenceKey: webKeys.get(`${section}|${text}`) ?? `hist_${slug(`${section}_${text}`)}`,
      };
    }),
  });

  const plan = await prisma.workPlan.create({
    data: {
      companyId: basePlan.companyId,
      questionnaireId: questionnaire.id,
      locationId: basePlan.locationId,
      name: HISTORIC_PLAN_NAME,
      windowStart: valid[0]?.createdAt ?? new Date(),
      windowEnd: valid.at(-1)?.createdAt ?? new Date(),
      totalTarget: 0,
      status: "COMPLETED",
      comment: `Respuestas del formulario antiguo hasta el ${REPORT_SOURCE_CUTOFF} (importadas el ${chileDay(new Date())}).`,
    },
  });

  const sorted = [...valid].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let answers = 0;
  for (let i = 0; i < sorted.length; i += BATCH) {
    const chunk = sorted.slice(i, i + BATCH);
    const sets = chunk.map((r) => ({ id: randomUUID(), r }));
    await prisma.responseSet.createMany({
      data: sets.map(({ id, r }) => ({
        id,
        versionId: version.id,
        locationId: basePlan.locationId,
        workPlanId: plan.id,
        source: AGA_HISTORIC_SOURCE,
        createdAt: r.createdAt,
        syncedAt: r.createdAt,
      })),
    });
    const rowsA = sets.flatMap(({ id, r }) =>
      r.answers.map((a) => ({
        id: randomUUID(),
        responseSetId: id,
        questionId: questionIdByCol.get(a.col)!,
        valueNumber: a.num,
        valueText: a.text,
      }))
    );
    for (let j = 0; j < rowsA.length; j += 5000) await prisma.answer.createMany({ data: rowsA.slice(j, j + 5000) });
    answers += rowsA.length;
    console.log(`  ${Math.min(i + BATCH, sorted.length)}/${sorted.length} respuestas`);
  }
  console.log(`Listo: versión v0, plan "${HISTORIC_PLAN_NAME}" y ${sorted.length} respuestas (${answers} valores).`);
}

async function main() {
  const token = await sheetsToken();
  for (const src of SOURCES) {
    if (only && only !== src.slug) continue;
    await importAudience(token, src);
  }
  if (dryRun) console.log("\n[dry-run] No se escribió en la base.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
