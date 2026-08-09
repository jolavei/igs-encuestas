import { describe, it, expect } from "vitest";
import { seasonOf, monthsBetween, metaFor } from "@/lib/dashboardTiempos";

describe("seasonOf (a qué temporada pertenece una fecha)", () => {
  it("mayo es Verano del mismo año", () => {
    expect(seasonOf(new Date(2026, 4, 1)).label).toBe("Verano 2026"); // mes 4 = mayo
  });

  it("noviembre es Invierno que cruza al año siguiente", () => {
    expect(seasonOf(new Date(2026, 10, 1)).label).toBe("Invierno 2026-27"); // mes 10 = noviembre
  });

  it("enero pertenece al Invierno del año ANTERIOR", () => {
    expect(seasonOf(new Date(2026, 0, 15)).label).toBe("Invierno 2025-26"); // mes 0 = enero
  });
});

describe("monthsBetween (lista de meses entre dos fechas)", () => {
  it("devuelve cada mes del rango, inclusive", () => {
    expect(monthsBetween("2026-01-01", "2026-03-31")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("metaFor (umbral en minutos por proceso)", () => {
  it("Check in por quiosco tiene meta de 5 min y por mostrador 20", () => {
    expect(metaFor("Check in", "LATAM Airlines - Quiosco")).toBe(5);
    expect(metaFor("Check in", "SKY Airline")).toBe(20);
  });

  it("procesos sin estándar definido no tienen meta", () => {
    expect(metaFor("Pasaporte emigración", "")).toBeNull();
  });
});
