import { describe, it, expect } from "vitest";
import { buildOutline, type OutlineInput, type SlideSpec } from "./outline";
import { applyToggles, defaultTemplate, enabledKeys, parseNotes, parseTemplate } from "./modules";

const base = (over: Partial<OutlineInput> = {}): OutlineInput => ({
  modules: enabledKeys(defaultTemplate("MENSUAL")),
  notes: {},
  comentarios: "",
  photosCount: 0,
  processes: [{ label: "Check in" }, { label: "AVSEC" }],
  aga: [
    { audience: "Pasajeros", hasVoice: true },
    { audience: "Acompañantes", hasVoice: false },
  ],
  ...over,
});

const types = (s: SlideSpec[]) => s.map((x) => (x.type === "section" ? `section:${x.title}` : x.type));

describe("outline del informe mensual", () => {
  it("plantilla por defecto = misma secuencia que el informe anterior", () => {
    const s = buildOutline(base({ comentarios: "Hola", photosCount: 5 }));
    expect(types(s)).toEqual([
      "cover",
      "section:Encuestas ASQ",
      "asq",
      "section:Mediciones de tiempos",
      "proceso",
      "proceso",
      "section:Encuestas AGA · Experiencia",
      "aga-guide",
      "aga",
      "voice",
      "aga",
      "text",
      "photos",
      "photos",
      "closing",
    ]);
    const sections = s.filter((x) => x.type === "section").map((x) => (x as { module: string }).module);
    expect(sections).toEqual(["Módulo 01", "Módulo 02", "Módulo 03"]);
    const photos = s.filter((x) => x.type === "photos");
    expect(photos).toEqual([
      { type: "photos", start: 0, count: 4, index: 0, total: 2 },
      { type: "photos", start: 4, count: 1, index: 1, total: 2 },
    ]);
  });

  it("sin plan AGA no hay módulo 03; sin mediciones, estado vacío", () => {
    const s = buildOutline(base({ aga: [], processes: [] }));
    expect(types(s)).toEqual([
      "cover",
      "section:Encuestas ASQ",
      "asq",
      "section:Mediciones de tiempos",
      "tiempos-empty",
      "closing",
    ]);
  });

  it("apagar un módulo renumera los siguientes", () => {
    const modules = enabledKeys(applyToggles(defaultTemplate("MENSUAL"), { "asq-avance": false }));
    const s = buildOutline(base({ modules }));
    expect(s[1]).toEqual({ type: "section", module: "Módulo 01", title: "Mediciones de tiempos" });
  });

  it("solo AGA Acompañantes: comparte divisor y guía", () => {
    const modules = enabledKeys(applyToggles(defaultTemplate("MENSUAL"), { "aga-pasajeros": false }));
    const s = buildOutline(base({ modules }));
    const i = s.findIndex((x) => x.type === "aga-guide");
    expect(s[i + 1]).toEqual({ type: "aga", index: 1 });
    expect(s.filter((x) => x.type === "aga")).toHaveLength(1);
  });

  it("análisis por módulo y análisis general", () => {
    const modules = enabledKeys(applyToggles(defaultTemplate("MENSUAL"), { analisis: true }));
    const s = buildOutline(
      base({ modules, aga: [], notes: { tiempos: "Mejoró AVSEC", analisis: "Recomendaciones" } })
    );
    const texts = s.filter((x) => x.type === "text") as Extract<SlideSpec, { type: "text" }>[];
    expect(texts.map((t) => t.title)).toEqual(["Análisis · Mediciones de tiempos", "Análisis y recomendaciones"]);
    // La nota de tiempos va justo después de su último proceso.
    const at = s.findIndex((x) => x.type === "text");
    expect(s[at - 1]).toEqual({ type: "proceso", index: 1 });
  });
});

describe("plantillas y ediciones", () => {
  it("semestral abre con análisis y trae ASQ resultados; fotos apagadas", () => {
    const t = defaultTemplate("SEMESTRAL");
    expect(t[0]).toEqual({ key: "analisis", enabled: true });
    expect(t.find((e) => e.key === "asq-resultados")?.enabled).toBe(true);
    expect(t.find((e) => e.key === "fotos-comentarios")?.enabled).toBe(false);
  });
  it("parseTemplate descarta claves desconocidas o de otro tipo", () => {
    expect(parseTemplate([{ key: "x" }, { key: "asq-resultados" }], "MENSUAL")).toBeNull();
    expect(parseTemplate([{ key: "tiempos", enabled: false }, { key: "tiempos" }], "MENSUAL")).toEqual([
      { key: "tiempos", enabled: false },
    ]);
  });
  it("parseNotes ignora vacíos y módulos sin texto propio", () => {
    expect(parseNotes({ tiempos: "  ok ", "fotos-comentarios": "x", analisis: " " })).toEqual({ tiempos: "ok" });
  });
});
