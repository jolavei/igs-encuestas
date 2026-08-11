import { describe, it, expect } from "vitest";
import {
  ASQ_COLUMNS,
  ASQ_COLUMN_NAMES,
  coerceInt,
  coerceFloat,
  coerceDate,
  coerceTime,
  coerceString,
  parseQuarter,
  resolveHeader,
} from "@/lib/asq/departuresSchema";

describe("esquema canónico ASQ Departures", () => {
  it("tiene las 114 columnas del formato definitivo", () => {
    expect(ASQ_COLUMNS).toHaveLength(114);
  });

  it("no tiene nombres de columna repetidos", () => {
    const set = new Set(ASQ_COLUMN_NAMES);
    expect(set.size).toBe(ASQ_COLUMN_NAMES.length);
  });

  it("incluye Language y NO incluye las vestigiales Column/class", () => {
    expect(ASQ_COLUMN_NAMES).toContain("Language");
    expect(ASQ_COLUMN_NAMES).not.toContain("Column");
    expect(ASQ_COLUMN_NAMES).not.toContain("class");
  });
});

describe("resolveHeader", () => {
  it("mapea un header canónico (tolerante a espacios/mayúsculas)", () => {
    expect(resolveHeader("  airport ").column?.name).toBe("Airport");
    expect(resolveHeader("Overall_Sat").column?.name).toBe("Overall_Sat");
  });
  it("marca Column/class como ignoradas", () => {
    expect(resolveHeader("Column").ignored).toBe(true);
    expect(resolveHeader("class").ignored).toBe(true);
  });
  it("devuelve undefined para un header desconocido", () => {
    const r = resolveHeader("Foobar");
    expect(r.ignored).toBe(false);
    expect(r.column).toBeUndefined();
  });
});

describe("coerceInt", () => {
  it("acepta números y strings numéricos", () => {
    expect(coerceInt(4)).toBe(4);
    expect(coerceInt("4")).toBe(4);
    expect(coerceInt("4.0")).toBe(4);
  });
  it("trata vacío / None / N/A como null", () => {
    expect(coerceInt(null)).toBeNull();
    expect(coerceInt("")).toBeNull();
    expect(coerceInt("None")).toBeNull();
    expect(coerceInt("N/A")).toBeNull();
  });
});

describe("coerceFloat", () => {
  it("preserva decimales (Weight)", () => {
    expect(coerceFloat(0.717213)).toBeCloseTo(0.717213, 6);
    expect(coerceFloat("0.72")).toBeCloseTo(0.72, 2);
  });
});

describe("coerceDate", () => {
  it("convierte serial Excel a YYYY-MM-DD", () => {
    expect(coerceDate(45760)).toBe("2025-04-13");
  });
  it("acepta ISO con hora y devuelve sólo la fecha", () => {
    expect(coerceDate("2025-04-13 00:00:00")).toBe("2025-04-13");
  });
  it("acepta el formato histórico D-Mon-YY", () => {
    expect(coerceDate("7-Aug-19")).toBe("2019-08-07");
    expect(coerceDate("3-May-19")).toBe("2019-05-03");
  });
  it("vacío => null", () => {
    expect(coerceDate("")).toBeNull();
    expect(coerceDate(null)).toBeNull();
  });
});

describe("coerceTime", () => {
  it("convierte fracción de día Excel a HH:MM:SS", () => {
    expect(coerceTime(0.5708333333333333)).toBe("13:42:00");
    expect(coerceTime(0.08819444444444445)).toBe("02:07:00");
  });
  it("acepta texto 24h y AM/PM (histórico)", () => {
    expect(coerceTime("10:16:38")).toBe("10:16:38");
    expect(coerceTime("7:35:00 PM")).toBe("19:35:00");
    expect(coerceTime("12:00:00 AM")).toBe("00:00:00");
  });
});

describe("coerceString", () => {
  it("preserva ceros a la izquierda y recorta", () => {
    expect(coerceString("0667")).toBe("0667");
    expect(coerceString("  ARI ")).toBe("ARI");
  });
  it("vacío / None => null", () => {
    expect(coerceString("")).toBeNull();
    expect(coerceString("None")).toBeNull();
  });
});

describe("parseQuarter", () => {
  it("interpreta veranos e inviernos", () => {
    expect(parseQuarter("SU25")).toMatchObject({ season: "SUMMER", year: 2025, label: "Summer 2025" });
    expect(parseQuarter("SU19")).toMatchObject({ season: "SUMMER", year: 2019, label: "Summer 2019" });
    expect(parseQuarter("WI25")).toMatchObject({ season: "WINTER", year: 2025, label: "Winter 2025-26" });
    expect(parseQuarter("SU2019")).toMatchObject({ season: "SUMMER", year: 2019 });
  });
  it("devuelve UNKNOWN para códigos no reconocidos", () => {
    expect(parseQuarter("XX99").season).toBe("UNKNOWN");
  });
});
