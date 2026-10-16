import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createResponseSet, resolveSubmitVersion } from "@/lib/responses";

// Prueba de INTEGRACIÓN (base real): envíos hechos con un formulario de una versión
// anterior. Antes, el servidor validaba contra la versión ACTIVE, ignoraba todas las
// preguntas (sus ids eran de la versión vieja) y guardaba el envío VACÍO, sin segmento
// (caso PMC Winter 2026, oct-2026). Ahora se valida contra la versión del formulario
// y se rechazan envíos con preguntas ajenas o sin respuestas.
describe("createResponseSet — versión del formulario", () => {
  let questionnaireId = "";
  let otherQuestionnaireId = "";
  let v1 = "";
  let v2 = "";
  let draft = "";
  let q1 = ""; // pregunta de v1
  let q2 = ""; // pregunta de v2

  beforeAll(async () => {
    const qn = await prisma.questionnaire.create({ data: { title: "TEST versión (borrar)" } });
    questionnaireId = qn.id;
    const other = await prisma.questionnaire.create({ data: { title: "TEST versión otro (borrar)" } });
    otherQuestionnaireId = other.id;

    v1 = (await prisma.questionnaireVersion.create({
      data: { questionnaireId, versionNumber: 1, status: "ARCHIVED" },
    })).id;
    v2 = (await prisma.questionnaireVersion.create({
      data: { questionnaireId, versionNumber: 2, status: "ACTIVE" },
    })).id;
    draft = (await prisma.questionnaireVersion.create({
      data: { questionnaireId, versionNumber: 3, status: "DRAFT" },
    })).id;

    q1 = (await prisma.question.create({
      data: { versionId: v1, order: 1, type: "NPS", text: "¿Recomendarías?", required: true },
    })).id;
    q2 = (await prisma.question.create({
      data: { versionId: v2, order: 1, type: "NPS", text: "¿Recomendarías?", required: false },
    })).id;
  });

  afterAll(async () => {
    for (const versionId of [v1, v2, draft].filter(Boolean)) {
      await prisma.responseSet.deleteMany({ where: { versionId } });
    }
    for (const id of [questionnaireId, otherQuestionnaireId].filter(Boolean)) {
      await prisma.questionnaire.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("resolveSubmitVersion usa la versión enviada (aunque esté archivada)", async () => {
    expect((await resolveSubmitVersion(questionnaireId, v1))?.id).toBe(v1);
    expect((await resolveSubmitVersion(questionnaireId))?.id).toBe(v2); // sin versionId: ACTIVE
  });

  it("resolveSubmitVersion rechaza borradores y versiones de otro cuestionario", async () => {
    expect(await resolveSubmitVersion(questionnaireId, draft)).toBeNull();
    expect(await resolveSubmitVersion(otherQuestionnaireId, v1)).toBeNull();
  });

  it("un formulario de v1 enviado contra v1 se guarda con sus respuestas", async () => {
    const r = await createResponseSet({
      versionId: v1,
      source: "FIELD",
      raw: [{ questionId: q1, valueNumber: 9 }],
      presentedQuestionIds: [q1],
    });
    expect(r.ok).toBe(true);
    const n = await prisma.answer.count({ where: { responseSetId: (r as { id: string }).id } });
    expect(n).toBe(1);
  });

  it("preguntas de otra versión → 409 STALE_FORM (no se guarda vacío)", async () => {
    const before = await prisma.responseSet.count({ where: { versionId: v2 } });
    const r = await createResponseSet({
      versionId: v2,
      source: "FIELD",
      raw: [{ questionId: q1, valueNumber: 9 }],
      presentedQuestionIds: [q1],
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(await prisma.responseSet.count({ where: { versionId: v2 } })).toBe(before);
  });

  it("envío sin ninguna respuesta (pregunta opcional en blanco) → 422", async () => {
    const r = await createResponseSet({
      versionId: v2,
      source: "FIELD",
      raw: [{ questionId: q2 }],
      presentedQuestionIds: [q2],
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
  });
});
