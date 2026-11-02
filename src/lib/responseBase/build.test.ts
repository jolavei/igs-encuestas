import { describe, expect, it } from "vitest";
import { answerCell, buildQuestionColumns, questionLabels, type BaseAnswer, type BaseQuestion } from "./build";

const q = (over: Partial<BaseQuestion> & { id: string; order: number }): BaseQuestion => ({
  type: "TEXT",
  text: `Pregunta ${over.id}`,
  config: null,
  equivalenceKey: null,
  section: null,
  ...over,
});

const answer = (over: Partial<BaseAnswer>): BaseAnswer => ({
  questionId: "x",
  valueNumber: null,
  valueText: null,
  valueDate: null,
  valueJson: null,
  ...over,
});

describe("buildQuestionColumns", () => {
  it("una columna por pregunta, en el orden del formulario (sección y luego pregunta)", () => {
    const { columns } = buildQuestionColumns([
      {
        versionNumber: 1,
        questions: [
          q({ id: "c", order: 1, section: { order: 2, title: "B" } }),
          q({ id: "a", order: 2, section: { order: 1, title: "A" } }),
          q({ id: "b", order: 3, section: { order: 1, title: "A" } }),
        ],
      },
    ]);
    expect(columns.map((c) => c.label)).toEqual(["Pregunta a", "Pregunta b", "Pregunta c"]);
    expect(columns[2].section).toBe("B");
  });

  it("la misma pregunta de dos versiones comparte columna, con el texto de la más nueva", () => {
    const { columns, columnOf } = buildQuestionColumns([
      { versionNumber: 1, questions: [q({ id: "v1", order: 1, text: "Antes", equivalenceKey: "k" })] },
      { versionNumber: 2, questions: [q({ id: "v2", order: 1, text: "Después", equivalenceKey: "k" })] },
    ]);
    expect(columns).toHaveLength(1);
    expect(columns[0].label).toBe("Después");
    expect(columnOf.get("v1")).toBe(columnOf.get("v2"));
  });

  it("sin equivalenceKey, empareja por sección y texto", () => {
    const { columns } = buildQuestionColumns([
      { versionNumber: 1, questions: [q({ id: "v1", order: 1, text: " Igual " })] },
      { versionNumber: 2, questions: [q({ id: "v2", order: 9, text: "Igual" })] },
    ]);
    expect(columns).toHaveLength(1);
  });

  it("lo que solo existe en una versión antigua se intercala tras su pregunta anterior", () => {
    const { columns } = buildQuestionColumns([
      {
        versionNumber: 1,
        questions: [
          q({ id: "a1", order: 1, text: "A" }),
          q({ id: "old", order: 2, text: "Eliminada" }),
          q({ id: "c1", order: 3, text: "C" }),
        ],
      },
      {
        versionNumber: 2,
        questions: [q({ id: "a2", order: 1, text: "A" }), q({ id: "c2", order: 2, text: "C" })],
      },
    ]);
    expect(columns.map((c) => c.label)).toEqual(["A", "Eliminada", "C"]);
  });

  it("no mezcla preguntas iguales de secciones distintas ni una clave repetida", () => {
    const sameText = buildQuestionColumns([
      {
        versionNumber: 1,
        questions: [
          q({ id: "a", order: 1, text: "Aerolínea", section: { order: 1, title: "Check in" } }),
          q({ id: "b", order: 2, text: "Aerolínea", section: { order: 2, title: "Retiro" } }),
        ],
      },
    ]);
    expect(sameText.columns).toHaveLength(2);

    const sameKey = buildQuestionColumns([
      {
        versionNumber: 1,
        questions: [
          q({ id: "a", order: 1, equivalenceKey: "k" }),
          q({ id: "b", order: 2, equivalenceKey: "k" }),
        ],
      },
    ]);
    expect(sameKey.columns).toHaveLength(2);
    expect(sameKey.columnOf.get("a")).not.toBe(sameKey.columnOf.get("b"));
  });

  it("si cambió el tipo de dato entre versiones, quedan en columnas separadas", () => {
    const { columns } = buildQuestionColumns([
      { versionNumber: 1, questions: [q({ id: "a", order: 1, type: "TEXT", equivalenceKey: "k" })] },
      { versionNumber: 2, questions: [q({ id: "b", order: 1, type: "NPS", equivalenceKey: "k" })] },
    ]);
    expect(columns.map((c) => c.kind).sort()).toEqual(["number", "text"]);
  });

  it("la clave de la columna no cambia al agregar una versión", () => {
    const v1 = { versionNumber: 1, questions: [q({ id: "a", order: 1, equivalenceKey: "k" })] };
    const v2 = { versionNumber: 2, questions: [q({ id: "b", order: 5, equivalenceKey: "k" })] };
    expect(buildQuestionColumns([v1]).columns[0].key).toBe(buildQuestionColumns([v1, v2]).columns[0].key);
  });
});

describe("answerCell", () => {
  const options = JSON.stringify({ options: [{ value: "lat", label: "LATAM" }] });
  const labels = questionLabels({ config: options });
  const none = new Map<string, string>();

  it("traduce opciones a su etiqueta y conserva valores que ya no están en la configuración", () => {
    expect(answerCell({ type: "SINGLE_CHOICE" }, answer({ valueText: "lat" }), labels)).toBe("LATAM");
    expect(answerCell({ type: "DROPDOWN" }, answer({ valueText: "otra" }), labels)).toBe("otra");
    expect(answerCell({ type: "MULTI_CHOICE" }, answer({ valueJson: '["lat","otra"]' }), labels)).toEqual([
      "LATAM",
      "otra",
    ]);
  });

  it("calificación: número o N/A", () => {
    expect(answerCell({ type: "RATING" }, answer({ valueNumber: 4 }), none)).toBe(4);
    expect(answerCell({ type: "RATING" }, answer({ valueText: "N/A" }), none)).toBe("N/A");
    expect(answerCell({ type: "NPS" }, answer({ valueNumber: 0 }), none)).toBe(0);
  });

  it("fechas como epoch y archivos como rutas", () => {
    const d = new Date("2026-10-15T15:00:00.000Z");
    expect(answerCell({ type: "DATETIME" }, answer({ valueDate: d }), none)).toBe(d.getTime());
    expect(answerCell({ type: "FILE_UPLOAD" }, answer({ valueJson: '["answers/a__b.pdf"]' }), none)).toEqual([
      "answers/a__b.pdf",
    ]);
  });

  it("resume la medición de flujo sin traer sus eventos", () => {
    const flow = {
      process: "Check in",
      airline: "LATAM",
      initialQueue: 5,
      startedAt: "2026-10-15T15:00:00.000Z",
      endedAt: "2026-10-15T15:10:00.000Z",
      events: [],
      kpis: { finalQueue: 3, avgWaitMin: 4.25, durationMin: 10 },
    };
    expect(answerCell({ type: "FLOW_MEASUREMENT" }, answer({ valueJson: JSON.stringify(flow) }), none)).toBe(
      "Check in · LATAM · fila 5→3 · espera 4,3 min · medición 10,0 min"
    );
  });

  it("vacío o JSON inválido no produce celda", () => {
    expect(answerCell({ type: "TEXT" }, answer({ valueText: "   " }), none)).toBeNull();
    expect(answerCell({ type: "MULTI_CHOICE" }, answer({ valueJson: "[]" }), none)).toBeNull();
    expect(answerCell({ type: "MULTI_CHOICE" }, answer({ valueJson: "{mal" }), none)).toBeNull();
    expect(answerCell({ type: "FLOW_MEASUREMENT" }, answer({}), none)).toBeNull();
  });
});
