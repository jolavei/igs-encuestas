import { describe, it, expect } from "vitest";
import { agaCategories, agaCategoryOf, hotspotTop } from "./seasonSlides";
import { agaCompareScene, agaEvolutionScene, agaMapScene, agaSeasonScene, tiemposHistoryScene, tiemposHotspotScene, type SceneReport } from "./seasonScenes";
import { iconFor, type Prim, type Scene } from "./scene";
import type { SeasonExtras } from "./seasonReport";

const item = (section: string, label: string, avg: number, n: number) => {
  const dist = [0, 0, 0, 0, 0];
  dist[Math.round(avg) - 1] = n;
  return { section, label, n, sum: avg * n, avg, dist };
};
const stats = (n: number) => ({
  n,
  ratingAvg: 3.9,
  ratingTop2: 80,
  items: [item("Check-in", "Atención", 4.2, n), item("Check-in", "Espera", 3.8, n), item("Wi-Fi", "Conexión", 3, Math.round(n / 10)), item("Experiencia general", "Señalética", 4, n)],
});

const hot = (meta: number | null, withAirlines: boolean) => ({
  label: "Check in tradicional",
  meta,
  data: {
    total: { n: 40, prom: 6, p90: 12 },
    cells: [
      { dow: 0, hour: 6, n: 20, prom: 25 },
      { dow: 3, hour: 10, n: 18, prom: 5 },
      { dow: 6, hour: 22, n: 2, prom: 61 },
    ],
    bins: [
      { min: 1, n: 20 },
      { min: 5, n: 18 },
      { min: 61, n: 2 },
    ],
    airlines: withAirlines ? [{ airline: "SKY", n: 40, prom: 6, p90: 12 }] : [],
    days: [
      { dow: 3, n: 18, prom: 5 },
      { dow: 0, n: 20, prom: 25 },
      { dow: 6, n: 2, prom: 61 },
    ],
    hours: [
      { hour: 6, n: 20, prom: 25 },
      { hour: 10, n: 18, prom: 5 },
      { hour: 22, n: 2, prom: 61 },
    ],
  },
});

const report: SceneReport = {
  airport: { code: "PMC", companyName: "Aeropuerto El Tepual - Puerto Montt" },
  monthLabel: "Summer 2026",
  aga: [
    { audience: "Pasajeros", month: stats(300) },
    { audience: "Acompañantes", month: stats(60) },
  ],
  seasonal: {
    focusLabel: "Summer 2026",
    focusCode: "SU26",
    tiemposHistory: {
      seasons: [{ code: "WI25" }, { code: "SU26" }],
      series: [{ label: "Check in", meta: 20, values: [5, null] }],
    },
    tiemposHot: [hot(20, true), hot(null, false)],
    agaHistory: [0, 1].map(() => ({
      seasons: [
        { code: "WI25", n: 200, ratingAvg: 4 },
        { code: "SU26", n: 300, ratingAvg: 3.9 },
      ],
      months: [
        { label: "abr 2026", n: 50, ratingAvg: 3.8 },
        { label: "may 2026", n: 50, ratingAvg: 4 },
      ],
      categories: [{ label: "Check-in", values: [4.1, 4] }],
    })),
  } as unknown as SeasonExtras,
};

function outside(scene: Scene): Prim[] {
  const within = (x: number, y: number) => Number.isFinite(x) && Number.isFinite(y) && x >= -0.5 && x <= 1280.5 && y >= -0.5 && y <= 720.5;
  return scene.prims.filter((p) => {
    if (p.k === "box" || p.k === "img") return !within(p.x, p.y) || !within(p.x + p.w, p.y + p.h) || p.w < 0 || p.h < 0;
    if (p.k === "line") return !within(p.x1, p.y1) || !within(p.x2, p.y2);
    return !within(p.cx, p.cy);
  });
}
const texts = (s: Scene) => s.prims.flatMap((p) => (p.k === "box" && typeof p.text === "string" ? [p.text] : []));

describe("íconos", () => {
  it("cada categoría ASQ y proceso de tiempos tiene el suyo", () => {
    expect(
      [
        "Accesos al aeropuerto",
        "Check in",
        "Filtro de Seguridad",
        "Control migratorio",
        "Restaurantes y tiendas",
        "Zona de puertas",
        "A través del aeropuerto",
        "Atmósfera del aeropuerto",
        "Retiro de equipajes — Última maleta",
        "Check in quiosco",
        "AVSEC",
        "Pasaporte emigración",
        "Control aduana / SAG",
      ].map(iconFor)
    ).toEqual(["accesos", "checkin", "avsec", "migracion", "tiendas", "puertas", "transito", "terminal", "equipaje", "checkin", "avsec", "migracion", "migracion"]);
  });
  it("satisfacción general no lleva ícono", () => {
    expect(iconFor("Satisfacción general")).toBeNull();
  });
});

describe("categorías AGA", () => {
  it("usa la sección del ítem y separa los ítems de experiencia general", () => {
    expect(agaCategoryOf("Wi-Fi", "Conexión")).toBe("Wi-Fi");
    expect(agaCategoryOf("Experiencia general", "Señalética del terminal")).toBe("Señalética");
    expect(agaCategoryOf("Experiencia general", "Limpieza")).toBe("Instalaciones y terminal");
  });
  it("agrega nota, alcance y distribución, de mejor a peor", () => {
    const [first, , last] = agaCategories(stats(100));
    expect(first).toMatchObject({ label: "Check-in", avg: 4, reach: 100 });
    expect(last).toMatchObject({ label: "Wi-Fi", avg: 3, reach: 10 });
    expect(last.dist).toEqual([0, 0, 100, 0, 0]);
  });
});

describe("hotspots", () => {
  it("los mayores tiempos ignoran celdas con muy pocas mediciones", () => {
    expect(hotspotTop(report.seasonal!.tiemposHot[0].data.cells).map((c) => c.prom)).toEqual([25, 5]);
  });
  it("con aerolíneas resume por aerolínea; sin ellas, por día en orden", () => {
    const withAirlines = texts(tiemposHotspotScene(report, 0));
    expect(withAirlines).toContain("Aerolínea");
    expect(withAirlines).toContain("Percentil 90");
    const byDay = texts(tiemposHotspotScene(report, 1));
    expect(byDay).toContain("Día");
    expect(byDay.filter((t) => ["Lunes", "Jueves", "Domingo"].includes(t))).toEqual(["Lunes", "Jueves", "Domingo"]);
  });
});

describe("escenas", () => {
  it("todas las primitivas quedan dentro de la diapositiva", () => {
    const scenes = [
      tiemposHotspotScene(report, 0),
      tiemposHotspotScene(report, 1),
      tiemposHistoryScene(report),
      agaSeasonScene(report, 0),
      agaMapScene(report, 0),
      agaEvolutionScene(report, 0),
      agaCompareScene(report),
    ];
    for (const s of scenes) expect(outside(s), s.title).toEqual([]);
  });
  it("público sin encuestas: aviso en lugar de gráficos", () => {
    const empty: SceneReport = { ...report, aga: [{ audience: "Pasajeros", month: { n: 0, items: [] } }] };
    expect(texts(agaSeasonScene(empty, 0))).toContain("Sin encuestas en esta temporada.");
  });
});
