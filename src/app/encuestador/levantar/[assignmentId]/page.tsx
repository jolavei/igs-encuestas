import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import SurveyRunner from "@/components/SurveyRunner";
import type { ClientQuestion } from "@/components/QuestionInput";
import type { QuestionConfig, QuestionType } from "@/lib/questionTypes";
import { fromJson } from "@/lib/enums";

export default async function Levantar({
  params,
}: {
  params: { assignmentId: string };
}) {
  const user = await getSessionUser();
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { questionnaire: true, location: true },
  });
  if (!assignment || assignment.surveyorId !== user!.id) notFound();

  const version = await prisma.questionnaireVersion.findFirst({
    where: { questionnaireId: assignment.questionnaireId, status: "ACTIVE" },
    orderBy: { versionNumber: "desc" },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!version) {
    return (
      <div className="card">
        <p>Este cuestionario no tiene una versión activa todavía.</p>
        <Link href="/encuestador" className="btn mt-3">
          Volver
        </Link>
      </div>
    );
  }

  const questions: ClientQuestion[] = version.questions.map((q) => ({
    id: q.id,
    order: q.order,
    type: q.type as QuestionType,
    text: q.text,
    required: q.required,
    config: fromJson<QuestionConfig>(q.config),
  }));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/encuestador" className="text-sm text-brand-600">
        ← Plan de trabajo
      </Link>
      <SurveyRunner
        questions={questions}
        endpoint="/api/responses"
        title={assignment.questionnaire.title}
        subtitle={assignment.location?.name ?? undefined}
        offline
        extra={{ assignmentId: assignment.id }}
      />
    </div>
  );
}
