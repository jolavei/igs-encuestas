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
  // Métricas de la toma (opcionales). userAgent/deviceType los captura el server desde
  // los headers; startedAt/durationMs los reporta el cliente (cronómetro de la encuesta).
  userAgent?: string | null;
  deviceType?: string | null;
  startedAt?: Date | null;
  durationMs?: number | null;
};

/**
 * Versión contra la que se valida un envío. El formulario envía el versionId con el
 * que se renderizó: se usa esa versión (ACTIVE o ARCHIVED) aunque se haya publicado
 * otra mientras la pestaña seguía abierta, así no se pierden las respuestas. Sin
 * versionId (clientes antiguos / cola offline previa) se cae a la ACTIVE actual.
 * Devuelve null si el versionId no es de ese cuestionario o es un borrador.
 */
export async function resolveSubmitVersion(
  questionnaireId: string,
  versionId?: string | null
): Promise<{ id: string } | null> {
  if (versionId) {
    return prisma.questionnaireVersion.findFirst({
      where: { id: versionId, questionnaireId, status: { in: ["ACTIVE", "ARCHIVED"] } },
      select: { id: true },
    });
  }
  return prisma.questionnaireVersion.findFirst({
    where: { questionnaireId, status: "ACTIVE" },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
}

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

  // Formulario desactualizado: si el envío trae preguntas que no son de esta versión
  // (p. ej. pestaña abierta con una versión anterior), validateAnswers las ignoraría
  // y el envío quedaría vacío. Se rechaza para que el cliente recargue.
  const versionQIds = new Set(questions.map((q) => q.id));
  const foreign = [
    ...(args.presentedQuestionIds ?? []),
    ...args.raw.map((r) => r.questionId),
  ].some((id) => !versionQIds.has(id));
  if (foreign) {
    return {
      ok: false as const,
      status: 409,
      code: "STALE_FORM" as const,
      error: "El formulario está desactualizado. Recarga la página y vuelve a responder.",
    };
  }

  const activeIds =
    args.presentedQuestionIds && args.presentedQuestionIds.length
      ? new Set(args.presentedQuestionIds)
      : undefined;
  const { ok, errors, answers } = validateAnswers(qLike, args.raw, activeIds);
  if (!ok) return { ok: false as const, status: 422, errors };
  if (answers.length === 0) {
    return { ok: false as const, status: 422, error: "El envío no contiene respuestas." };
  }

  // Segmento: valor de la respuesta a la pregunta marcada por el plan (equivalenceKey).
  const segFrom = (key?: string | null): string | null => {
    if (!key) return null;
    const segQ = questions.find((q) => q.equivalenceKey === key);
    if (!segQ) return null;
    return answers.find((x) => x.questionId === segQ.id)?.valueText ?? null;
  };
  // Segmento secundario "anidado por sección" (segment2Key === "@nested"): la pregunta
  // de aerolínea vive dentro de la sección de cada proceso (Check in y Retiro tienen su
  // propia pregunta con opciones distintas), así que no es una pregunta fija. Cada envío
  // responde una sola sección, por lo que tomamos la única opción-única/desplegable (con
  // equivalenceKey) efectivamente respondida que no sea la del segmento primario.
  const nestedSegValue = (primaryKey?: string | null): string | null => {
    for (const q of questions) {
      if (q.equivalenceKey === primaryKey) continue;
      if (q.type !== "SINGLE_CHOICE" && q.type !== "DROPDOWN") continue;
      if (!q.equivalenceKey) continue;
      const v = answers.find((x) => x.questionId === q.id)?.valueText;
      if (v != null && v !== "") return v;
    }
    return null;
  };
  const segmentValue = segFrom(args.segmentKey);
  const segmentValue2 =
    args.segment2Key === "@nested" ? nestedSegValue(args.segmentKey) : segFrom(args.segment2Key);

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
        userAgent: args.userAgent ?? null,
        deviceType: args.deviceType ?? null,
        startedAt: args.startedAt ?? null,
        durationMs: args.durationMs ?? null,
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
