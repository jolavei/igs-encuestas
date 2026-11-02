// Base de respuestas (server-only): lee de Postgres los envíos de un plan de trabajo.

import { prisma } from "@/lib/prisma";
import { planDisplayTitle } from "@/lib/planTitle";
import {
  answerCell,
  buildQuestionColumns,
  questionLabels,
  type BaseQuestion,
} from "@/lib/responseBase/build";
import type { CellValue, GridColumn, GridRow } from "@/lib/responseBase/grid";

// Las respuestas se entregan por tramos: un plan puede tener miles de envíos con decenas
// de preguntas, y de una sola vez no cabría en el límite de tiempo y tamaño de Vercel.
export const BASE_PAGE_SIZE = 500;

export type BasePlanOption = {
  id: string;
  label: string;
  company: string;
  active: boolean;
  responses: number;
};

export type BasePage = {
  columns: GridColumn[];
  rows: GridRow[];
  total: number;
  nextCursor: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  FIELD: "Campo",
  QR_PUBLIC: "QR público",
  IMPORT_SHEETS: "Importado",
};

const META_SECTION = "Envío";

// Columnas del envío, antes de las preguntas. La versión solo si el plan tiene varias.
function metaColumns(versionCount: number): GridColumn[] {
  const col = (key: string, label: string, kind: GridColumn["kind"] = "text"): GridColumn => ({
    key,
    label,
    section: META_SECTION,
    kind,
    meta: true,
  });
  return [
    col("m_date", "Fecha de envío", "date"),
    col("m_location", "Sede"),
    col("m_surveyor", "Encuestador"),
    col("m_source", "Origen"),
    ...(versionCount > 1 ? [col("m_version", "Versión")] : []),
  ];
}

/** Planes para el selector: vigentes primero y, dentro de cada grupo, los más recientes. */
export async function listBasePlans(): Promise<BasePlanOption[]> {
  const plans = await prisma.workPlan.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      questionnaire: { select: { title: true } },
      company: { select: { name: true } },
      location: { select: { name: true } },
      _count: { select: { responses: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return plans
    .map((p) => ({
      id: p.id,
      label: planDisplayTitle(p.questionnaire.title, p.name),
      company: [p.company.name, p.location?.name].filter(Boolean).join(" · "),
      active: p.status === "ACTIVE",
      responses: p._count.responses,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active));
}

/** Un tramo de envíos del plan, del más nuevo al más antiguo. null si el plan no existe. */
export async function getBasePage(planId: string, cursor: string | null): Promise<BasePage | null> {
  const plan = await prisma.workPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) return null;

  // Solo las versiones con las que de verdad se respondió en este plan.
  const usedVersions = await prisma.responseSet.findMany({
    where: { workPlanId: planId },
    distinct: ["versionId"],
    select: { versionId: true },
  });
  const versions = await prisma.questionnaireVersion.findMany({
    where: { id: { in: usedVersions.map((v) => v.versionId) } },
    select: {
      versionNumber: true,
      questions: {
        select: {
          id: true,
          order: true,
          type: true,
          text: true,
          config: true,
          equivalenceKey: true,
          section: { select: { order: true, title: true } },
        },
      },
    },
  });

  const { columns, columnOf } = buildQuestionColumns(versions);
  const questionById = new Map<string, BaseQuestion>(
    versions.flatMap((v) => v.questions.map((q) => [q.id, q] as const))
  );
  const labelsById = new Map([...questionById.values()].map((q) => [q.id, questionLabels(q)]));

  const [total, sets] = await Promise.all([
    prisma.responseSet.count({ where: { workPlanId: planId } }),
    prisma.responseSet.findMany({
      where: { workPlanId: planId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BASE_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        createdAt: true,
        source: true,
        location: { select: { name: true } },
        surveyor: { select: { firstName: true, lastName: true, name: true, email: true } },
        version: { select: { versionNumber: true } },
        answers: {
          select: {
            questionId: true,
            valueNumber: true,
            valueText: true,
            valueDate: true,
            valueJson: true,
          },
        },
      },
    }),
  ]);

  const rows: GridRow[] = sets.map((s) => {
    const who = s.surveyor
      ? [s.surveyor.firstName, s.surveyor.lastName].filter(Boolean).join(" ") ||
        s.surveyor.name ||
        s.surveyor.email
      : null;
    const cells: Record<string, CellValue> = {
      m_date: s.createdAt.getTime(),
      m_source: SOURCE_LABELS[s.source] ?? s.source,
      m_version: `v${s.version.versionNumber}`,
    };
    if (s.location) cells.m_location = s.location.name;
    if (who) cells.m_surveyor = who;
    for (const a of s.answers) {
      const q = questionById.get(a.questionId);
      const key = columnOf.get(a.questionId);
      if (!q || !key) continue;
      const v = answerCell(q, a, labelsById.get(q.id)!);
      if (v !== null) cells[key] = v;
    }
    return { id: s.id, cells };
  });

  return {
    columns: [...metaColumns(versions.length), ...columns],
    rows,
    total,
    nextCursor: sets.length === BASE_PAGE_SIZE ? sets[sets.length - 1].id : null,
  };
}
