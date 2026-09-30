import { describe, it, expect } from "vitest";
import { flowKpis, submitSchema, validateAnswers, type QuestionLike } from "@/lib/questionTypes";

// Ayudante: crea una pregunta con valores por defecto y permite sobrescribir campos.
const q = (over: Partial<QuestionLike> = {}): QuestionLike => ({
  id: "q1",
  type: "NPS",
  required: true,
  config: null,
  ...over,
});

describe("validateAnswers", () => {
  it("acepta un NPS válido (0-10)", () => {
    const r = validateAnswers([q()], [{ questionId: "q1", valueNumber: 8 }]);
    expect(r.ok).toBe(true);
  });

  it("rechaza un NPS fuera de rango (11)", () => {
    const r = validateAnswers([q()], [{ questionId: "q1", valueNumber: 11 }]);
    expect(r.ok).toBe(false);
    expect(r.errors.q1).toMatch(/0-10/);
  });

  it("exige las preguntas obligatorias cuando vienen vacías", () => {
    const r = validateAnswers([q({ type: "TEXT" })], []);
    expect(r.ok).toBe(false);
    expect(r.errors.q1).toBeDefined();
  });

  it("NO exige preguntas que no se mostraron (secciones saltadas)", () => {
    // activeIds vacío = ninguna pregunta fue presentada -> no se exige q1.
    const r = validateAnswers([q({ type: "TEXT" })], [], new Set());
    expect(r.ok).toBe(true);
  });

  it("valida que la opción elegida exista en la lista", () => {
    const sc = q({
      type: "SINGLE_CHOICE",
      config: { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    });
    expect(validateAnswers([sc], [{ questionId: "q1", valueText: "z" }]).ok).toBe(false);
    expect(validateAnswers([sc], [{ questionId: "q1", valueText: "a" }]).ok).toBe(true);
  });

  it("respeta el largo máximo de un texto", () => {
    const t = q({ type: "TEXT", required: false, config: { maxLength: 5 } });
    expect(validateAnswers([t], [{ questionId: "q1", valueText: "hola" }]).ok).toBe(true);
    expect(validateAnswers([t], [{ questionId: "q1", valueText: "demasiado largo" }]).ok).toBe(false);
  });
});

describe("medición de flujo (FLOW_MEASUREMENT)", () => {
  const flow = (over: Record<string, unknown> = {}) => ({
    initialQueue: 2,
    startedAt: "2026-09-29T12:00:00.000Z",
    endedAt: "2026-09-29T12:10:00.000Z", // 10 min
    events: [
      { t: 60_000, e: "IN" },
      { t: 120_000, e: "OUT" },
      { t: 300_000, e: "OUT" },
    ],
    ...over,
  });
  const fq = q({ type: "FLOW_MEASUREMENT" });

  it("acepta una medición terminada y calcula KPIs", () => {
    const r = validateAnswers([fq], [{ questionId: "q1", valueJson: flow() }]);
    expect(r.ok).toBe(true);
    const saved = r.answers[0].valueJson as { kpis: ReturnType<typeof flowKpis> };
    expect(saved.kpis.totalIn).toBe(1);
    expect(saved.kpis.totalOut).toBe(2);
    expect(saved.kpis.finalQueue).toBe(1);
    // Fila ponderada por tiempo: 2×1 + 3×1 + 2×3 + 1×5 = 16 pax·min / 10 min
    expect(saved.kpis.avgQueue).toBeCloseTo(1.6);
    // λ = 0,1 pax/min → W = 1,6 / 0,1 = 16 min
    expect(r.answers[0].valueNumber).toBeCloseTo(16);
  });

  it("exige finalizar la medición", () => {
    const r = validateAnswers([fq], [{ questionId: "q1", valueJson: flow({ endedAt: null }) }]);
    expect(r.errors.q1).toMatch(/Finaliza/);
  });

  it("rechaza una fila negativa", () => {
    const events = [
      { t: 1000, e: "OUT" },
      { t: 2000, e: "OUT" },
      { t: 3000, e: "OUT" },
    ];
    const r = validateAnswers([fq], [{ questionId: "q1", valueJson: flow({ events }) }]);
    expect(r.ok).toBe(false);
  });

  it("el schema de envío admite el objeto de medición", () => {
    const p = submitSchema.safeParse({ answers: [{ questionId: "q1", valueJson: flow() }] });
    expect(p.success).toBe(true);
  });
});

describe("medición de flujo con proceso y aerolínea", () => {
  const base = {
    initialQueue: 0,
    startedAt: "2026-09-29T12:00:00.000Z",
    endedAt: "2026-09-29T12:05:00.000Z",
    events: [{ t: 1000, e: "IN" }],
  };
  const fq = q({
    type: "FLOW_MEASUREMENT",
    config: { flowProcesses: ["Check-in", "Seguridad"], flowAirlines: ["LATAM", "SKY"] },
  });

  it("acepta proceso y aerolínea de las listas (o N/A)", () => {
    for (const airline of ["LATAM", "N/A"]) {
      const r = validateAnswers(
        [fq],
        [{ questionId: "q1", valueJson: { ...base, process: "Seguridad", airline } }]
      );
      expect(r.ok).toBe(true);
      expect((r.answers[0].valueJson as { airline: string }).airline).toBe(airline);
    }
  });

  it("exige el proceso cuando hay lista configurada", () => {
    const r = validateAnswers([fq], [{ questionId: "q1", valueJson: { ...base, airline: "SKY" } }]);
    expect(r.errors.q1).toMatch(/proceso/);
  });

  it("rechaza una aerolínea fuera de la lista", () => {
    const r = validateAnswers(
      [fq],
      [{ questionId: "q1", valueJson: { ...base, process: "Check-in", airline: "Otra" } }]
    );
    expect(r.errors.q1).toMatch(/aerolínea/);
  });
});
