// Datos del Dashboard de un cuestionario de experiencia (server-only): lee las
// encuestas de Postgres, aplica los filtros (plan, mes, segmento) y arma el análisis.

import { prisma } from "@/lib/prisma";
import { ymOf } from "@/lib/reports/agaSurvey";
import {
  analyzeSurvey,
  kpisOf,
  matchesSegment,
  profileQuestionsOf,
  trendOf,
  type Kpis,
  type SurveyAnalysis,
  type SurveyResponse,
  type TrendPoint,
} from "@/lib/surveys/analyze";
import { SURVEY_VIEWS, type SurveyViewKey } from "@/lib/surveys/views";

export type SurveyFilters = { plan: string | null; mes: string | null; segQ: string | null; segV: string | null };

export type SurveyDashboardData = SurveyAnalysis & {
  view: SurveyViewKey;
  questionnaireFound: boolean;
  plans: { id: string; label: string; target: number; active: boolean }[];
  months: string[]; // meses con encuestas (según plan y segmento)
  segments: { question: string; options: string[] }[]; // preguntas por las que se puede segmentar
  filters: SurveyFilters; // filtros efectivos (con los valores por defecto aplicados)
  target: number | null; // meta del plan seleccionado
  periodN: number; // encuestas del plan en todo el periodo (para el avance vs meta)
  prev: Kpis | null; // mes anterior (si se filtró por mes)
  trend: TrendPoint[];
  appraisal: { text: string; updatedAt: string } | null;
};

const EMPTY: SurveyAnalysis = {
  kpis: { n: 0, nps: null, promotersPct: null, passivesPct: null, detractorsPct: null, sat: null, satTop2: null },
  attributes: [],
  services: [],
  sections: [],
  importance: null,
  profile: [],
  open: [],
};

function prevYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Ámbito de la apreciación: el plan elegido, o "all" si la vista no filtra por plan. */
export const appraisalScope = (plan: string | null) => plan ?? "all";

export async function getSurveyDashboard(view: SurveyViewKey, f: SurveyFilters): Promise<SurveyDashboardData> {
  const cfg = SURVEY_VIEWS[view];
  const q = await prisma.questionnaire.findFirst({
    where: { title: cfg.questionnaireTitle },
    select: {
      id: true,
      workPlans: {
        where: { status: { not: "CANCELLED" } },
        select: {
          id: true,
          name: true,
          status: true,
          totalTarget: true,
          windowStart: true,
          company: { select: { name: true } },
        },
        orderBy: { windowStart: "desc" },
      },
    },
  });

  const base = {
    view,
    plans: [] as SurveyDashboardData["plans"],
    months: [] as string[],
    segments: [] as SurveyDashboardData["segments"],
    target: null as number | null,
    periodN: 0,
    prev: null as Kpis | null,
    trend: [] as TrendPoint[],
    appraisal: null as SurveyDashboardData["appraisal"],
  };
  if (!q) return { ...EMPTY, ...base, questionnaireFound: false, filters: f };

  const plans = q.workPlans.map((p) => ({
    id: p.id,
    label: `${p.name?.trim() || "Plan sin nombre"} · ${p.company.name}`,
    target: p.totalTarget,
    active: p.status === "ACTIVE",
  }));
  // Por defecto, el plan vigente más reciente; sin planes, todas las respuestas.
  const plan =
    f.plan && plans.some((p) => p.id === f.plan)
      ? f.plan
      : f.plan === "all"
        ? null
        : (plans.find((p) => p.active)?.id ?? plans[0]?.id ?? null);

  const sets = await prisma.responseSet.findMany({
    where: {
      version: { questionnaireId: q.id },
      ...(plan ? { workPlanId: plan } : { OR: [{ workPlanId: null }, { workPlan: { status: { not: "CANCELLED" } } }] }),
    },
    select: {
      id: true,
      createdAt: true,
      answers: {
        select: {
          id: true,
          valueNumber: true,
          valueText: true,
          valueJson: true,
          question: { select: { type: true, text: true, section: { select: { title: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const all: SurveyResponse[] = sets
    .filter((s) => s.answers.length > 0)
    .map((s) => ({
      id: s.id,
      ym: ymOf(s.createdAt),
      date: s.createdAt.toISOString(),
      answers: s.answers.map((a) => ({
        answerId: a.id,
        type: a.question.type,
        text: a.question.text,
        section: a.question.section?.title ?? null,
        num: a.valueNumber,
        txt: a.valueText,
        json: a.valueJson,
      })),
    }));

  const segments = profileQuestionsOf(all)
    .filter((p) => !p.multi)
    .map((p) => ({ question: p.question, options: p.options.sort((a, b) => a.localeCompare(b, "es")) }));
  const segOk = !!(f.segQ && f.segV && segments.some((s) => s.question === f.segQ));
  const segmented = segOk ? all.filter((r) => matchesSegment(r, f.segQ!, f.segV!)) : all;

  const months = [...new Set(segmented.map((r) => r.ym))].sort();
  const mes = f.mes && f.mes !== "all" ? f.mes : f.mes === "all" ? null : (months[months.length - 1] ?? null);
  const selected = mes ? segmented.filter((r) => r.ym === mes) : segmented;

  const answerIds = selected.flatMap((r) => r.answers.filter((a) => a.type === "TEXT").map((a) => a.answerId));
  const [hl, appraisal] = await Promise.all([
    answerIds.length
      ? prisma.surveyHighlight.findMany({ where: { answerId: { in: answerIds } }, select: { answerId: true } })
      : Promise.resolve([]),
    mes
      ? prisma.surveyAppraisal.findUnique({
          where: { view_scope_mes: { view, scope: appraisalScope(plan), mes } },
          select: { text: true, updatedAt: true },
        })
      : Promise.resolve(null),
  ]);

  const trend = trendOf(segmented);
  const prevPoint = mes ? segmented.filter((r) => r.ym === prevYm(mes)) : [];

  return {
    ...analyzeSurvey(selected, cfg, new Set(hl.map((h) => h.answerId))),
    ...base,
    questionnaireFound: true,
    plans,
    months,
    segments,
    filters: { plan, mes, segQ: segOk ? f.segQ : null, segV: segOk ? f.segV : null },
    target: plan ? (plans.find((p) => p.id === plan)?.target ?? null) : null,
    periodN: all.length,
    prev: prevPoint.length ? kpisOf(prevPoint) : null,
    trend,
    appraisal: appraisal ? { text: appraisal.text, updatedAt: appraisal.updatedAt.toISOString() } : null,
  };
}
