// Encuestas AGA (experiencia de Pasajeros / Acompañantes) para el informe mensual.
//
// Se lee de Postgres (ResponseSet/Answer de los planes AGA vigentes del aeropuerto)
// y se agrega por la ESTRUCTURA del cuestionario, no por ids de pregunta, para que
// funcione igual con cualquier versión (v15 pasajeros, v4 acompañantes, y las que vengan):
//  - NPS: la pregunta de tipo NPS.
//  - Satisfacción general: RATING cuyo texto dice "Satisfacción general".
//  - Atributos: el resto de RATING fuera de los módulos (núcleo "Experiencia general").
//  - Servicios (módulos): secciones "<Servicio> — evaluación"; el % de uso sale de la
//    pregunta Sí/No de la sección "<Servicio>" (gate). Si el gate fue "No", las
//    calificaciones de ese módulo no cuentan (aunque el formulario las haya pedido).
// N/A no entra en los promedios (se guarda como valueText, sin valueNumber).

import { prisma } from "@/lib/prisma";
import { computeNps } from "@/lib/metrics";
import { planDisplayTitle } from "@/lib/planTitle";
import { SURVEY_VIEWS, type SurveyViewKey } from "@/lib/surveys/views";

export type AgaAudience = "Pasajeros" | "Acompañantes";

export type AgaScore = { label: string; avg: number | null; n: number };
export type AgaService = AgaScore & { usePct: number | null; useN: number };

export type AgaStats = {
  n: number; // encuestas (envíos con al menos una respuesta)
  nps: number | null;
  npsN: number;
  promotersPct: number | null;
  passivesPct: number | null;
  detractorsPct: number | null;
  sat: number | null; // satisfacción general, promedio 1–5
  satN: number;
  satTop2: number | null; // % que puso 4 o 5
  attributes: AgaScore[]; // orden: mejor -> peor
  services: AgaService[]; // orden: mejor -> peor
  // Cada ítem calificado (excepto la satisfacción general), con su sección (sin "— evaluación").
  // Lo usan el Dashboard (dimensiones por sección, matriz importancia–desempeño).
  items: AgaItem[];
};

export type AgaItem = { section: string; label: string; avg: number | null; n: number; sum: number };

export type AgaSurvey = {
  audience: AgaAudience;
  planTitle: string;
  target: number; // meta total del plan
  month: AgaStats;
  period: AgaStats; // acumulado desde el inicio del plan hasta el mes del informe
  voice: AgaVoice; // "Voz del pasajero": apreciación + citas destacadas en el Dashboard
};

export type AgaQuote = { label: string; text: string; nps: number | null };
export type AgaVoice = { appraisal: string | null; quotes: AgaQuote[] };

/** Vista del Dashboard que corresponde a cada público (clave de la apreciación). */
export const agaViewOf = (a: AgaAudience): SurveyViewKey => (a === "Pasajeros" ? "aga-pasajeros" : "aga-acompanantes");

/** Respuesta ya aplanada (entrada de la agregación pura). */
export type AgaAnswerRow = {
  type: string;
  text: string;
  section: string | null;
  num: number | null;
  txt: string | null;
};

const EVAL_SECTION = /^(.*?)\s*[—–-]\s*evaluaci[oó]n\s*$/i;
const GLOBAL_SAT = /satisfacci[oó]n general/i;

export function audienceOf(questionnaireTitle: string): AgaAudience {
  return /acompa/i.test(questionnaireTitle) ? "Acompañantes" : "Pasajeros";
}

/** ¿El cuestionario es una Encuesta AGA? (por título: "Encuesta AGA - Pasajeros", …). */
export function isAgaQuestionnaire(title: string): boolean {
  return /\bAGA\b/i.test(title);
}

/** Etiqueta corta: quita el paréntesis final ("Información de vuelos (pantallas…)" -> "Información de vuelos"). */
export function cleanLabel(text: string): string {
  return text.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

function byAvgDesc<T extends AgaScore>(a: T, b: T): number {
  if (a.avg == null && b.avg == null) return a.label.localeCompare(b.label);
  if (a.avg == null) return 1;
  if (b.avg == null) return -1;
  return b.avg - a.avg;
}

/** Agrega un conjunto de encuestas (cada una = lista de respuestas). Pura, testeable. */
export function aggregateAga(responses: AgaAnswerRow[][]): AgaStats {
  const npsScores: number[] = [];
  const satScores: number[] = [];
  const attr = new Map<string, number[]>();
  // servicio -> { sum, count, responses con nota }
  const svc = new Map<string, { sum: number; count: number; resp: number }>();
  const gate = new Map<string, { yes: number; total: number }>();
  const items = new Map<string, { section: string; label: string; sum: number; n: number }>();
  const addItem = (section: string, label: string, v: number) => {
    const k = `${section}|${label}`;
    const it = items.get(k) ?? { section, label, sum: 0, n: 0 };
    it.sum += v;
    it.n++;
    items.set(k, it);
  };
  let n = 0;

  for (const answers of responses) {
    if (answers.length === 0) continue;
    n++;

    // Gates de esta encuesta: sección "<Servicio>" con respuesta Sí/No.
    const gateOf = new Map<string, boolean>();
    for (const a of answers) {
      if (a.type !== "SINGLE_CHOICE" || !a.section || a.txt == null) continue;
      const v = a.txt.trim().toLowerCase();
      if (v !== "sí" && v !== "si" && v !== "no") continue;
      const key = a.section.trim();
      gateOf.set(key, v !== "no");
      const g = gate.get(key) ?? { yes: 0, total: 0 };
      g.total++;
      if (v !== "no") g.yes++;
      gate.set(key, g);
    }

    const svcSeen = new Set<string>();
    for (const a of answers) {
      if (a.num == null) continue;
      if (a.type === "NPS") {
        npsScores.push(a.num);
        continue;
      }
      if (a.type !== "RATING") continue;
      const m = a.section ? EVAL_SECTION.exec(a.section.trim()) : null;
      if (m) {
        const base = m[1].trim();
        if (gateOf.get(base) === false) continue; // dijo que no lo usó
        addItem(base, cleanLabel(a.text), a.num);
        const s = svc.get(base) ?? { sum: 0, count: 0, resp: 0 };
        s.sum += a.num;
        s.count++;
        if (!svcSeen.has(base)) {
          s.resp++;
          svcSeen.add(base);
        }
        svc.set(base, s);
      } else if (GLOBAL_SAT.test(a.text)) {
        satScores.push(a.num);
      } else {
        const label = cleanLabel(a.text);
        addItem((a.section ?? "").trim(), label, a.num);
        const arr = attr.get(label) ?? [];
        arr.push(a.num);
        attr.set(label, arr);
      }
    }
  }

  const { nps, n: npsN } = computeNps(npsScores);
  const prom = npsScores.filter((s) => s >= 9).length;
  const det = npsScores.filter((s) => s <= 6).length;

  const attributes: AgaScore[] = [...attr.entries()]
    .map(([label, xs]) => ({ label, avg: xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null, n: xs.length }))
    .sort(byAvgDesc);

  const services: AgaService[] = [...svc.entries()]
    .map(([label, s]) => {
      const g = gate.get(label);
      return {
        label,
        avg: s.count ? round1(s.sum / s.count) : null,
        n: s.resp,
        usePct: g ? pctOf(g.yes, g.total) : null,
        useN: g?.total ?? 0,
      };
    })
    .sort(byAvgDesc);

  return {
    n,
    nps,
    npsN,
    promotersPct: pctOf(prom, npsN),
    passivesPct: npsN ? 100 - (pctOf(prom, npsN) ?? 0) - (pctOf(det, npsN) ?? 0) : null,
    detractorsPct: pctOf(det, npsN),
    sat: satScores.length ? round1(satScores.reduce((a, b) => a + b, 0) / satScores.length) : null,
    satN: satScores.length,
    satTop2: pctOf(satScores.filter((s) => s >= 4).length, satScores.length),
    attributes,
    services,
    items: [...items.values()].map((it) => ({ ...it, avg: it.n ? round1(it.sum / it.n) : null })),
  };
}

const ymFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" });
/** Mes "YYYY-MM" de una fecha, en hora de Chile. */
export const ymOf = (d: Date) => ymFmt.format(d).slice(0, 7);

type AgaPlan = { id: string; name: string | null; totalTarget: number; questionnaire: { title: string } };

/**
 * Encuestas AGA de los planes indicados (ya filtrados como vigentes del aeropuerto).
 * Una entrada por plan AGA, Pasajeros antes que Acompañantes.
 */
export async function getAgaSurveys(plans: AgaPlan[], month: string): Promise<AgaSurvey[]> {
  const aga = plans.filter((p) => isAgaQuestionnaire(p.questionnaire.title));
  if (aga.length === 0) return [];

  const [sets, appraisals] = await Promise.all([
    prisma.responseSet.findMany({
      where: { workPlanId: { in: aga.map((p) => p.id) } },
      select: {
        workPlanId: true,
        createdAt: true,
        answers: {
          select: {
            valueNumber: true,
            valueText: true,
            highlight: { select: { id: true } },
            question: { select: { type: true, text: true, section: { select: { title: true } } } },
          },
        },
      },
    }),
    prisma.surveyAppraisal.findMany({
      where: { scope: { in: aga.map((p) => p.id) }, mes: month },
      select: { view: true, scope: true, text: true },
    }),
  ]);

  const out: AgaSurvey[] = aga.map((plan) => {
    const audience = audienceOf(plan.questionnaire.title);
    const cfg = SURVEY_VIEWS[agaViewOf(audience)];
    const monthRows: AgaAnswerRow[][] = [];
    const periodRows: AgaAnswerRow[][] = [];
    const quotes: AgaQuote[] = [];
    for (const s of sets) {
      if (s.workPlanId !== plan.id) continue;
      const ym = ymOf(s.createdAt);
      if (ym > month) continue; // posterior al mes del informe
      const rows = s.answers.map((a) => ({
        type: a.question.type,
        text: a.question.text,
        section: a.question.section?.title ?? null,
        num: a.valueNumber,
        txt: a.valueText,
      }));
      periodRows.push(rows);
      if (ym !== month) continue;
      monthRows.push(rows);
      // Citas destacadas (★) en el Dashboard, de las encuestas del mes.
      const nps = s.answers.find((a) => a.question.type === "NPS" && a.valueNumber != null)?.valueNumber ?? null;
      for (const a of s.answers) {
        if (!a.highlight || a.question.type !== "TEXT" || !a.valueText?.trim()) continue;
        const label = cfg.openLabels.find((o) => o.match.test(a.question.text))?.label ?? cleanLabel(a.question.text);
        quotes.push({ label, text: a.valueText.trim(), nps });
      }
    }
    return {
      audience,
      planTitle: planDisplayTitle(plan.questionnaire.title, plan.name),
      target: plan.totalTarget,
      month: aggregateAga(monthRows),
      period: aggregateAga(periodRows),
      voice: {
        appraisal: appraisals.find((x) => x.scope === plan.id && x.view === cfg.key)?.text ?? null,
        quotes,
      },
    };
  });

  const order = (a: AgaAudience) => (a === "Pasajeros" ? 0 : 1);
  // Se incluyen aunque aún no tengan encuestas: la diapositiva muestra el estado vacío.
  return out.sort((a, b) => order(a.audience) - order(b.audience) || a.planTitle.localeCompare(b.planTitle));
}
