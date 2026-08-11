import { describe, it, expect } from "vitest";
import { normalizeRows } from "@/lib/asq/parseWorkbook";

describe("normalizeRows — formato Excel definitivo", () => {
  const res = normalizeRows({
    sourceFile: "Summer_2025.xlsx",
    ownAirports: new Set(["ARI", "IQQ"]),
    headers: ["Airport", "Overall_Sat", "Dep_Date", "Dep_Time", "Quarter", "QuestNo", "Weight", "Language"],
    rows: [
      ["ARI", 4, 45760, 0.5708333333333333, "SU25", "25S2732031", 0.717213, 50],
      ["COO", null, 45761, null, "SU25", "25S9990001", 1.2, 3],
    ],
  });

  it("produce un registro por fila con valores coercionados", () => {
    expect(res.records).toHaveLength(2);
    const ari = res.records[0];
    expect(ari.Airport).toBe("ARI");
    expect(ari.Overall_Sat).toBe(4);
    expect(ari.Dep_Date).toBe("2025-04-13");
    expect(ari.Dep_Time).toBe("13:42:00");
    expect(ari.Weight).toBeCloseTo(0.717213, 6);
  });

  it("deriva metadatos: temporada, propio y row_key", () => {
    const ari = res.records[0];
    expect(ari._season_label).toBe("Summer 2025");
    expect(ari._is_own_airport).toBe(true);
    expect(ari._row_key).toBe("SU25|25S2732031");
    expect(ari._source_file).toBe("Summer_2025.xlsx");
    expect(res.records[1]._is_own_airport).toBe(false);
  });

  it("Language presente => no aparece como faltante", () => {
    expect(res.report.missingColumns).not.toContain("Language");
    expect(res.report.mappedColumns).toContain("Language");
  });

  it("cuenta aeropuertos, temporadas y filas propias", () => {
    expect(res.report.airports).toEqual({ ARI: 1, COO: 1 });
    expect(res.report.quarters).toEqual({ SU25: 2 });
    expect(res.report.seasons).toEqual({ "Summer 2025": 2 });
    expect(res.report.ownAirportRows).toBe(1);
    expect(res.report.rowCount).toBe(2);
  });
});

describe("normalizeRows — formato Google Sheet histórico (con drift)", () => {
  const res = normalizeRows({
    sourceFile: "ACI ASQ Survey Results",
    headers: ["Airport", "Overall_Sat", "Quarter", "QuestNo", "Foo", "Column", "class"],
    rows: [["AGA", 3, "SU19", "742-197020008", "hola", "AA", "M"]],
  });

  it("descarta las columnas vestigiales Column/class", () => {
    expect(res.report.ignoredColumns).toEqual(expect.arrayContaining(["Column", "class"]));
    expect(res.records[0]).not.toHaveProperty("Column");
    expect(res.records[0]._extra).toEqual({ Foo: "hola" });
  });

  it("marca Language como faltante (no viene en el Sheet)", () => {
    expect(res.report.missingColumns).toContain("Language");
  });

  it("normaliza la temporada histórica", () => {
    expect(res.records[0]._season_label).toBe("Summer 2019");
    expect(res.report.warnings.some((w) => /Faltan .* columnas/.test(w))).toBe(true);
  });
});

describe("normalizeRows — filas basura", () => {
  it("salta filas vacías o sin aeropuerto/identificador", () => {
    const res = normalizeRows({
      sourceFile: "x.xlsx",
      headers: ["Airport", "Overall_Sat", "Quarter", "QuestNo", "Reference_ID"],
      rows: [
        [null, null, null, null, null], // totalmente vacía
        [null, 5, null, null, null], // sin aeropuerto ni id -> se descarta
        ["ARI", 4, "SU25", "25S1", null], // válida
      ],
    });
    expect(res.records).toHaveLength(1);
    expect(res.records[0].Airport).toBe("ARI");
  });
});
