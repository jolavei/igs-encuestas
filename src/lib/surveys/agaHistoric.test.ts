import { describe, it, expect } from "vitest";
import {
  chileDay,
  convertRow,
  gateOf,
  mapColumns,
  parseFormTimestamp,
  ratingOf,
  sectionsOf,
  type RowIssue,
} from "./agaHistoric";
import { aggregateAga, type AgaAnswerRow } from "@/lib/reports/agaSurvey";

// Encabezados reales (abreviados donde no importa) del formulario antiguo de acompañantes.
const ACOMP = [
  "Marca temporal",
  "¿Qué nivel de satisfacción tiene usted con los siguientes aspectos del edificio terminal? [Limpieza y aseo general instalaciones]",
  "¿Qué nivel de satisfacción tiene usted con los siguientes aspectos del edificio terminal? [Climatización]",
  "¿Ha utilizado alguno de los servicios higiénicos del recinto? ",
  "Evaluación servicios higiénicos del recinto [Aseo e Higiene]",
  "¿Ha utilizado usted alguno de los locales comerciales del aeropuerto?\t\t\t\t\t\t\t",
  "El local se encontraba:",
  "Evaluación locales comerciales [Relación precio-calidad]",
  "¿Cuál es su sexo?",
  "",
];

describe("escala y Sí/No", () => {
  it("convierte la escala antigua", () => {
    expect(ratingOf("Muy Bueno")).toEqual({ num: 5 });
    expect(ratingOf("muy malo")).toEqual({ num: 1 });
    expect(ratingOf("No Opina")).toEqual({ na: true });
    expect(ratingOf("- No opina -")).toEqual({ na: true });
    expect(ratingOf("")).toBeNull();
    expect(ratingOf("Excelente")).toBeUndefined();
  });
  it("Sí/No", () => {
    expect(gateOf("Sí")).toBe("Sí");
    expect(gateOf(" no ")).toBe("No");
    expect(gateOf("-")).toBeNull();
  });
});

describe("fechas del formulario (hora de Chile)", () => {
  it("número de serie de Sheets", () => {
    // 45000 = 2023-03-15 00:00 → 12:00 son 0.5 días; Chile en marzo-2023 = UTC-3.
    const d = parseFormTimestamp(45000.5)!;
    expect(d.toISOString()).toBe("2023-03-15T15:00:00.000Z");
  });
  it("texto D/M y M/D (la hoja mezcla ambos)", () => {
    expect(chileDay(parseFormTimestamp("25/02/2021 09:15:49")!)).toBe("2021-02-25");
    expect(chileDay(parseFormTimestamp("9/16/2026 11:58:57")!)).toBe("2026-09-16");
    expect(chileDay(parseFormTimestamp("3/4/2024 10:00:00")!)).toBe("2024-04-03"); // ambiguo → D/M
    expect(parseFormTimestamp("ayer")).toBeNull();
  });
});

describe("mapeo de columnas", () => {
  it("todas las columnas del ejemplo tienen regla", () => {
    const specs = mapColumns("Acompañantes", ACOMP);
    expect(specs.every((s) => s !== null)).toBe(true);
    expect(specs[1]).toMatchObject({ kind: "rating", text: "Limpieza y aseo general de las instalaciones" });
    expect(specs[3]).toMatchObject({ kind: "gate", section: "Servicios higiénicos" });
    expect(specs[4]).toMatchObject({ kind: "rating", section: "Servicios higiénicos — evaluación" });
    expect(specs[6]).toEqual({ kind: "skip" });
    expect(sectionsOf(specs)).toEqual([
      "Experiencia general del aeropuerto",
      "Servicios higiénicos",
      "Servicios higiénicos — evaluación",
      "Locales comerciales",
      "Locales comerciales — evaluación",
      "Perfil del acompañante",
    ]);
  });
  it("encabezado desconocido queda sin regla", () => {
    expect(mapColumns("Pasajeros", ["Pregunta nueva"])[0]).toBeNull();
  });
});

describe("filas → respuestas → agregación de los informes", () => {
  const specs = mapColumns("Acompañantes", ACOMP);
  const sectionOf = (col: number) => (specs[col] as { section: string }).section;
  const textOf = (col: number) => (specs[col] as { text: string }).text;
  const typeOf = (col: number) => (specs[col]!.kind === "rating" ? "RATING" : "SINGLE_CHOICE");

  it("descarta notas de un servicio que dijo No y deja No opina como N/A", () => {
    const issues: RowIssue[] = [];
    const r = convertRow(
      specs,
      [45000.5, "Muy Bueno", "No opina", "No", "Bueno", "Sí", "Abierto", "Regular", "Hombre"],
      2,
      issues
    )!;
    expect(issues).toEqual([]);
    const byCol = new Map(r.answers.map((a) => [a.col, a]));
    expect(byCol.get(1)).toMatchObject({ num: 5 });
    expect(byCol.get(2)).toMatchObject({ num: null, text: "N/A" });
    expect(byCol.has(4)).toBe(false); // baños: dijo que no los usó
    expect(byCol.get(7)).toMatchObject({ num: 3 });
    expect(byCol.get(8)).toMatchObject({ text: "Masculino" });

    const rows: AgaAnswerRow[] = r.answers.map((a) => ({
      type: typeOf(a.col),
      text: textOf(a.col),
      section: sectionOf(a.col),
      num: a.num,
      txt: a.text,
    }));
    const agg = aggregateAga([rows]);
    expect(agg.nps).toBeNull(); // el formulario antiguo no tenía NPS
    expect(agg.attributes.find((x) => x.label === "Limpieza y aseo general de las instalaciones")?.avg).toBe(5);
    const locales = agg.services.find((s) => s.label === "Locales comerciales");
    expect(locales).toMatchObject({ avg: 3, usePct: 100 });
    expect(agg.services.find((s) => s.label === "Servicios higiénicos")).toBeUndefined();
  });

  it("valor fuera de escala se reporta", () => {
    const issues: RowIssue[] = [];
    convertRow(specs, [45000.5, "Excelente"], 7, issues);
    expect(issues).toEqual([{ row: 7, col: 1, value: "Excelente", reason: "valor fuera de escala" }]);
  });
});
