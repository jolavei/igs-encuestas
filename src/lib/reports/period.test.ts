import { describe, it, expect } from "vitest";
import {
  defaultPeriodKey,
  periodOptions,
  resolvePeriod,
  seasonFromCode,
  seasonOfMonth,
  seasonsBefore,
  seasonsOfAsqYear,
} from "./period";

describe("temporadas ASQ", () => {
  it("códigos como en la base de ACI", () => {
    expect(seasonFromCode("SU26")).toMatchObject({ label: "Summer 2026", from: "2026-04-01", to: "2026-09-30" });
    expect(seasonFromCode("WI25")).toMatchObject({ label: "Winter 2025-26", from: "2025-10-01", to: "2026-03-31" });
    expect(seasonFromCode("XX26")).toBeNull();
  });
  it("mes → temporada", () => {
    expect(seasonOfMonth("2026-10").code).toBe("WI26");
    expect(seasonOfMonth("2027-03").code).toBe("WI26");
    expect(seasonOfMonth("2026-04").code).toBe("SU26");
  });
  it("año ASQ = Summer + el Winter que le sigue", () => {
    expect(seasonsOfAsqYear(2025).map((s) => s.code)).toEqual(["SU25", "WI25"]);
  });
  it("histórico desde Summer 2019", () => {
    const h = seasonsBefore(seasonFromCode("SU20")!);
    expect(h.map((s) => s.code)).toEqual(["SU19", "WI19"]);
  });
});

describe("resolvePeriod", () => {
  it("mensual: temporada hasta el cierre del mes", () => {
    const c = resolvePeriod("MENSUAL", "2026-10")!;
    expect(c.window).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(c.season.code).toBe("WI26");
    expect(c.label).toBe("Octubre de 2026"); // mismo formato que el informe anterior
    const feb = resolvePeriod("MENSUAL", "2027-02")!;
    expect(feb.window).toEqual({ from: "2026-10-01", to: "2027-02-28" });
  });
  it("semestral: compara con la anterior y la misma del año previo", () => {
    const c = resolvePeriod("SEMESTRAL", "SU25")!;
    expect(c.compare.map((s) => s.code)).toEqual(["WI24", "SU24"]);
    expect(c.history[0].code).toBe("SU19");
    expect(c.history.at(-1)!.code).toBe("WI24");
  });
  it("anual: temporada de detalle elegible, Winter por defecto", () => {
    expect(resolvePeriod("ANUAL", "2025")!.season.code).toBe("WI25");
    const su = resolvePeriod("ANUAL", "2025", "SU25")!;
    expect(su.season.code).toBe("SU25");
    expect(su.window).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(resolvePeriod("ANUAL", "2025", "SU26")).toBeNull();
  });
  it("claves inválidas", () => {
    expect(resolvePeriod("MENSUAL", "2026-13")).toBeNull();
    expect(resolvePeriod("SEMESTRAL", "2026")).toBeNull();
  });
});

describe("periodo por defecto y opciones", () => {
  it("en octubre de 2026", () => {
    expect(defaultPeriodKey("MENSUAL", "2026-10")).toBe("2026-10");
    expect(defaultPeriodKey("SEMESTRAL", "2026-10")).toBe("SU26");
    expect(defaultPeriodKey("ANUAL", "2026-10")).toBe("2025"); // SU26 cerró, pero WI26 sigue en curso
  });
  it("en mayo de 2027 el año 2026 ya cerró", () => {
    expect(defaultPeriodKey("ANUAL", "2027-05")).toBe("2026");
  });
  it("opciones", () => {
    expect(periodOptions("SEMESTRAL", "2026-10", 3).map((o) => o.value)).toEqual(["WI26", "SU26", "WI25"]);
    expect(periodOptions("ANUAL", "2026-10", 4).map((o) => o.value)).toEqual(["2026", "2025"]);
    expect(periodOptions("MENSUAL", "2026-01", 2).map((o) => o.value)).toEqual(["2026-01", "2025-12"]);
  });
});
