import { prisma } from "@/lib/prisma";
import { buildClientSections } from "@/lib/surveyForm";

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
    include: {
      questions: { orderBy: { order: "asc" } },
      sections: { orderBy: { order: "asc" } },
    },
  });

  const sections = version ? buildClientSections(version.questions, version.sections) : [];

  // Si el plan no fija sede, el encuestador la elige entre las de la empresa.
  const locations = plan.locationId
    ? null
    : plan.company.locations.map((l) => ({ id: l.id, name: l.name }));

  return { plan, hasVersion: !!version, sections, locations };
}
