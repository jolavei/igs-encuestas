import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/bigquery", () => ({ BigQueryCredentialsError: class extends Error {} }));
vi.mock("@/lib/reports/tiemposQuery", () => ({}));

import { asqSeasonOf } from "./monthlyReport";

describe("asqSeasonOf", () => {
  it("abril–septiembre = Summer del mismo año", () => {
    expect(asqSeasonOf(2026, 4)).toEqual({ season: "SUMMER", year: 2026 });
    expect(asqSeasonOf(2026, 9)).toEqual({ season: "SUMMER", year: 2026 });
  });
  it("octubre–diciembre = Winter del mismo año (inicio de temporada)", () => {
    expect(asqSeasonOf(2026, 10)).toEqual({ season: "WINTER", year: 2026 });
    expect(asqSeasonOf(2026, 12)).toEqual({ season: "WINTER", year: 2026 });
  });
  it("enero–marzo = Winter del año anterior", () => {
    expect(asqSeasonOf(2027, 1)).toEqual({ season: "WINTER", year: 2026 });
    expect(asqSeasonOf(2027, 3)).toEqual({ season: "WINTER", year: 2026 });
  });
});
