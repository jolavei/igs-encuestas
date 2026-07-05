import { prisma } from "@/lib/prisma";
import { fromJson } from "@/lib/enums";
import type { ClientQuestion } from "@/components/QuestionInput";
import type { QuestionConfig, QuestionType } from "@/lib/questionTypes";

// Carga un plan + la versión ACTIVE de su cuestionario para levantar una encuesta.
export async function getPlanSurvey(planId: string) {
  const plan = await prisma.workPlan.findUnique({
    where: { id: planId },
    include: {
      questionnaire: true,
      location: true,
      company: { include: { locations: true } },
      surveyors: { select: { id: true } },
    },
  });
  if (!plan) return null;

  const version = await prisma.questionnaireVersion.findFirst({
    where: { questionnaireId: plan.questionnaireId, status: "ACTIVE" },
    orderBy: { versionNumber: "desc" },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  const questions: ClientQuestion[] = (version?.questions ?? []).map((q) => ({
    id: q.id,
    order: q.order,
    type: q.type as QuestionType,
    text: q.text,
    required: q.required,
    config: fromJson<QuestionConfig>(q.config),
  }));

  // Si el plan no fija sede, el encuestador la elige entre las de la empresa.
  const locations = plan.locationId
    ? null
    : plan.company.locations.map((l) => ({ id: l.id, name: l.name }));

  return { plan, hasVersion: !!version, questions, locations };
}
