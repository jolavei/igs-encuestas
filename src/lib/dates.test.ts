import { describe, it, expect } from "vitest";
import { chileDayToUtc, utcToChileDay } from "@/lib/dates";

describe("chileDayToUtc / utcToChileDay (fechas en hora de Chile)", () => {
  it("ida y vuelta devuelve el mismo día", () => {
    const d = chileDayToUtc("2026-07-23");
    expect(d).not.toBeNull();
    expect(utcToChileDay(d!)).toBe("2026-07-23");
  });

  it("el borde 'end' sigue cayendo el mismo día chileno", () => {
    const d = chileDayToUtc("2026-07-23", "end");
    expect(utcToChileDay(d!)).toBe("2026-07-23");
  });

  it("rechaza texto que no es una fecha válida", () => {
    expect(chileDayToUtc("no-es-fecha")).toBeNull();
    expect(chileDayToUtc("2026-13-40")).toBeNull(); // mes y día imposibles
  });
});
