import { prisma } from "@/lib/prisma";
import {
  validateAnswers,
  type RawAnswer,
  type QuestionLike,
  type QuestionConfig,
} from "@/lib/questionTypes";
import { fromJson, toJson, type ResponseSource } from "@/lib/enums";
import type { QuestionType } from "@/lib/questionTypes";

type Args = {
  versionId: string;
  source: ResponseSource;
  locationId?: string | null;
  surveyorId?: string | null;
  workPlanId?: string | null;
  // equivalenceKey de las preguntas que definen los segmentos del plan (nivel 1 y 2).
  segmentKey?: string | null;
  segment2Key?: string | null;
  raw: RawAnswer[];
  // Preguntas mostradas (secciones visitadas). Si viene, solo se exigen esas.
  presentedQuestionIds?: string[] | null;
  // Idempotencia: UUID del cliente. Si ya existe un envío con este id, se devuelve
  // ese mismo (no se crea un duplicado). Ver el modelo ResponseSet.
  clientSubmissionId?: string | null;
};

/**
 * Valida respuestas contra las preguntas de la VERSION indicada y persiste
 * en formato largo. La respuesta queda ligada a la version, nunca al "actual".
 */
export async function createResponseSet(args: Args) {
  const questions = await prisma.question.findMany({
    where: { versionId: args.versionId },
  });
  if (questions.length === 0) {
    return { ok: false as const, status: 400, error: "Versión sin preguntas." };
  }

  const qLike: QuestionLike[] = questions.map((q) => ({
    id: q.id,
    type: q.type as QuestionType,
    required: q.required,
    config: fromJson<QuestionConfig>(q.config),
    order: q.order,
    text: q.text,
  }));

  const activeIds =
    args.presentedQuestionIds && args.presentedQuestionIds.length
      ? new Set(args.presentedQuestionIds)
      : undefined;
  const { ok, errors, answers } = validateAnswers(qLike, args.raw, activeIds);
  if (!ok) return { ok: false as const, status: 422, errors };

  // Segmento: valor de la respuesta a la pregunta marcada por el plan (equivalenceKey).
  const segFrom = (key?: string | null): string | null => {
    if (!key) return null;
    const segQ = questions.find((q) => q.equivalenceKey === key);
    if (!segQ) return null;
    return answers.find((x) => x.questionId === segQ.id)?.valueText ?? null;
  };
  const segmentValue = segFrom(args.segmentKey);
  const segmentValue2 = segFrom(args.segment2Key);

  const clientSubmissionId = args.clientSubmissionId ?? null;

  // Idempotencia: si ya llegó un envío con este id (reintento o reenvío de la cola
  // offline), devolvemos el existente sin crear un duplicado.
  if (clientSubmissionId) {
    const existing = await prisma.responseSet.findUnique({
      where: { clientSubmissionId },
      select: { id: true },
    });
    if (existing) return { ok: true as const, status: 200, id: existing.id, duplicate: true };
  }

  try {
    const set = await prisma.responseSet.create({
      data: {
        versionId: args.versionId,
        source: args.source,
        locationId: args.locationId ?? null,
        surveyorId: args.surveyorId ?? null,
        workPlanId: args.workPlanId ?? null,
        segmentValue,
        segmentValue2,
        clientSubmissionId,
        answers: {
          create: answers.map((a) => ({
            questionId: a.questionId,
            valueNumber: a.valueNumber,
            valueText: a.valueText,
            valueDate: a.valueDate,
            valueJson: toJson(a.valueJson),
          })),
        },
      },
    });
    return { ok: true as const, status: 201, id: set.id };
  } catch (e) {
    // Carrera: dos envíos con el mismo clientSubmissionId a la vez. El unique
    // dispara P2002; recuperamos el que sí quedó y lo devolvemos como duplicado.
    if (
      clientSubmissionId &&
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.responseSet.findUnique({
        where: { clientSubmissionId },
        select: { id: true },
      });
      if (existing) return { ok: true as const, status: 200, id: existing.id, duplicate: true };
    }
    throw e;
  }
}
