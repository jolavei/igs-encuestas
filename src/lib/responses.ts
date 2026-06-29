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
  assignmentId?: string | null;
  raw: RawAnswer[];
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
  }));

  const { ok, errors, answers } = validateAnswers(qLike, args.raw);
  if (!ok) return { ok: false as const, status: 422, errors };

  const set = await prisma.responseSet.create({
    data: {
      versionId: args.versionId,
      source: args.source,
      locationId: args.locationId ?? null,
      surveyorId: args.surveyorId ?? null,
      assignmentId: args.assignmentId ?? null,
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
}
