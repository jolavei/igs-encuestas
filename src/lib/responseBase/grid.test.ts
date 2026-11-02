import { describe, expect, it } from "vitest";
import {
  BLANK,
  activeFilterCount,
  applyFilters,
  cellText,
  columnValues,
  conditionIsComplete,
  sortRows,
  type GridColumn,
  type GridRow,
} from "./grid";

const col = (key: string, kind: GridColumn["kind"]): GridColumn => ({ key, label: key, section: null, kind });
const text = col("t", "text");
const num = col("n", "number");
const multi = col("m", "multi");
const date = col("d", "date");
const columns = [text, num, multi, date];

const AT = Date.UTC(2026, 9, 15, 15, 0, 0); // 15-10-2026 12:00 en Chile (UTC-3)

const rows: GridRow[] = [
  { id: "1", cells: { t: "LATAM", n: 5, m: ["Café", "Baños"], d: AT } },
  { id: "2", cells: { t: "Sky", n: 1, m: ["Baños"] } },
  { id: "3", cells: { n: "N/A" } },
  { id: "4", cells: { t: "Área común", n: 10, m: ["Wifi"] } },
];

const ids = (r: GridRow[]) => r.map((x) => x.id);

describe("filtro por valores", () => {
  it("oculta las filas con valores desmarcados", () => {
    expect(ids(applyFilters(rows, columns, { t: { excluded: ["Sky"] } }))).toEqual(["1", "3", "4"]);
  });

  it("trata las celdas sin respuesta como el valor (Vacías)", () => {
    expect(ids(applyFilters(rows, columns, { t: { excluded: [BLANK] } }))).toEqual(["1", "2", "4"]);
  });

  it("en casillas, la fila pasa si queda alguna de sus opciones marcada", () => {
    expect(ids(applyFilters(rows, columns, { m: { excluded: ["Baños"] } }))).toEqual(["1", "3", "4"]);
    expect(ids(applyFilters(rows, columns, { m: { excluded: ["Baños", "Café"] } }))).toEqual(["3", "4"]);
  });

  it("combina los filtros de varias columnas con Y", () => {
    const filters = { t: { excluded: ["Sky"] }, n: { condition: { op: "gt" as const, a: "6" } } };
    expect(ids(applyFilters(rows, columns, filters))).toEqual(["4"]);
    expect(activeFilterCount(filters)).toBe(2);
  });

  it("exceptKey ignora el filtro de esa columna (para armar su lista de valores)", () => {
    const filters = { t: { excluded: ["Sky"] }, n: { condition: { op: "gt" as const, a: "0" } } };
    expect(ids(applyFilters(rows, columns, filters, "t"))).toEqual(["1", "2", "4"]);
  });
});

describe("filtro por condición", () => {
  const by = (key: string, condition: Parameters<typeof conditionIsComplete>[0]) =>
    ids(applyFilters(rows, columns, { [key]: { condition } }));

  it("texto: no distingue mayúsculas ni tildes", () => {
    expect(by("t", { op: "contains", a: "area" })).toEqual(["4"]);
    expect(by("t", { op: "startsWith", a: "la" })).toEqual(["1"]);
    expect(by("t", { op: "endsWith", a: "Y" })).toEqual(["2"]);
    expect(by("t", { op: "equals", a: "sky" })).toEqual(["2"]);
  });

  it("'no contiene' incluye las vacías, como en Sheets", () => {
    expect(by("t", { op: "notContains", a: "la" })).toEqual(["2", "3", "4"]);
  });

  it("vacía / no vacía", () => {
    expect(by("t", { op: "empty" })).toEqual(["3"]);
    expect(by("t", { op: "notEmpty" })).toEqual(["1", "2", "4"]);
  });

  it("números: 'N/A' y vacías nunca cumplen una comparación", () => {
    expect(by("n", { op: "gte", a: "5" })).toEqual(["1", "4"]);
    expect(by("n", { op: "neq", a: "1" })).toEqual(["1", "4"]);
    expect(by("n", { op: "between", a: "6", b: "1" })).toEqual(["1", "2"]);
    expect(by("n", { op: "notBetween", a: "1", b: "5" })).toEqual(["4"]);
  });

  it("acepta coma decimal", () => {
    expect(by("n", { op: "lt", a: "1,5" })).toEqual(["2"]);
  });

  it("fechas: se comparan por día de Chile", () => {
    expect(by("d", { op: "dateOn", a: "2026-10-15" })).toEqual(["1"]);
    expect(by("d", { op: "dateOn", a: "2026-10-16" })).toEqual([]);
    expect(by("d", { op: "dateBefore", a: "2026-10-16" })).toEqual(["1"]);
    expect(by("d", { op: "dateAfter", a: "2026-10-14" })).toEqual(["1"]);
    expect(by("d", { op: "dateBetween", a: "2026-10-01", b: "2026-10-15" })).toEqual(["1"]);
  });

  it("una condición incompleta o inválida no filtra", () => {
    expect(conditionIsComplete({ op: "gt", a: "abc" })).toBe(false);
    expect(conditionIsComplete({ op: "between", a: "1" })).toBe(false);
    expect(conditionIsComplete({ op: "dateOn", a: "" })).toBe(false);
    expect(conditionIsComplete({ op: "contains", a: "  " })).toBe(false);
    expect(ids(applyFilters(rows, columns, { n: { condition: { op: "gt", a: "abc" } } }))).toHaveLength(4);
    expect(activeFilterCount({ n: { condition: { op: "gt", a: "abc" } } })).toBe(0);
  });
});

describe("lista de valores", () => {
  it("cuenta cada opción de casillas por separado y deja (Vacías) al final", () => {
    expect(columnValues(rows, multi)).toEqual([
      { value: "Baños", count: 2 },
      { value: "Café", count: 1 },
      { value: "Wifi", count: 1 },
      { value: BLANK, count: 1 },
    ]);
  });

  it("ordena numéricamente, con el texto después de los números", () => {
    expect(columnValues(rows, num).map((v) => v.value)).toEqual(["1", "5", "10", "N/A"]);
  });
});

describe("orden", () => {
  it("las vacías quedan al final en ambos sentidos", () => {
    expect(ids(sortRows(rows, text, "asc"))).toEqual(["4", "1", "2", "3"]);
    expect(ids(sortRows(rows, text, "desc"))).toEqual(["2", "1", "4", "3"]);
  });

  it("no ordena los números como texto", () => {
    expect(ids(sortRows(rows, num, "asc"))).toEqual(["2", "1", "4", "3"]);
  });
});

describe("presentación", () => {
  it("muestra fechas en hora de Chile y números con formato local", () => {
    expect(cellText(date, AT)).toBe("15-10-2026 12:00:00");
    expect(cellText(num, 4.25)).toBe("4,25");
    expect(cellText(multi, ["Café", "Baños"])).toBe("Café, Baños");
    expect(cellText(text, undefined)).toBe("");
  });

  it("muestra el nombre del archivo, no su ruta en GCS", () => {
    expect(cellText(col("f", "file"), ["answers/abc/123__foto.jpg"])).toBe("foto.jpg");
  });
});
