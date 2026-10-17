// Análisis de un cuestionario de experiencia para el Dashboard (pura, testeable).
// Los KPIs, atributos y servicios salen de `aggregateAga` (la misma agregación del
// informe mensual), así el Dashboard y el PPTX muestran siempre los mismos números.

import { aggregateAga, cleanLabel, type AgaAnswerRow, type AgaScore, type AgaService } from "@/lib/reports/agaSurvey";
import { computeNps } from "@/lib/metrics";
import type { SurveyViewConfig } from "@/lib/surveys/views";

/** Respuesta individual de una encuesta (ya aplanada desde Prisma). */
export type SurveyAnswer = AgaAnswerRow & { answerId: string; json: string | null };
export type SurveyResponse = { id: string; ym: string; date: string; answers: SurveyAnswer[] };

export type Kpis = {
  n: number;
  nps: number | null;
  promotersPct: number | null;
  passivesPct: number | null;
  detractorsPct: number | null;
  sat: number | null;
  satTop2: number | null;
};

export type TrendPoint = { ym: string; n: number; nps: number | null; sat: number | null };
export type SectionScore = { label: string; avg: number | null; n: number; items: AgaScore[] };
export type ImportanceRow = { option: string; pct: number; n: number; perf: number | null };
export type ProfileQuestion = {
  question: string;
  multi: boolean;
  answered: number;
  rows: { value: string; n: number; pct: number; nps: number | null }[];
};
export type OpenAnswer = {
  answerId: string;
  responseId: string;
  ym: string;
  date: string; // ISO
  text: string;
  nps: number | null;
  sat: number | null;
  context: string[];
  highlighted: boolean;
};
export type OpenQuestion = { label: string; question: string; answers: OpenAnswer[] };

export type SurveyAnalysis = {
  kpis: Kpis;
  attributes: AgaScore[];
  services: AgaService[];
  sections: SectionScore[];
  importance: ImportanceRow[] | null;
  profile: ProfileQuestion[];
  open: OpenQuestion[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const isYesNo = (opts: string[]) => opts.length > 0 && opts.every((o) => /^(s[ií]|no)$/i.test(o.trim()));
const GLOBAL_SAT = /satisfacci[oó]n general/i;
const IMPORTANCE_Q = /m[aá]s importantes/i;

function jsonValues(a: SurveyAnswer): string[] {
  if (a.json) {
    try {
      const v = JSON.parse(a.json);
      if (Array.isArray(v)) return v.map(String);
    } catch {
      /* valor inválido: se ignora */
    }
  }
  return a.txt ? [a.txt] : [];
}

const npsOf = (r: SurveyResponse) => r.answers.find((a) => a.type === "NPS" && a.num != null)?.num ?? null;
const satOf = (r: SurveyResponse) =>
  r.answers.find((a) => a.type === "RATING" && a.num != null && GLOBAL_SAT.test(a.text))?.num ?? null;

/** KPIs titulares de un conjunto de encuestas. */
export function kpisOf(responses: SurveyResponse[]): Kpis {
  const st = aggregateAga(responses.map((r) => r.answers));
  return {
    n: st.n,
    nps: st.nps,
    promotersPct: st.promotersPct,
    passivesPct: st.passivesPct,
    detractorsPct: st.detractorsPct,
    sat: st.sat,
    satTop2: st.satTop2,
  };
}

/** Evolutivo mensual (NPS, satisfacción y n) de los meses con datos. */
export function trendOf(responses: SurveyResponse[]): TrendPoint[] {
  const byYm = new Map<string, SurveyResponse[]>();
  for (const r of responses) {
    if (r.answers.length === 0) continue;
    byYm.set(r.ym, [...(byYm.get(r.ym) ?? []), r]);
  }
  return [...byYm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, rs]) => {
      const k = kpisOf(rs);
      return { ym, n: k.n, nps: k.nps, sat: k.sat };
    });
}

/** Preguntas de perfil / segmentación: selección única o múltiple que no sean Sí/No ni la de importancia. */
export function profileQuestionsOf(responses: SurveyResponse[]): { question: string; multi: boolean; options: string[] }[] {
  const seen = new Map<string, { question: string; multi: boolean; options: Set<string>; order: number }>();
  let order = 0;
  for (const r of responses)
    for (const a of r.answers) {
      if (a.type !== "SINGLE_CHOICE" && a.type !== "DROPDOWN" && a.type !== "MULTI_CHOICE") continue;
      if (IMPORTANCE_Q.test(a.text)) continue;
      const q = seen.get(a.text) ?? { question: a.text, multi: a.type === "MULTI_CHOICE", options: new Set(), order: order++ };
      for (const v of jsonValues(a)) q.options.add(v);
      seen.set(a.text, q);
    }
  return [...seen.values()]
    .filter((q) => !isYesNo([...q.options]))
    .sort((a, b) => a.order - b.order)
    .map((q) => ({ question: q.question, multi: q.multi, options: [...q.options] }));
}

/** ¿La encuesta respondió `value` en la pregunta `question`? (segmentación). */
export function matchesSegment(r: SurveyResponse, question: string, value: string): boolean {
  return r.answers.some((a) => a.text === question && jsonValues(a).includes(value));
}

export function analyzeSurvey(
  responses: SurveyResponse[],
  cfg: SurveyViewConfig,
  highlighted: Set<string>
): SurveyAnalysis {
  const rs = responses.filter((r) => r.answers.length > 0);
  const st = aggregateAga(rs.map((r) => r.answers));

  // Dimensiones por sección (vista "sections"): promedio ponderado de sus ítems.
  const secMap = new Map<string, { sum: number; n: number; items: AgaScore[] }>();
  for (const it of st.items) {
    const s = secMap.get(it.section) ?? { sum: 0, n: 0, items: [] };
    s.sum += it.sum;
    s.n += it.n;
    s.items.push({ label: it.label, avg: it.avg, n: it.n });
    secMap.set(it.section, s);
  }
  const sections: SectionScore[] = [...secMap.entries()].map(([label, s]) => ({
    label,
    avg: s.n ? round1(s.sum / s.n) : null,
    n: s.n,
    items: s.items.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1)),
  }));

  // Matriz importancia–desempeño: % que eligió el aspecto entre los 3 más importantes
  // vs nota promedio de los ítems que lo representan.
  let importance: ImportanceRow[] | null = null;
  if (cfg.importance) {
    const counts = new Map<string, number>();
    let answered = 0;
    for (const r of rs) {
      const a = r.answers.find((x) => x.type === "MULTI_CHOICE" && IMPORTANCE_Q.test(x.text));
      if (!a) continue;
      const vals = jsonValues(a);
      if (vals.length === 0) continue;
      answered++;
      for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    importance = cfg.importance.map(({ option, match }) => {
      const its = st.items.filter((it) => match.test(`${it.section}|${it.label}`));
      const sum = its.reduce((a, b) => a + b.sum, 0);
      const n = its.reduce((a, b) => a + b.n, 0);
      const c = counts.get(option) ?? 0;
      return { option, n: c, pct: answered ? Math.round((c / answered) * 100) : 0, perf: n ? round1(sum / n) : null };
    });
  }

  // Perfil: distribución + NPS por valor.
  const profile: ProfileQuestion[] = profileQuestionsOf(rs).map((q) => {
    const counts = new Map<string, { n: number; nps: number[] }>();
    let answered = 0;
    for (const r of rs) {
      const a = r.answers.find((x) => x.text === q.question);
      const vals = a ? jsonValues(a) : [];
      if (vals.length === 0) continue;
      answered++;
      const nps = npsOf(r);
      for (const v of vals) {
        const c = counts.get(v) ?? { n: 0, nps: [] };
        c.n++;
        if (nps != null) c.nps.push(nps);
        counts.set(v, c);
      }
    }
    return {
      question: q.question,
      multi: q.multi,
      answered,
      rows: [...counts.entries()]
        .map(([value, c]) => ({
          value,
          n: c.n,
          pct: answered ? Math.round((c.n / answered) * 100) : 0,
          nps: computeNps(c.nps).nps,
        }))
        .sort((a, b) => b.n - a.n),
    };
  });

  // Respuestas abiertas (TEXT), con el contexto de la encuesta.
  const openMap = new Map<string, OpenQuestion>();
  for (const r of rs) {
    const ctx = cfg.context
      .map((re) => r.answers.find((a) => re.test(a.text) && (a.txt || a.json)))
      .filter((a): a is SurveyAnswer => !!a)
      .map((a) => jsonValues(a).join(", "));
    const nps = npsOf(r);
    const sat = satOf(r);
    for (const a of r.answers) {
      if (a.type !== "TEXT" || !a.txt?.trim()) continue;
      if (cfg.openExclude.some((re) => re.test(a.text))) continue;
      const label = cfg.openLabels.find((o) => o.match.test(a.text))?.label ?? cleanLabel(a.text);
      const q = openMap.get(label) ?? { label, question: a.text, answers: [] };
      q.answers.push({
        answerId: a.answerId,
        responseId: r.id,
        ym: r.ym,
        date: r.date,
        text: a.txt.trim(),
        nps,
        sat,
        context: ctx,
        highlighted: highlighted.has(a.answerId),
      });
      openMap.set(label, q);
    }
  }
  const order = cfg.openLabels.map((o) => o.label);
  const open = [...openMap.values()]
    .map((q) => ({ ...q, answers: q.answers.sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => {
      const ia = order.indexOf(a.label);
      const ib = order.indexOf(b.label);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

  return {
    kpis: kpisOf(rs),
    attributes: st.attributes,
    services: st.services,
    sections,
    importance,
    profile,
    open,
  };
}
