import { describe, it, expect } from "vitest";
import { validateAnswers, type QuestionLike } from "@/lib/questionTypes";

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
