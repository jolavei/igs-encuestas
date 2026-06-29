import { prisma } from "@/lib/prisma";
import SurveyRunner from "@/components/SurveyRunner";
import type { ClientQuestion } from "@/components/QuestionInput";
import type { QuestionConfig, QuestionType } from "@/lib/questionTypes";
import { fromJson } from "@/lib/enums";

// Flujo publico via QR: sin login. Resuelve la version ACTIVE del cuestionario.
export default async function PublicSurvey({
  params,
}: {
  params: { token: string };
}) {
  const qr = await prisma.qrToken.findUnique({
    where: { token: params.token },
    include: { questionnaire: true, location: true },
  });

  const version =
    qr && qr.active
      ? await prisma.questionnaireVersion.findFirst({
          where: { questionnaireId: qr.questionnaireId, status: "ACTIVE" },
          orderBy: { versionNumber: "desc" },
          include: { questions: { orderBy: { order: "asc" } } },
        })
      : null;

  if (!qr || !qr.active || !version) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <div className="card text-center">
          <h1 className="text-lg font-semibold">Encuesta no disponible</h1>
          <p className="text-slate-600">El código QR no es válido o no hay una versión activa.</p>
        </div>
      </main>
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
    <main className="mx-auto max-w-lg space-y-4 p-4">
      <SurveyRunner
        questions={questions}
        endpoint={`/api/public/${params.token}`}
        title={qr.questionnaire.title}
        subtitle={`${qr.location.name}`}
      />
      <p className="text-center text-xs text-slate-400">
        Tus respuestas son anónimas y se usan para mejorar el servicio.
      </p>
    </main>
  );
}
