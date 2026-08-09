import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createResponseSet } from "@/lib/responses";

// Prueba de INTEGRACIÓN: usa la base de datos real (crea datos de prueba propios y
// los borra al final). Verifica la idempotencia de createResponseSet: un mismo
// clientSubmissionId no debe crear respuestas duplicadas.
describe("createResponseSet — idempotencia (con base de datos)", () => {
  let questionnaireId = "";
  let versionId = "";
  let questionId = "";

  beforeAll(async () => {
    const questionnaire = await prisma.questionnaire.create({
      data: { title: "TEST idempotencia (borrar)" },
    });
    questionnaireId = questionnaire.id;
    const version = await prisma.questionnaireVersion.create({
      data: { questionnaireId, versionNumber: 1, status: "ACTIVE" },
    });
    versionId = version.id;
    const question = await prisma.question.create({
      data: { versionId, order: 1, type: "NPS", text: "¿Recomendarías?", required: true },
    });
    questionId = question.id;
  });

  afterAll(async () => {
    // Limpieza defensiva: solo borra si de verdad se crearon los datos.
    if (versionId) await prisma.responseSet.deleteMany({ where: { versionId } });
    if (questionnaireId) {
      await prisma.questionnaire.delete({ where: { id: questionnaireId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("dos envíos con el mismo clientSubmissionId cuentan como uno solo", async () => {
    const clientSubmissionId = crypto.randomUUID();
    const base = { versionId, source: "FIELD" as const, raw: [{ questionId, valueNumber: 9 }] };

    const a = await createResponseSet({ ...base, clientSubmissionId });
    const b = await createResponseSet({ ...base, clientSubmissionId }); // reintento / cola offline

    if (!a.ok || !b.ok) throw new Error("createResponseSet no debería fallar");
    expect(b.id).toBe(a.id); // devuelve el mismo, no crea otro

    const count = await prisma.responseSet.count({ where: { clientSubmissionId } });
    expect(count).toBe(1); // una sola fila en la base
  });

  it("envíos SIN clientSubmissionId sí son respuestas distintas", async () => {
    const base = { versionId, source: "FIELD" as const, raw: [{ questionId, valueNumber: 7 }] };

    const a = await createResponseSet(base);
    const b = await createResponseSet(base);

    if (!a.ok || !b.ok) throw new Error("createResponseSet no debería fallar");
    expect(b.id).not.toBe(a.id); // sin id de idempotencia, cuentan por separado
  });
});
