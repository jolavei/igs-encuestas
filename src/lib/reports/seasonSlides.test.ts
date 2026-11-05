import { describe, it, expect } from "vitest";
import { airportCity, asqBestWorst, asqMatrix, coverBadge, execSummaryCards, procLabel, tiemposSummaryRows } from "./seasonSlides";

const attr = (label: string, airport: number, chile: number, importance: number) => ({ label, airport, chile, importance });

describe("ACI ASQ", () => {
  it("mejores y peores con diferencia vs Chile", () => {
    const { best, worst } = asqBestWorst(
      [attr("A", 4.5, 4.0, 10), attr("B", 3.0, 3.5, 5), attr("C", 4.0, 4.0, 1), attr("D", 2.5, 3.0, 20)],
      2
    );
    expect(best.map((x) => [x.label, x.diff])).toEqual([
      ["A", 0.5],
      ["C", 0],
    ]);
    expect(worst.map((x) => x.label)).toEqual(["D", "B"]); // peor primero
  });

  it("cuadrantes de la matriz importancia–desempeño y numeración", () => {
    const attrs = [attr("Alta y buena", 4.6, 4, 30), attr("Alta y mala", 3.0, 4, 25), attr("Baja y buena", 4.5, 4, 2), attr("Baja y mala", 3.1, 4, 1)];
    const m = asqMatrix(attrs);
    const q = Object.fromEntries(m.pts.map((p) => [p.label, m.quadrant(p)]));
    expect(q).toEqual({
      "Alta y buena": "Fortaleza clave",
      "Alta y mala": "Mejorar con prioridad",
      "Baja y buena": "Mantener",
      "Baja y mala": "Menor prioridad",
    });
    expect(m.priority.map((p) => m.number.get(p))).toEqual([1]);
    expect(m.strengths.map((p) => m.number.get(p))).toEqual([2]);
  });
});

describe("resumen ejecutivo", () => {
  it("ASQ primero, luego tiempos vs IATA y AGA; sin comparar contra otra temporada", () => {
    const cards = execSummaryCards({
      kind: "SEMESTRAL",
      seasonal: {
        asq: { overall: { airport: 4.03, top2: 72, rankChile: 4, totalChile: 10, rankAll: 10, totalAll: 19 }, n: 370 },
      },
      processes: [
        { proceso: "AVSEC", faseLabel: null, meta: 10, kpi: { n: 254, prom: 12, med: 9, p90: 20 } },
        { proceso: "Check in", faseLabel: null, meta: 20, kpi: { n: 972, prom: 2.3, med: 1.8, p90: 4.3 } },
      ],
      aga: [{ audience: "Pasajeros", month: { n: 309, ratingAvg: 4, ratingTop2: 86, attributes: [], services: [] } }],
      asq: null,
    });
    expect(cards.map((c) => c.label)).toEqual([
      "Satisfacción general ACI ASQ",
      "Tiempos dentro del Estándar IATA",
      "Complementarias Pasajeros · nota promedio",
    ]);
    expect(cards[0]).toMatchObject({ value: "4,03 / 5", sub: "4° de 10 en Chile · 10° de 19 en el programa regional · 370 encuestas" });
    expect(cards[1]).toMatchObject({ value: "1 de 2", sub: "Sobre el estándar (fila): Filtro de Seguridad (+02:00)" });
    expect(tiemposSummaryRows({ processes: [], aga: [], asq: null })).toEqual([]);
  });
});

describe("portada y nombres en las presentaciones", () => {
  it("badge del mensual con el mes; semestral sin mes", () => {
    expect(coverBadge({ kind: "MENSUAL", monthLabel: "Octubre 2026" })).toBe("Informe mensual - Octubre 2026");
    expect(coverBadge({ kind: "SEMESTRAL", monthLabel: "Winter 2026" })).toBe("Informe semestral");
  });
  it("ciudad desde el nombre de la empresa", () => {
    expect(airportCity("Aeropuerto El Loa - Calama")).toBe("Calama");
    expect(airportCity("Aeropuerto El Tepual")).toBe("Aeropuerto El Tepual");
  });
  it("AVSEC se muestra como Filtro de Seguridad", () => {
    expect(procLabel({ proceso: "AVSEC", faseLabel: null })).toBe("Filtro de Seguridad");
    expect(procLabel({ proceso: "Retiro de equipajes", faseLabel: "Última maleta" })).toBe("Retiro de equipajes — Última maleta");
  });
});
