import { describe, it, expect } from "vitest";
import { buildSegmentQuestions, buildPlanSegmentsFromTargets } from "@/lib/planSegments";

// Ayudas para construir preguntas/secciones sintéticas (config = JSON como texto).
const opt = (value: string, extra: Record<string, unknown> = {}) => ({
  value,
  label: value,
  ...extra,
});
const cfg = (options: unknown[]) => JSON.stringify({ options });

// Estructura fiel al cuestionario "Mediciones de tiempos": una pregunta enrutadora
// "Proceso a medir" que salta a una sección por proceso, y cada sección con su propia
// pregunta "Aerolínea" (opciones distintas). AVSEC no tiene aerolínea.
function tiemposLike() {
  const sections = [
    { id: "s1", order: 1 }, // router
    { id: "s2", order: 2 }, // Check in
    { id: "s3", order: 3 }, // AVSEC
    { id: "s4", order: 4 }, // Retiro de equipajes
  ];
  const questions = [
    {
      id: "q-process",
      type: "SINGLE_CHOICE",
      text: "Proceso a medir",
      equivalenceKey: "process",
      sectionId: "s1",
      config: cfg([
        opt("Check in", { goto: "GOTO:2" }),
        opt("AVSEC", { goto: "GOTO:3" }),
        opt("Retiro de equipajes", { goto: "GOTO:4" }),
      ]),
    },
    {
      id: "q-checkin-airline",
      type: "DROPDOWN",
      text: "Aerolínea",
      equivalenceKey: "checkin_airline",
      sectionId: "s2",
      config: cfg([
        opt("LATAM Airlines - Counter"),
        opt("LATAM Airlines - Quiosco"),
        opt("SKY Airline"),
      ]),
    },
    {
      id: "q-checkin-t1",
      type: "DATETIME",
      text: "Hora de inicio",
      equivalenceKey: "checkin_t1",
      sectionId: "s2",
      config: null,
    },
    {
      id: "q-baggage-airline",
      type: "DROPDOWN",
      text: "Aerolínea",
      equivalenceKey: "baggage_claim_airline",
      sectionId: "s4",
      config: cfg([opt("LATAM Airlines"), opt("SKY Airline")]),
    },
  ];
  return { sections, questions };
}

describe("buildSegmentQuestions — anidado por sección (Mediciones de tiempos)", () => {
  it("expone solo el primario enrutador y esconde las aerolíneas anidadas", () => {
    const { sections, questions } = tiemposLike();
    const segs = buildSegmentQuestions(questions, sections);
    expect(segs.map((s) => s.equivalenceKey)).toEqual(["process"]);
  });

  it("resuelve las aerolíneas por proceso según la sección a la que salta cada opción", () => {
    const { sections, questions } = tiemposLike();
    const [process] = buildSegmentQuestions(questions, sections);
    expect(process.nested).toBeTruthy();
    expect(process.nested!.label).toBe("Aerolínea");
    expect(process.nested!.byOption["Check in"].map((o) => o.value)).toEqual([
      "LATAM Airlines - Counter",
      "LATAM Airlines - Quiosco",
      "SKY Airline",
    ]);
    expect(process.nested!.byOption["Retiro de equipajes"].map((o) => o.value)).toEqual([
      "LATAM Airlines",
      "SKY Airline",
    ]);
    // AVSEC no tiene pregunta de aerolínea en su sección.
    expect(process.nested!.byOption["AVSEC"]).toBeUndefined();
  });

  it("cuestionario clásico (sin ruteo): las opciones-únicas con clave quedan como segmentos planos", () => {
    const sections = [{ id: "s1", order: 1 }];
    const questions = [
      {
        id: "q-airline",
        type: "SINGLE_CHOICE",
        text: "Aerolínea",
        equivalenceKey: "airline",
        sectionId: "s1",
        config: cfg([opt("LATAM"), opt("SKY")]),
      },
      {
        id: "q-dest",
        type: "SINGLE_CHOICE",
        text: "Destino",
        equivalenceKey: "dest",
        sectionId: "s1",
        config: cfg([opt("SCL"), opt("ANF")]),
      },
    ];
    const segs = buildSegmentQuestions(questions, sections);
    expect(segs.map((s) => s.equivalenceKey)).toEqual(["airline", "dest"]);
    expect(segs.every((s) => !s.nested)).toBe(true);
  });
});

describe("buildPlanSegmentsFromTargets", () => {
  // Opciones de aerolínea por proceso (anidadas por sección).
  const airlineByProcess: Record<string, { value: string; label: string }[]> = {
    "Check in": [
      { value: "LATAM Airlines - Counter", label: "LATAM Airlines - Counter" },
      { value: "LATAM Airlines - Quiosco", label: "LATAM Airlines - Quiosco" },
    ],
    AVSEC: [],
    "Retiro de equipajes": [{ value: "LATAM Airlines", label: "LATAM Airlines" }],
  };
  const primaryOptions = [
    { value: "Check in", label: "Check in" },
    { value: "AVSEC", label: "AVSEC" },
    { value: "Retiro de equipajes", label: "Retiro de equipajes" },
  ];
  const subOptionsFor = (po: string) => airlineByProcess[po] ?? [];

  it("guarda cada nivel con su meta y respeta las aerolíneas propias del proceso", () => {
    const segs = buildPlanSegmentsFromTargets(
      primaryOptions,
      subOptionsFor,
      { "Check in": 5, AVSEC: 2, "Retiro de equipajes": 3 },
      {
        "Check in|LATAM Airlines - Counter": 2,
        "Check in|LATAM Airlines - Quiosco": 1,
        "Retiro de equipajes|LATAM Airlines": 3,
        // Meta "heredada" del formulario viejo: aerolínea de Check in bajo Retiro.
        // No está en las opciones de Retiro, así que debe descartarse.
        "Retiro de equipajes|LATAM Airlines - Counter": 1,
      }
    );
    expect(segs).toEqual([
      { parentValue: null, value: "Check in", label: "Check in", target: 5 },
      { parentValue: "Check in", value: "LATAM Airlines - Counter", label: "LATAM Airlines - Counter", target: 2 },
      { parentValue: "Check in", value: "LATAM Airlines - Quiosco", label: "LATAM Airlines - Quiosco", target: 1 },
      { parentValue: null, value: "AVSEC", label: "AVSEC", target: 2 },
      { parentValue: null, value: "Retiro de equipajes", label: "Retiro de equipajes", target: 3 },
      { parentValue: "Retiro de equipajes", value: "LATAM Airlines", label: "LATAM Airlines", target: 3 },
    ]);
  });

  it("si el proceso no tiene meta propia, usa la suma de sus sub-metas", () => {
    const segs = buildPlanSegmentsFromTargets(
      primaryOptions,
      subOptionsFor,
      {}, // sin metas de nivel 1
      { "Check in|LATAM Airlines - Counter": 2, "Check in|LATAM Airlines - Quiosco": 1 }
    );
    const checkin = segs.find((s) => s.parentValue === null && s.value === "Check in");
    expect(checkin?.target).toBe(3);
  });

  it("no guarda sub-metas en 0 (por eso no aparecen en meta/realizadas)", () => {
    const segs = buildPlanSegmentsFromTargets(
      primaryOptions,
      subOptionsFor,
      { "Retiro de equipajes": 3 },
      { "Retiro de equipajes|LATAM Airlines": 0 }
    );
    expect(segs).toEqual([
      { parentValue: null, value: "Retiro de equipajes", label: "Retiro de equipajes", target: 3 },
    ]);
  });
});
