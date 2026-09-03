import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createResponseSet } from "@/lib/responses";

// Prueba de INTEGRACIÓN (base real): el segmento secundario "anidado por sección"
// (segment2Key === "@nested"). La aerolínea vive en la sección de cada proceso, así que
// createResponseSet debe capturar como segmentValue2 la aerolínea efectivamente
// respondida — checkin_airline para Check in, baggage_claim_airline para Retiro — y
// null cuando el proceso no tiene aerolínea (AVSEC).
describe("createResponseSet — segmento secundario anidado (@nested)", () => {
  let questionnaireId = "";
  let versionId = "";
  const qid: Record<string, string> = {};

  const opts = (...values: string[]) =>
    JSON.stringify({ options: values.map((v) => ({ value: v, label: v })) });

  beforeAll(async () => {
    const questionnaire = await prisma.questionnaire.create({
      data: { title: "TEST @nested (borrar)" },
    });
    questionnaireId = questionnaire.id;
    const version = await prisma.questionnaireVersion.create({
      data: { questionnaireId, versionNumber: 1, status: "ACTIVE" },
    });
    versionId = version.id;

    const mk = async (
      key: string,
      order: number,
      type: string,
      text: string,
      config: string | null
    ) => {
      const q = await prisma.question.create({
        data: { versionId, order, type, text, equivalenceKey: key, config },
      });
      qid[key] = q.id;
    };
    await mk("process", 1, "SINGLE_CHOICE", "Proceso a medir", opts("Check in", "AVSEC", "Retiro de equipajes"));
    await mk("checkin_airline", 2, "DROPDOWN", "Aerolínea", opts("LATAM Airlines - Counter", "SKY Airline"));
    await mk("baggage_claim_airline", 3, "DROPDOWN", "Aerolínea", opts("LATAM Airlines", "SKY Airline"));
  });

  afterAll(async () => {
    if (versionId) await prisma.responseSet.deleteMany({ where: { versionId } });
    if (questionnaireId) {
      await prisma.questionnaire.delete({ where: { id: questionnaireId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  const submit = (raw: { questionId: string; valueText: string }[]) =>
    createResponseSet({
      versionId,
      source: "FIELD",
      segmentKey: "process",
      segment2Key: "@nested",
      raw,
    });

  it("Check in → captura la aerolínea de checkin_airline", async () => {
    const r = await submit([
      { questionId: qid.process, valueText: "Check in" },
      { questionId: qid.checkin_airline, valueText: "LATAM Airlines - Counter" },
    ]);
    expect(r.ok).toBe(true);
    const rs = await prisma.responseSet.findUnique({ where: { id: (r as { id: string }).id } });
    expect(rs?.segmentValue).toBe("Check in");
    expect(rs?.segmentValue2).toBe("LATAM Airlines - Counter");
  });

  it("Retiro de equipajes → captura la aerolínea de baggage_claim_airline", async () => {
    const r = await submit([
      { questionId: qid.process, valueText: "Retiro de equipajes" },
      { questionId: qid.baggage_claim_airline, valueText: "LATAM Airlines" },
    ]);
    expect(r.ok).toBe(true);
    const rs = await prisma.responseSet.findUnique({ where: { id: (r as { id: string }).id } });
    expect(rs?.segmentValue).toBe("Retiro de equipajes");
    expect(rs?.segmentValue2).toBe("LATAM Airlines");
  });

  it("AVSEC (sin aerolínea) → segmentValue2 nulo", async () => {
    const r = await submit([{ questionId: qid.process, valueText: "AVSEC" }]);
    expect(r.ok).toBe(true);
    const rs = await prisma.responseSet.findUnique({ where: { id: (r as { id: string }).id } });
    expect(rs?.segmentValue).toBe("AVSEC");
    expect(rs?.segmentValue2).toBeNull();
  });
});
