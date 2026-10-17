import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { aggregateAga, audienceOf, cleanLabel, isAgaQuestionnaire, type AgaAnswerRow } from "./agaSurvey";
const GEN = "Experiencia general del aeropuerto";
const nps = (num: number): AgaAnswerRow => ({ type: "NPS", text: "¿Recomendaría…?", section: GEN, num, txt: null });
const rating = (text: string, num: number | null, section = GEN): AgaAnswerRow => ({
  type: "RATING",
  text,
  section,
  num,
  txt: num == null ? "N/A" : null,
});
const gate = (section: string, txt: string): AgaAnswerRow => ({ type: "SINGLE_CHOICE", text: "¿Usó…?", section, num: null, txt });

describe("aggregateAga", () => {
  const responses: AgaAnswerRow[][] = [
    [
      nps(10),
      rating("Satisfacción general con el aeropuerto en su visita de hoy", 5),
      rating("Limpieza general del terminal", 4),
      rating("Información de vuelos (pantallas y anuncios por altavoz)", 3),
      gate("Baños", "Sí"),
      rating("Aseo e higiene de los baños", 2, "Baños — evaluación"),
      rating("Disponibilidad de insumos", 4, "Baños — evaluación"),
    ],
    [
      nps(6),
      rating("Satisfacción general con el aeropuerto en su visita de hoy", 3),
      rating("Limpieza general del terminal", null), // N/A
      gate("Baños", "No"),
      // el formulario pidió notas aunque dijo "No": no deben contar
      rating("Aseo e higiene de los baños", 5, "Baños — evaluación"),
    ],
    [nps(8), rating("Satisfacción general con el aeropuerto en su visita de hoy", 4)],
    [], // envío vacío: no cuenta
  ];
  const st = aggregateAga(responses);

  it("cuenta encuestas con respuestas y calcula NPS y su composición", () => {
    expect(st.n).toBe(3);
    expect(st.npsN).toBe(3);
    expect(st.nps).toBe(0); // 1 promotor, 1 detractor, 1 pasivo
    expect([st.promotersPct, st.passivesPct, st.detractorsPct]).toEqual([33, 34, 33]);
  });

  it("satisfacción general: promedio y top-2-box", () => {
    expect(st.sat).toBe(4);
    expect(st.satTop2).toBe(67);
  });

  it("atributos excluyen N/A y usan etiqueta corta", () => {
    expect(st.attributes).toEqual([
      { label: "Limpieza general del terminal", avg: 4, n: 1 },
      { label: "Información de vuelos", avg: 3, n: 1 },
    ]);
  });

  it("servicios: promedio solo de quienes lo usaron + % de uso", () => {
    expect(st.services).toEqual([{ label: "Baños", avg: 3, n: 1, usePct: 50, useN: 2 }]);
  });

  it("sin encuestas devuelve nulos", () => {
    const e = aggregateAga([]);
    expect(e).toMatchObject({ n: 0, nps: null, sat: null, satTop2: null, attributes: [], services: [] });
  });
});

describe("helpers", () => {
  it("público e identificación por título", () => {
    expect(audienceOf("Encuesta AGA - Acompañantes")).toBe("Acompañantes");
    expect(audienceOf("Encuesta AGA - Pasajeros")).toBe("Pasajeros");
    expect(isAgaQuestionnaire("Encuesta AGA - Pasajeros")).toBe(true);
    expect(isAgaQuestionnaire("Mediciones de tiempos PMC")).toBe(false);
  });
  it("cleanLabel quita el paréntesis final", () => {
    expect(cleanLabel("Confort del terminal (asientos, temperatura y ambiente)")).toBe("Confort del terminal");
  });
});
