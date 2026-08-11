import { describe, it, expect, vi, beforeEach } from "vitest";

// Genera un .xlsx mínimo en memoria (hoja "Data") para simular la bajada de GCS.
async function makeXlsx(): Promise<Buffer> {
  const mod = await import("xlsx");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX = ((mod as any).default ?? mod);
  const aoa = [
    ["Airport", "Overall_Sat", "Dep_Date", "Dep_Time", "Quarter", "QuestNo", "Weight", "Language"],
    ["ARI", 4, 45760, 0.5708333333333333, "SU25", "25S1", 0.7, 50],
    ["COO", 5, 45761, null, "SU25", "25S2", 1.0, 3],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

vi.mock("@/lib/gcs", () => ({
  gcsConfigured: () => true,
  downloadObject: vi.fn(async () => makeXlsx()),
}));

vi.mock("@/lib/asq/ownAirports", () => ({
  getOwnAirportCodes: vi.fn(async () => new Set(["ARI"])),
}));

vi.mock("@/lib/bigquery", () => ({
  bqProjectId: () => "proj",
  bqQuery: vi.fn(async () => [{ n: 100 }]),
  ensureDataset: vi.fn(async () => {}),
  ensureTable: vi.fn(async () => {}),
  bqDml: vi.fn(async () => 0),
  bqLoadNdjson: vi.fn(async () => ({ jobId: "job-1", outputRows: 2 })),
  BigQueryCredentialsError: class extends Error {},
}));

import { analyzeObject, ingestObject } from "@/lib/asq/ingestService";
import { bqQuery } from "@/lib/bigquery";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analyzeObject", () => {
  it("baja, parsea, marca propios y arma el preview", async () => {
    const a = await analyzeObject("asq/departures/abc-Summer.xlsx");
    expect(a.report.rowCount).toBe(2);
    expect(a.quarters).toEqual(["SU25"]);
    expect(a.report.airports).toEqual({ ARI: 1, COO: 1 });
    expect(a.report.ownAirportRows).toBe(1); // sólo ARI es propio
    expect(a.table).toBe("proj.encuestas.asq_departures");
    expect(a.ndjsonBytes).toBeGreaterThan(0);
    expect(a.existingRowsForQuarters).toBe(100);
    expect(a.fileName).toBe("abc-Summer.xlsx");
  });

  it("existingRowsForQuarters = null si BQ no responde", async () => {
    vi.mocked(bqQuery).mockRejectedValueOnce(new Error("tabla inexistente"));
    const a = await analyzeObject("asq/departures/x.xlsx", "Summer_2025.xlsx");
    expect(a.existingRowsForQuarters).toBeNull();
    expect(a.fileName).toBe("Summer_2025.xlsx"); // usa el fileName provisto
  });
});

describe("ingestObject (dry-run)", () => {
  it("no escribe en BQ y devuelve el resumen", async () => {
    const { result, report } = await ingestObject("asq/departures/x.xlsx", "f.xlsx", { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.rowCount).toBe(2);
    expect(report.mappedColumns).toContain("Airport");
  });
});
