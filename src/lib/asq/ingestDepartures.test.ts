import { describe, it, expect } from "vitest";
import {
  asqTableFields,
  recordsToNdjson,
  quartersIn,
} from "@/lib/asq/ingestDepartures";
import type { AsqRecord } from "@/lib/asq/parseWorkbook";

describe("asqTableFields", () => {
  const fields = asqTableFields();
  const byName = new Map(fields.map((f) => [f.name, f]));

  it("tiene 121 campos (114 canónicos + 7 metadatos)", () => {
    expect(fields).toHaveLength(121);
  });

  it("mapea los tipos BQ correctos", () => {
    expect(byName.get("Airport")?.type).toBe("STRING");
    expect(byName.get("Airp_Size")?.type).toBe("INTEGER");
    expect(byName.get("Weight")?.type).toBe("FLOAT");
    expect(byName.get("Dep_Date")?.type).toBe("DATE");
    expect(byName.get("Language")?.type).toBe("INTEGER");
    expect(byName.get("_ingested_at")?.type).toBe("TIMESTAMP");
    expect(byName.get("_is_own_airport")?.type).toBe("BOOLEAN");
    expect(byName.get("_extra")?.type).toBe("STRING");
  });

  it("todos los campos son NULLABLE", () => {
    expect(fields.every((f) => f.mode === "NULLABLE")).toBe(true);
  });
});

describe("recordsToNdjson", () => {
  const rec1: AsqRecord = {
    Airport: "ARI",
    Overall_Sat: 0, // rating 0 -> debe preservarse (no volverse null)
    Quarter: "SU25",
    QuestNo: "25S1",
    _source_file: "f.xlsx",
    _season_label: "Summer 2025",
    _is_own_airport: true,
    _row_key: "SU25|25S1",
    _extra: { Foo: "bar" },
  };
  const rec2: AsqRecord = {
    Airport: "COO",
    Overall_Sat: null,
    Quarter: "SU25",
    QuestNo: "25S2",
    _source_file: "f.xlsx",
    _season_label: "Summer 2025",
    _is_own_airport: false,
    _row_key: "SU25|25S2",
  };

  const ndjson = recordsToNdjson([rec1, rec2], "ing-1", "2026-08-09T00:00:00.000Z");
  const lines = ndjson.trimEnd().split("\n");

  it("emite una línea JSON válida por registro", () => {
    expect(lines).toHaveLength(2);
    expect(() => lines.map((l) => JSON.parse(l))).not.toThrow();
  });

  it("preserva 0, null y añade metadatos de batch", () => {
    const o = JSON.parse(lines[0]);
    expect(o.Overall_Sat).toBe(0);
    expect(o.Language).toBeNull(); // ausente en el registro -> null
    expect(o._ingest_id).toBe("ing-1");
    expect(o._ingested_at).toBe("2026-08-09T00:00:00.000Z");
    expect(o._is_own_airport).toBe(true);
  });

  it("serializa _extra a string JSON (o null si no hay)", () => {
    expect(JSON.parse(lines[0])._extra).toBe('{"Foo":"bar"}');
    expect(JSON.parse(lines[1])._extra).toBeNull();
    expect(JSON.parse(lines[1]).Overall_Sat).toBeNull();
  });
});

describe("quartersIn", () => {
  it("deduplica y descarta null", () => {
    const recs = [
      { Quarter: "SU25" },
      { Quarter: "SU25" },
      { Quarter: "WI25" },
      { Quarter: null },
    ] as unknown as AsqRecord[];
    expect(quartersIn(recs).sort()).toEqual(["SU25", "WI25"]);
  });
});
