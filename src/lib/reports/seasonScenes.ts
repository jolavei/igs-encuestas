// Diapositivas gráficas de los informes semestral y anual, como escenas (ver scene.ts): las
// dibujan igual el deck HTML y el PPTX. ACI ASQ (perfil, comparación con la industria,
// apertura por subatributo y aerolínea, índices, histórico), mapa de hotspots de tiempos y
// Encuestas AGA (distribución, mapa por temporada, nota vs alcance, pasajeros vs acompañantes).
//
// Puro: recibe el informe ya armado.

import {
  AIGS,
  BENCH,
  LIKERT,
  SCORE_STANDARD,
  SERIES,
  fmtInt,
  fmtMMSS,
  fmtScore,
  fmtScore2,
  scoreColor,
  scoreHeat,
  timeAxis,
  timeHeat,
} from "@/lib/reports/design";
import { AREA, iconFor, type Prim, type ReportIcon, type Run, type Scene } from "@/lib/reports/scene";
import { ASQ_NOTE, agaCategories, asqKeyPoints, hotspotTop } from "@/lib/reports/seasonSlides";
import type { AsqAttribute, AsqResults } from "@/lib/asq/results";
import type { SeasonExtras } from "@/lib/reports/seasonReport";

type AgaStatsLite = {
  n: number;
  ratingAvg?: number | null;
  ratingTop2?: number | null;
  items: { section: string; label: string; n: number; sum: number; avg: number | null; dist: number[] }[];
};
export type SceneReport = {
  airport: { code: string; companyName: string };
  monthLabel: string;
  seasonal?: SeasonExtras;
  aga: { audience: string; month: AgaStatsLite }[];
};

const MUTED = AIGS.muted;
const INK = AIGS.ink;
const BODY = AIGS.body;
const PANEL = AIGS.surfaceSoft;
const STANDARD = SERIES.meta;
const STD_LABEL = "Estándar AIGS 3,50";

const full = (r: SceneReport) => r.airport.companyName.replace(" - ", ", ");

// --- Primitivas ---------------------------------------------------------------
type BoxOpts = Omit<Extract<Prim, { k: "box" }>, "k" | "x" | "y" | "w" | "h">;
const box = (x: number, y: number, w: number, h: number, o: BoxOpts = {}): Prim => ({ k: "box", x, y, w, h, ...o });
const text = (x: number, y: number, w: number, h: number, t: string | Run[], o: BoxOpts = {}): Prim =>
  box(x, y, w, h, { text: t, valign: "middle", color: BODY, size: 12, ...o });
const line = (x1: number, y1: number, x2: number, y2: number, color: string, o: { width?: number; dash?: boolean } = {}): Prim => ({
  k: "line",
  x1,
  y1,
  x2,
  y2,
  color,
  ...o,
});
const panelTitle = (x: number, y: number, w: number, t: string, o: BoxOpts = {}) =>
  text(x, y, w, 22, t, { size: 14, bold: true, color: INK, nowrap: true, ...o });
const note = (t: string) => text(250, 668, AREA.r - 250, 30, t, { size: 10.5, color: MUTED, align: "right" });

const icon = (x: number, y: number, size: number, name: ReportIcon): Prim => ({ k: "img", x, y, w: size, h: size, icon: name });
/** Ícono grande de la categoría o proceso de la diapositiva, a la derecha del título. */
const headIcon = (label: string): Prim[] => {
  const name = iconFor(label);
  return name ? [icon(AREA.r - 90, 36, 90, name)] : [];
};
/** Ícono al inicio de una fila; devuelve el espacio que ocupa, para correr el texto. */
function rowIcon(prims: Prim[], x: number, y: number, h: number, size: number, name: ReportIcon | null): number {
  const s = Math.min(size, h - 2);
  if (name) prims.push(icon(x, y + (h - s) / 2, s, name));
  return s + 8;
}
/** Categorías AGA sin ícono propio (Wi-Fi, servicios higiénicos…) son servicios del terminal. */
const agaIcon = (label: string): ReportIcon => iconFor(label) ?? "terminal";

type LegendItem = { color: string; label: string; dash?: boolean };
function legend(x: number, y: number, items: LegendItem[], o: { right?: boolean; size?: number } = {}): Prim[] {
  const size = o.size ?? 11;
  const widths = items.map((i) => 18 + i.label.length * size * 0.56 + 14);
  let cx = o.right ? x - widths.reduce((a, b) => a + b, 0) : x;
  const out: Prim[] = [];
  items.forEach((it, i) => {
    if (it.dash) out.push(line(cx, y + 8, cx + 14, y + 8, it.color, { width: 2, dash: true }));
    else out.push(box(cx, y + 3, 11, 11, { fill: it.color, radius: 2 }));
    out.push(text(cx + 18, y, widths[i], 16, it.label, { size, color: BODY, nowrap: true }));
    cx += widths[i];
  });
  return out;
}

function kpiTile(x: number, y: number, w: number, h: number, label: string, value: string, sub?: string, valueColor: string = AIGS.blue): Prim[] {
  return [
    box(x, y, w, h, { stroke: AIGS.hairline, radius: 12, fill: AIGS.white }),
    text(x + 14, y + 8, w - 28, 16, label.toUpperCase(), { size: 10.5, color: MUTED, nowrap: true }),
    text(x + 14, y + 24, w - 28, h - (sub ? 46 : 30), value, { size: 26, bold: true, mono: true, color: valueColor, nowrap: true }),
    ...(sub ? [text(x + 14, y + h - 22, w - 28, 16, sub, { size: 11, color: MUTED, nowrap: true })] : []),
  ];
}

// --- Gráfico de líneas ---------------------------------------------------------
type LineSeries = {
  values: (number | null)[];
  color: string;
  width?: number;
  dash?: boolean;
  labelAt?: number[]; // índices con el valor rotulado
  fmt?: (v: number) => string;
};
function lineChart(o: {
  x: number;
  y: number;
  w: number;
  h: number;
  labels: string[];
  series: LineSeries[];
  min: number;
  max: number;
  ticks: number[];
  fmtTick: (v: number) => string;
  standard?: { value: number; label?: string };
  every?: number; // rotula 1 de cada `every` en el eje X
  focusIndex?: number;
}): Prim[] {
  const left = 34;
  const bottom = 20;
  const px = o.x + left;
  const pw = o.w - left - 8;
  const pyTop = o.y + 6;
  const ph = o.h - bottom - 6;
  const n = o.labels.length;
  const X = (i: number) => (n <= 1 ? px + pw / 2 : px + 12 + (i * (pw - 24)) / (n - 1));
  const Y = (v: number) => pyTop + (1 - (Math.max(o.min, Math.min(o.max, v)) - o.min) / (o.max - o.min)) * ph;
  const out: Prim[] = [];
  for (const t of o.ticks) {
    out.push(line(px, Y(t), px + pw, Y(t), "EEF2F6", { width: 1 }));
    out.push(text(o.x, Y(t) - 8, left - 6, 16, o.fmtTick(t), { size: 10, color: MUTED, align: "right", nowrap: true }));
  }
  if (o.focusIndex != null && o.focusIndex >= 0) {
    const bw = n <= 1 ? pw : (pw - 24) / Math.max(n - 1, 1);
    out.push(box(X(o.focusIndex) - bw / 2, pyTop, bw, ph, { fill: "F4F6F8" }));
  }
  const every = o.every ?? 1;
  o.labels.forEach((lb, i) => {
    if (i % every === 0 || i === n - 1)
      out.push(text(X(i) - 30, o.y + o.h - bottom + 2, 60, 16, lb, { size: 10, color: MUTED, align: "center", nowrap: true }));
  });
  if (o.standard) {
    out.push(line(px, Y(o.standard.value), px + pw, Y(o.standard.value), STANDARD, { width: 1.5, dash: true }));
    if (o.standard.label)
      out.push(text(px + pw - 150, Y(o.standard.value) + 1, 150, 14, o.standard.label, { size: 10, color: "9A7F00", align: "right", nowrap: true }));
  }
  for (const s of o.series) {
    s.values.forEach((v, i) => {
      const nx = s.values[i + 1];
      if (v != null && nx != null) out.push(line(X(i), Y(v), X(i + 1), Y(nx), s.color, { width: s.width ?? 2, dash: s.dash }));
    });
    s.values.forEach((v, i) => {
      if (v == null) return;
      const alone = s.values[i - 1] == null && s.values[i + 1] == null;
      if (alone || s.labelAt) out.push({ k: "dot", cx: X(i), cy: Y(v), r: alone ? 4 : 3, fill: s.color, tip: `${o.labels[i]}: ${(s.fmt ?? o.fmtTick)(v)}` });
      if (s.labelAt?.includes(i))
        out.push(text(X(i) - 30, Y(v) - 20, 60, 15, (s.fmt ?? o.fmtTick)(v), { size: 10.5, bold: true, color: INK, align: "center", nowrap: true }));
    });
  }
  return out;
}

// --- Barras ---------------------------------------------------------------------
/** Barras horizontales agrupadas en escala 1–5, con el Estándar AIGS. */
function groupedBars(o: {
  x: number;
  y: number;
  w: number;
  h: number;
  labelW: number;
  rows: { label: string; sub?: string; icon?: ReportIcon | null; values: (number | null)[] }[];
  colors: string[];
}): Prim[] {
  const out: Prim[] = [];
  const barX = o.x + o.labelW;
  const valueW = 40;
  const barW = o.w - o.labelW - valueW;
  const S = (v: number) => ((v - 1) / 4) * barW;
  const rowH = o.h / Math.max(o.rows.length, 1);
  const bh = Math.min(22, (rowH - 8) / o.colors.length - 2);
  o.rows.forEach((r, i) => {
    const y = o.y + i * rowH;
    const total = o.colors.length * (bh + 2);
    const by = y + (rowH - total) / 2;
    // Rótulo y posición centrados respecto de las barras de la fila.
    const mid = y + rowH / 2;
    const shift = o.rows.some((x) => x.icon) ? rowIcon(out, o.x, y, rowH, 46, r.icon ?? null) : 0;
    out.push(
      text(o.x + shift, r.sub ? mid - 26 : mid - 20, o.labelW - shift - 10, r.sub ? 32 : 40, r.label, { size: 12, color: INK, valign: r.sub ? "bottom" : "middle" }),
      ...(r.sub ? [text(o.x + shift, mid + 7, o.labelW - shift - 10, 14, r.sub, { size: 10, color: MUTED, valign: "top", nowrap: true })] : [])
    );
    r.values.forEach((v, j) => {
      const yy = by + j * (bh + 2);
      if (v == null) return;
      out.push(box(barX, yy, Math.max(1, S(v)), bh, { fill: o.colors[j], tip: fmtScore2(v) }));
      out.push(text(barX + S(v) + 4, yy - 2, valueW, bh + 4, fmtScore2(v), { size: 10.5, color: j === 0 ? INK : BODY, bold: j === 0, nowrap: true }));
    });
  });
  const sx = barX + S(SCORE_STANDARD);
  out.push(line(sx, o.y - 2, sx, o.y + o.h + 2, STANDARD, { width: 1.5, dash: true }));
  out.push(text(sx - 70, o.y + o.h + 2, 140, 14, STD_LABEL, { size: 10, color: "9A7F00", align: "center", nowrap: true }));
  return out;
}

/** Columnas de una distribución (%) sobre un eje ordenado. */
function columns(x: number, y: number, w: number, h: number, rows: { label: string; pct: number }[]): Prim[] {
  const out: Prim[] = [];
  const max = Math.max(1, ...rows.map((r) => r.pct));
  const cw = w / Math.max(rows.length, 1);
  const ph = h - 36;
  rows.forEach((r, i) => {
    const bh = Math.max(1, (r.pct / max) * (ph - 4));
    const cx = x + i * cw;
    out.push(box(cx + cw * 0.18, y + 16 + ph - bh, cw * 0.64, bh, { fill: AIGS.blue, tip: `${r.label}: ${r.pct}%` }));
    out.push(text(cx - 4, y + ph - bh, cw + 8, 15, `${r.pct}%`, { size: 11, bold: true, color: INK, align: "center", nowrap: true }));
    out.push(text(cx - 6, y + h - 19, cw + 12, 16, r.label, { size: 10, color: MUTED, align: "center", nowrap: true }));
  });
  out.push(line(x, y + 16 + ph, x + w, y + 16 + ph, AIGS.hairline));
  return out;
}

/** Barras horizontales de una distribución (%). */
function hbars(x: number, y: number, w: number, h: number, rows: { label: string; pct: number }[], labelW = 74): Prim[] {
  const out: Prim[] = [];
  const rowH = Math.min(30, h / Math.max(rows.length, 1));
  const barW = w - labelW - 38;
  const max = Math.max(1, ...rows.map((r) => r.pct));
  rows.forEach((r, i) => {
    const yy = y + i * rowH;
    const bw = (r.pct / max) * barW;
    out.push(text(x, yy, labelW - 6, rowH, r.label, { size: 11, color: BODY, nowrap: true }));
    out.push(box(x + labelW, yy + rowH * 0.25, Math.max(1, bw), rowH * 0.5, { fill: AIGS.blue, tip: `${r.label}: ${r.pct}%` }));
    out.push(text(x + labelW + bw + 4, yy, 36, rowH, `${r.pct}%`, { size: 11, bold: true, color: INK, nowrap: true }));
  });
  return out;
}

const card = (x: number, y: number, w: number, h: number, title: string): Prim[] => [
  box(x, y, w, h, { fill: PANEL, radius: 10 }),
  text(x + 14, y + 8, w - 28, 18, title, { size: 13, bold: true, color: INK, nowrap: true }),
];

/** Reparte bloques en dos columnas de altura parecida. */
function twoColumns<T>(blocks: T[], weight: (b: T) => number): [T[], T[]] {
  const total = blocks.reduce((a, b) => a + weight(b), 0);
  const left: T[] = [];
  const right: T[] = [];
  let acc = 0;
  for (const b of blocks) {
    if (acc < total / 2 && (acc + weight(b) / 2 <= total / 2 || left.length === 0)) {
      left.push(b);
      acc += weight(b);
    } else right.push(b);
  }
  return [left, right];
}

const diffText = (a: number | null, b: number | null) => {
  if (a == null || b == null) return { text: "—", color: MUTED };
  const d = Math.round((a - b) * 100) / 100;
  return {
    text: `${d >= 0 ? "+" : "−"}${fmtScore2(Math.abs(d))}`,
    color: Math.abs(d) < 0.05 ? MUTED : d > 0 ? AIGS.up : AIGS.down,
  };
};

const benchLegend = (r: SceneReport, x: number, y: number, o: { right?: boolean } = {}) =>
  legend(
    x,
    y,
    [
      { color: BENCH.airport, label: r.airport.code },
      { color: BENCH.chile, label: "Chile" },
      { color: BENCH.all, label: "Programa regional" },
    ],
    o
  );

// ---------------------------------------------------------------------------
// ACI ASQ
// ---------------------------------------------------------------------------

export function asqGuideScene(): Scene {
  const prims: Prim[] = [];
  const paragraphs = [
    "ACI ASQ Survey es el programa comparativo de benchmarking del Consejo Internacional de Aeropuertos (ACI). Evalúa la experiencia y la satisfacción del pasajero y la compara con aeropuertos de igual categoría.",
    "Se divide en el programa principal (2 o más millones de pasajeros al año) y el regional (menos de 2 millones), donde están inscritos los aeropuertos de Chile.",
    "ASQ Departure Survey evalúa el proceso completo, desde la llegada al terminal hasta el embarque: servicios aeronáuticos y comerciales, aspectos de mayor importancia para el pasajero y cómo el servicio impacta en su estado emocional.",
  ];
  paragraphs.forEach((p, i) => {
    prims.push(box(AREA.x, 136 + i * 84 + 6, 6, 6, { fill: AIGS.blue, radius: 3 }));
    prims.push(text(AREA.x + 18, 132 + i * 84, 540, 78, p, { size: 14.5, color: BODY, valign: "top" }));
  });
  const stats = [
    ["31", "preguntas de satisfacción por proceso, más los 3 aspectos más importantes"],
    ["5", "preguntas de emociones: cómo se sienten al transitar por el aeropuerto"],
    ["2", "preguntas de satisfacción y experiencia general"],
    ["13", "preguntas de conocimiento del viajero, principalmente demográficas"],
    ["2", "preguntas abiertas"],
  ];
  stats.forEach(([v, t], i) => {
    const y = 132 + i * 50;
    prims.push(text(670, y, 64, 44, v, { size: 28, bold: true, mono: true, color: AIGS.blue, align: "right" }));
    prims.push(text(750, y, AREA.r - 750, 44, t, { size: 14, color: BODY }));
    if (i > 0) prims.push(line(670, y - 3, AREA.r, y - 3, AIGS.hairline));
  });
  prims.push(panelTitle(AREA.x, 386, 500, "Recorrido evaluado"));
  const steps: [string, ReportIcon][] = [
    ["Accesos", "accesos"],
    ["Check in", "checkin"],
    ["Filtro de seguridad", "avsec"],
    ["Control migratorio", "migracion"],
    ["Restaurantes y tiendas", "tiendas"],
    ["Zona de puertas", "puertas"],
    ["Atmósfera", "terminal"],
    ["A través del aeropuerto", "transito"],
  ];
  const sw = (AREA.w - 7 * 8) / 8;
  const stepIcon = 104;
  steps.forEach(([s, name], i) => {
    const x = AREA.x + i * (sw + 8);
    prims.push(icon(x + (sw - stepIcon) / 2, 410, stepIcon, name));
    prims.push(text(x, 516, sw, 32, s, { size: 12.5, color: INK, align: "center", valign: "top" }));
  });
  prims.push(panelTitle(AREA.x, 552, 500, "Escala de notas"));
  const scale = ["1 · Muy deficiente", "2 · Deficiente", "3 · Aceptable", "4 · Bueno", "5 · Excelente"];
  const cw = 136;
  scale.forEach((s, i) => {
    const c = LIKERT[i];
    prims.push(text(AREA.x + i * (cw + 6), 578, cw, 34, s, { fill: c, radius: 6, size: 12, align: "center", color: i === 0 || i === 4 ? AIGS.white : INK }));
  });
  prims.push(
    text(AREA.x + 5 * (cw + 6) + 14, 572, AREA.r - (AREA.x + 5 * (cw + 6) + 14), 46, [
      { text: "Estándar AIGS 3,50: ", bold: true, color: INK },
      { text: "nivel de servicio mínimo esperable definido por Aeródromos IGS." },
    ], { size: 13 })
  );
  return { title: "¿Qué evalúa el programa ACI ASQ?", subtitle: "Airport Service Quality · Departures", prims };
}

export function asqKeyPointsScene(r: SceneReport, a: AsqResults): Scene {
  const o = a.overall;
  const prims: Prim[] = [];
  const gap = 14;
  const tw = (AREA.w - gap * 3) / 4;
  [
    kpiTile(AREA.x, AREA.y, tw, 92, "Cantidad de encuestas", fmtInt(a.n), a.season.label, INK),
    kpiTile(AREA.x + tw + gap, AREA.y, tw, 92, "Satisfacción general", `${fmtScore2(o.airport)} / 5`, o.top2 != null ? `${o.top2}% con nota 4 o 5` : undefined, scoreColor(o.airport)),
    kpiTile(AREA.x + 2 * (tw + gap), AREA.y, tw, 92, "Posición en Chile", `${o.rankChile ?? "—"}° de ${o.totalChile}`, `Promedio Chile ${fmtScore2(o.chile)}`),
    kpiTile(AREA.x + 3 * (tw + gap), AREA.y, tw, 92, "Programa regional", `${o.rankAll ?? "—"}° de ${o.totalAll}`, `Promedio ${fmtScore2(o.all)}`),
  ].forEach((k) => prims.push(...k));

  const chartW = 640;
  prims.push(panelTitle(AREA.x, 234, 300, "Histórico de satisfacción general"));
  prims.push(...benchLegend(r, AREA.x + chartW, 238, { right: true }));
  const vals = a.history.flatMap((h) => [h.airport, h.chile, h.all]).filter((v): v is number => v != null);
  const min = Math.min(3, Math.floor(Math.min(...vals, 5) * 2) / 2);
  const labels = a.history.map((h) => h.code);
  prims.push(
    ...lineChart({
      x: AREA.x,
      y: 258,
      w: chartW,
      h: 244,
      labels,
      min,
      max: 5,
      ticks: [min, ...[3, 3.5, 4, 4.5, 5].filter((t) => t > min)],
      fmtTick: (v) => fmtScore(v),
      standard: { value: SCORE_STANDARD, label: STD_LABEL },
      every: labels.length > 10 ? 2 : 1,
      series: [
        { values: a.history.map((h) => h.all), color: BENCH.all },
        { values: a.history.map((h) => h.chile), color: BENCH.chile },
        { values: a.history.map((h) => h.airport), color: BENCH.airport, width: 3, labelAt: a.history.map((_, i) => i), fmt: (v) => fmtScore2(v) },
      ],
    })
  );

  const cx = AREA.x + chartW + 28;
  const cw = AREA.r - cx;
  const critical = a.attributes
    .filter((x) => (x.airport ?? 9) < SCORE_STANDARD)
    .sort((p, q) => (p.airport ?? 0) - (q.airport ?? 0));
  prims.push(panelTitle(cx, 234, cw, `Atributos críticos (< 3,50): ${critical.length}`, { color: critical.length ? AIGS.down : INK }));
  const shown = critical.slice(0, 8);
  const rowH = Math.min(30, 236 / Math.max(shown.length, 1));
  if (shown.length === 0) prims.push(text(cx, 262, cw, 30, "Ningún atributo bajo el Estándar AIGS.", { color: MUTED }));
  shown.forEach((x, i) => {
    const y = 262 + i * rowH;
    prims.push(line(cx, y, AREA.r, y, AIGS.hairline));
    const shift = rowIcon(prims, cx, y, rowH, 26, iconFor(a.groups.find((g) => g.key === x.group)?.label ?? ""));
    prims.push(text(cx + shift, y, cw - 110 - shift, rowH, x.label, { size: 12, color: BODY, nowrap: true }));
    prims.push(box(AREA.r - 104, y + rowH / 2 - 4, (((x.airport ?? 1) - 1) / 4) * 62, 8, { fill: AIGS.down, radius: 2 }));
    prims.push(text(AREA.r - 40, y, 40, rowH, fmtScore2(x.airport), { size: 12, bold: true, mono: true, color: INK, align: "right" }));
  });
  if (critical.length > shown.length)
    prims.push(text(cx, 262 + shown.length * rowH, cw, 16, `Y ${critical.length - shown.length} más en la apertura general.`, { size: 11, color: MUTED }));

  asqKeyPoints(a).forEach((t, i) => {
    prims.push(box(AREA.x, 520 + i * 36 + 7, 6, 6, { fill: AIGS.blue, radius: 3 }));
    prims.push(text(AREA.x + 16, 516 + i * 36, AREA.w - 16, 34, t, { size: 13.5, color: BODY, valign: "top" }));
  });
  prims.push(note(HIST_NOTE));
  return { title: "Puntos clave", subtitle: `${full(r)} · ${a.season.label}`, prims };
}

export function asqProfileScene(r: SceneReport, a: AsqResults): Scene {
  const prims: Prim[] = [];
  const of = (k: string) => a.profile.find((p) => p.key === k);
  const y1 = AREA.y;
  const h = 258;
  const y2 = y1 + h + 12;
  const gap = 12;
  const w1 = (AREA.w - gap * 3) / 4;

  // Género: una barra 100% y las cifras.
  const gender = of("gender");
  prims.push(...card(AREA.x, y1, w1, h, "Género"));
  if (gender) {
    let cum = 0;
    const barX = AREA.x + 16;
    const barW = w1 - 32;
    const colors = [BENCH.chile, AIGS.blue, BENCH.all];
    gender.rows.filter((g) => g.pct > 0).forEach((g, i) => {
      const w = (g.pct / 100) * barW;
      prims.push(box(barX + cum, y1 + 56, Math.max(1, w - 2), 26, { fill: colors[i] ?? BENCH.all, tip: `${g.label}: ${g.pct}%` }));
      prims.push(text(AREA.x + 16, y1 + 100 + i * 52, 70, 44, `${g.pct}%`, { size: 26, bold: true, mono: true, color: INK, nowrap: true }));
      prims.push(box(AREA.x + 92, y1 + 118 + i * 52, 10, 10, { fill: colors[i] ?? BENCH.all, radius: 2 }));
      prims.push(text(AREA.x + 108, y1 + 100 + i * 52, w1 - 120, 44, g.label, { size: 13, color: BODY, nowrap: true }));
      cum += w;
    });
  }

  const reason = of("reason");
  prims.push(...card(AREA.x + w1 + gap, y1, w1, h, "Motivo del viaje"));
  if (reason) prims.push(...hbars(AREA.x + w1 + gap + 14, y1 + 44, w1 - 28, 190, reason.rows, 62));

  const age = of("age");
  prims.push(...card(AREA.x + 2 * (w1 + gap), y1, w1, h, "Edad"));
  if (age) prims.push(...columns(AREA.x + 2 * (w1 + gap) + 10, y1 + 34, w1 - 20, h - 42, age.rows));

  const nat = of("nationality");
  prims.push(...card(AREA.x + 3 * (w1 + gap), y1, w1, h, "Nacionalidad"));
  if (nat) prims.push(...hbars(AREA.x + 3 * (w1 + gap) + 14, y1 + 44, w1 - 28, 190, nat.rows, 76));

  const w2 = [380, AREA.w - 380 - 300 - 2 * gap, 300];
  const ant = of("anticipation");
  prims.push(...card(AREA.x, y2, w2[0], h, "Anticipación al vuelo (hh:mm)"));
  if (ant) prims.push(...columns(AREA.x + 10, y2 + 34, w2[0] - 20, h - 42, ant.rows));

  // Destino × aerolínea.
  const rx = AREA.x + w2[0] + gap;
  prims.push(...card(rx, y2, w2[1], h, "Destino y aerolínea (% de encuestas)"));
  const { airlines, rows } = a.routes;
  const labelW = 72;
  const colW = (w2[1] - 28 - labelW) / (airlines.length + 1);
  const rowH = Math.min(30, (h - 70) / (rows.length + 1));
  const ty = y2 + 34;
  airlines.forEach((al, j) =>
    prims.push(text(rx + 14 + labelW + j * colW, ty, colW, 22, al.label, { size: 10.5, color: MUTED, align: "center", nowrap: true }))
  );
  prims.push(text(rx + 14 + labelW + airlines.length * colW, ty, colW, 22, "Total", { size: 10.5, bold: true, color: INK, align: "center" }));
  const maxCell = Math.max(1, ...rows.flatMap((x) => x.cells));
  rows.forEach((row, i) => {
    const yy = ty + 24 + i * rowH;
    prims.push(text(rx + 14, yy, labelW, rowH, row.dest, { size: 12, color: INK, nowrap: true }));
    row.cells.forEach((c, j) => {
      const t = c / maxCell;
      prims.push(
        text(rx + 14 + labelW + j * colW + 1, yy + 1, colW - 2, rowH - 2, c > 0 ? `${fmtScore(c)}%` : "", {
          size: 11,
          align: "center",
          fill: c > 0 ? (t > 0.55 ? "3D7593" : t > 0.25 ? "9DBDCB" : "D6E3E9") : "F0F1F3",
          color: t > 0.55 ? AIGS.white : INK,
          nowrap: true,
        })
      );
    });
    prims.push(text(rx + 14 + labelW + airlines.length * colW, yy, colW, rowH, `${fmtScore(row.total)}%`, { size: 11, bold: true, color: INK, align: "center", nowrap: true }));
  });

  const trips = of("trips");
  const tx = rx + w2[1] + gap;
  prims.push(...card(tx, y2, w2[2], h, "Viajes en avión al año"));
  if (trips) prims.push(...columns(tx + 10, y2 + 34, w2[2] - 20, h - 42, trips.rows));

  return { title: "Contexto y perfil del pasajero", subtitle: `${full(r)} · ${a.season.label} · ${fmtInt(a.n)} encuestas`, prims };
}

export function asqCategoriesScene(r: SceneReport, a: AsqResults): Scene {
  const prims: Prim[] = [];
  const leftW = 620;
  prims.push(...benchLegend(r, AREA.x, AREA.y));
  const rows = [...a.categories]
    .sort((p, q) => (q.airport ?? 0) - (p.airport ?? 0))
    .map((c) => ({
      label: c.label,
      sub: c.rankChile ? `${c.rankChile}° de ${c.totalChile} en Chile` : undefined,
      icon: iconFor(c.label),
      values: [c.airport, c.chile, c.all],
    }));
  prims.push(
    ...groupedBars({ x: AREA.x, y: AREA.y + 22, w: leftW, h: 492, labelW: 232, rows, colors: [BENCH.airport, BENCH.chile, BENCH.all] })
  );

  // Radar por categoría.
  const cx = 950;
  const cy = 404;
  const R = 180;
  const min = 2;
  const cats = a.categories;
  const N = cats.length;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const d = ((Math.max(min, v) - min) / (5 - min)) * R;
    return [cx + d * Math.cos(ang), cy + d * Math.sin(ang)] as const;
  };
  const ring = (v: number, color: string, o: { width?: number; dash?: boolean } = {}) =>
    cats.map((_, i) => {
      const [x1, y1] = pt(i, v);
      const [x2, y2] = pt((i + 1) % N, v);
      return line(x1, y1, x2, y2, color, o);
    });
  [3, 4, 5].forEach((v) => prims.push(...ring(v, "E4E7EC", { width: 1 })));
  cats.forEach((c, i) => {
    const [x, y] = pt(i, 5);
    prims.push(line(cx, cy, x, y, "E4E7EC", { width: 1 }));
    const [lx, ly] = pt(i, 5.45);
    const anchor = lx < cx - 20 ? "right" : lx > cx + 20 ? "left" : "center";
    const w = 100;
    prims.push(
      text(anchor === "right" ? lx - w : anchor === "left" ? lx : lx - w / 2, ly - 15, w, 30, c.label, { size: 10.5, color: BODY, align: anchor })
    );
    const name = iconFor(c.label);
    const s = 34;
    if (name) prims.push(icon(anchor === "right" ? lx - s : anchor === "left" ? lx : lx - s / 2, ly < cy ? ly - 15 - s : ly + 15, s, name));
  });
  [3, 4, 5].forEach((v) => {
    const [x, y] = pt(0, v);
    prims.push(text(x + 3, y - 2, 20, 12, String(v), { size: 9.5, color: MUTED, nowrap: true }));
  });
  prims.push(...ring(SCORE_STANDARD, STANDARD, { width: 1.5, dash: true }));
  const series: { get: (c: (typeof cats)[number]) => number | null; color: string; width: number }[] = [
    { get: (c) => c.all, color: BENCH.all, width: 2 },
    { get: (c) => c.chile, color: BENCH.chile, width: 2 },
    { get: (c) => c.airport, color: BENCH.airport, width: 3 },
  ];
  for (const s of series) {
    cats.forEach((c, i) => {
      const v = s.get(c);
      const nx = s.get(cats[(i + 1) % N]);
      if (v == null) return;
      const [x1, y1] = pt(i, v);
      if (nx != null) {
        const [x2, y2] = pt((i + 1) % N, nx);
        prims.push(line(x1, y1, x2, y2, s.color, { width: s.width }));
      }
      prims.push({ k: "dot", cx: x1, cy: y1, r: 3, fill: s.color, tip: `${c.label}: ${fmtScore2(v)}` });
    });
  }
  prims.push(note(ASQ_NOTE));
  return { title: "Promedios y comparación con la industria", subtitle: `${full(r)} · ${a.season.label} · atributos por categoría`, prims };
}

export function asqGroupScene(r: SceneReport, a: AsqResults, index: number): Scene {
  const g = a.groups[index];
  const prims: Prim[] = [...headIcon(g.label)];
  const labelW = 244;
  const barX = AREA.x + labelW;
  const barW = 330;
  const distX = barX + barW + 70;
  const distW = AREA.r - distX;
  const top = AREA.y + 62;
  const rowH = Math.min(120, (AREA.b - 26 - top) / g.attributes.length);
  const S = (v: number) => ((v - 1) / 4) * barW;

  prims.push(panelTitle(barX, AREA.y, barW, "Promedio por subatributo"));
  prims.push(panelTitle(distX, AREA.y, distW, "Distribución de notas"));
  prims.push(
    ...legend(barX, AREA.y + 24, [
      { color: BENCH.airport, label: r.airport.code },
      { color: BENCH.chile, label: "Chile" },
      { color: "7C828A", label: "Programa" },
    ])
  );
  prims.push(
    ...legend(distX, AREA.y + 24, [
      { color: LIKERT[0], label: "1" },
      { color: LIKERT[1], label: "2" },
      { color: LIKERT[2], label: "3" },
      { color: LIKERT[3], label: "4" },
      { color: LIKERT[4], label: "5" },
    ])
  );
  const bottom = top + rowH * g.attributes.length;
  g.attributes.forEach((x, i) => {
    const y = top + i * rowH;
    const bh = Math.min(30, rowH * 0.42);
    const by = y + rowH / 2 - bh / 2 - 6;
    if (i > 0) prims.push(line(AREA.x, y, AREA.r, y, "EEF0F3"));
    prims.push(text(AREA.x, y, labelW - 12, rowH, x.label, { size: 13, color: INK }));
    prims.push(box(barX, by, Math.max(1, S(x.airport ?? 1)), bh, { fill: BENCH.airport, tip: `${x.label}: ${fmtScore2(x.airport)}` }));
    // La nota va al inicio de la barra: el final queda libre para las marcas de Chile y del programa.
    prims.push(text(barX + 8, by, 44, bh, fmtScore2(x.airport), { size: 13, bold: true, color: AIGS.white, nowrap: true }));
    if (x.chile != null) prims.push(line(barX + S(x.chile), by - 4, barX + S(x.chile), by + bh + 4, BENCH.chile, { width: 3 }));
    if (x.all != null) prims.push(line(barX + S(x.all), by - 4, barX + S(x.all), by + bh + 4, "7C828A", { width: 3 }));
    prims.push(text(barX, by + bh + 5, barW, 14, `Chile ${fmtScore2(x.chile)} · Programa ${fmtScore2(x.all)}`, { size: 10, color: MUTED, nowrap: true }));
    let cum = 0;
    x.dist.forEach((p, k) => {
      const w = (p / 100) * distW;
      if (w <= 0) return;
      prims.push(
        text(distX + cum, by, Math.max(1, w - 1.5), bh, p >= 7 ? `${p}%` : "", {
          fill: LIKERT[k],
          size: 11,
          align: "center",
          nowrap: true,
          color: k === 0 || k === 4 ? AIGS.white : INK,
          tip: `Nota ${k + 1}: ${p}%`,
        })
      );
      cum += w;
    });
    prims.push(
      text(distX, by + bh + 5, distW, 14, `${fmtInt(x.n)} respuestas${x.importance != null ? ` · ${x.importance}% lo elige entre lo más importante` : ""}`, {
        size: 10,
        color: MUTED,
        nowrap: true,
      })
    );
  });
  const sx = barX + S(SCORE_STANDARD);
  prims.push(line(sx, top, sx, bottom, STANDARD, { width: 1.5, dash: true }));
  prims.push(text(sx - 70, bottom + 2, 140, 14, STD_LABEL, { size: 10, color: "9A7F00", align: "center", nowrap: true }));
  if (g.avg != null) {
    const ax = barX + S(g.avg);
    prims.push(line(ax, top, ax, bottom, AIGS.blueActive, { width: 1.5, dash: true }));
    prims.push(text(ax - 60, top - 14, 120, 14, `Categoría ${fmtScore2(g.avg)}`, { size: 10, color: AIGS.blueActive, align: "center", nowrap: true }));
  }
  return { title: "Apertura por subatributos", subtitle: `${g.label} · ${full(r)} · ${a.season.label}`, prims };
}

export function asqGeneralScene(r: SceneReport, a: AsqResults): Scene {
  const prims: Prim[] = [];
  const [left, right] = twoColumns(a.groups, (g) => g.attributes.length + 1.4);
  const colGap = 44;
  const colW = (AREA.w - colGap) / 2;
  const maxWeight = Math.max(...[left, right].map((c) => c.reduce((s, g) => s + g.attributes.length + 1.4, 0)));
  const rowH = Math.min(26, (AREA.b - AREA.y - 4) / maxWeight);
  [left, right].forEach((col, ci) => {
    const x = AREA.x + ci * (colW + colGap);
    const labelW = colW * 0.54;
    const barX = x + labelW;
    const barW = colW - labelW - 40;
    const S = (v: number) => ((v - 1) / 4) * barW;
    let y = AREA.y;
    for (const g of col) {
      const shift = rowIcon(prims, x, y, rowH * 1.4, 34, iconFor(g.label));
      prims.push(text(x + shift, y, colW - shift, rowH * 1.3, [{ text: g.label, bold: true, color: AIGS.blue }, { text: g.avg != null ? `  · ${fmtScore2(g.avg)}` : "", color: MUTED }], { size: 13, nowrap: true }));
      y += rowH * 1.4;
      prims.push(line(barX + S(SCORE_STANDARD), y, barX + S(SCORE_STANDARD), y + g.attributes.length * rowH, STANDARD, { width: 1.5, dash: true }));
      for (const x2 of [...g.attributes].sort((p, q) => (q.airport ?? 0) - (p.airport ?? 0))) {
        prims.push(text(x, y, labelW - 8, rowH, x2.label, { size: 11.5, color: BODY, nowrap: true }));
        const v = x2.airport ?? 1;
        prims.push(box(barX, y + rowH * 0.18, Math.max(1, S(v)), rowH * 0.64, { fill: v < SCORE_STANDARD ? AIGS.down : BENCH.airport, tip: `${x2.label}: ${fmtScore2(v)}` }));
        prims.push(text(barX + S(v) + 4, y, 38, rowH, fmtScore2(v), { size: 11, bold: true, color: INK, nowrap: true }));
        y += rowH;
      }
    }
  });
  prims.push(
    ...legend(AREA.r, 672, [
      { color: BENCH.airport, label: "Sobre el estándar" },
      { color: AIGS.down, label: "Bajo el estándar" },
      { color: STANDARD, label: STD_LABEL, dash: true },
    ], { right: true })
  );
  return { title: "Apertura general", subtitle: `Atributos y subatributos · ${full(r)} · ${a.season.label} · ${fmtInt(a.n)} encuestas`, prims };
}

export function asqAirlinesScene(r: SceneReport, a: AsqResults): Scene {
  const prims: Prim[] = [];
  const [left, right] = twoColumns(a.groups, (g) => g.attributes.length + 1);
  const colGap = 36;
  const colW = (AREA.w - colGap) / 2;
  const maxRows = Math.max(...[left, right].map((c) => c.reduce((s, g) => s + g.attributes.length + 1, 0))) + 2;
  const rowH = Math.min(25, (AREA.b - AREA.y) / maxRows);
  const cols = [{ code: "", label: "Total" }, ...a.airlines.map((x) => ({ code: x.code, label: x.code }))];
  [left, right].forEach((col, ci) => {
    const x = AREA.x + ci * (colW + colGap);
    const cellW = Math.min(52, (colW * 0.42) / cols.length);
    const labelW = colW - cellW * cols.length;
    let y = AREA.y;
    cols.forEach((c, j) => {
      const count = a.airlines.find((al) => al.code === c.code)?.n ?? a.n;
      prims.push(text(x + labelW + j * cellW, y, cellW, rowH, c.label, { size: 11, bold: true, color: INK, align: "center", tip: `${fmtInt(count)} encuestas`, nowrap: true }));
    });
    y += rowH;
    if (ci === 0) {
      prims.push(text(x, y, labelW - 6, rowH, "Satisfacción general", { size: 12, bold: true, color: INK, nowrap: true }));
      cols.forEach((c, j) => {
        const v = c.code ? (a.airlines.find((al) => al.code === c.code)?.sat ?? null) : a.overall.airport;
        const h = scoreHeat(v);
        prims.push(text(x + labelW + j * cellW + 1, y + 1, cellW - 2, rowH - 2, fmtScore2(v), { fill: h.fill, color: h.ink, size: 11, align: "center", bold: true, nowrap: true }));
      });
      y += rowH;
    }
    for (const g of col) {
      const shift = rowIcon(prims, x, y, rowH, 30, iconFor(g.label));
      prims.push(text(x + shift, y, colW - shift, rowH, g.label, { size: 12, bold: true, color: AIGS.blue, nowrap: true }));
      y += rowH;
      for (const at of g.attributes) {
        prims.push(text(x, y, labelW - 6, rowH, at.label, { size: 11, color: BODY, nowrap: true }));
        cols.forEach((c, j) => {
          const v = c.code ? (at.byAirline[c.code] ?? null) : at.airport;
          const h = scoreHeat(v);
          prims.push(text(x + labelW + j * cellW + 1, y + 1, cellW - 2, rowH - 2, v != null ? fmtScore2(v) : "", { fill: h.fill, color: h.ink, size: 11, align: "center", nowrap: true }));
        });
        y += rowH;
      }
    }
  });
  const airlineNames = a.airlines.map((x) => `${x.label}: ${fmtInt(x.n)}`).join(" · ");
  prims.push(text(250, 668, AREA.r - 250, 30, `Encuestas por aerolínea: ${airlineNames}. Azul: sobre 3,50; rojo: bajo 3,50. Celda vacía: menos de 10 respuestas.`, { size: 10.5, color: MUTED, align: "right" }));
  return { title: "Apertura por aerolínea", subtitle: `Atributos y subatributos · ${full(r)} · ${a.season.label}`, prims };
}

export function asqIndicesScene(r: SceneReport, a: AsqResults): Scene {
  const prims: Prim[] = [];
  const gap = 48;
  const w = (AREA.w - gap) / 2;
  prims.push(...benchLegend(r, AREA.x, AREA.y));
  prims.push(panelTitle(AREA.x, AREA.y + 28, w, "Índices de calidad: facilidad, espera y personal"));
  prims.push(
    ...groupedBars({
      x: AREA.x,
      y: AREA.y + 58,
      w,
      h: 440,
      labelW: 170,
      rows: a.indices.map((c) => ({ label: c.label, sub: c.rankChile ? `${c.rankChile}° de ${c.totalChile} en Chile` : undefined, values: [c.airport, c.chile, c.all] })),
      colors: [BENCH.airport, BENCH.chile, BENCH.all],
    })
  );
  const x2 = AREA.x + w + gap;
  prims.push(panelTitle(x2, AREA.y + 28, w, "Estado emocional de los pasajeros"));
  prims.push(
    ...groupedBars({
      x: x2,
      y: AREA.y + 58,
      w,
      h: 440,
      labelW: 110,
      rows: a.emotions.map((c) => ({ label: c.label, values: [c.airport, c.chile, c.all] })),
      colors: [BENCH.airport, BENCH.chile, BENCH.all],
    })
  );
  prims.push(note(ASQ_NOTE));
  return { title: "Índices de calidad y estado emocional", subtitle: `${full(r)} · ${a.season.label} · nota 1–5`, prims };
}

export function asqBenchmarkScene(r: SceneReport, a: AsqResults): Scene {
  const prims: Prim[] = [];
  const rows = [...a.attributes].sort((p, q) => (q.airport ?? 0) - (q.all ?? 0) - ((p.airport ?? 0) - (p.all ?? 0)));
  const headH = 30;
  const rowH = Math.min(18, (AREA.b - AREA.y - headH) / rows.length);
  const cols = { label: 318, me: 66, val: 60, dif: 60, best: 190 };
  const xMe = AREA.x + cols.label;
  const benches = [
    { title: "Chile", get: (x: AsqAttribute) => x.chile },
    { title: "América Latina", get: (x: AsqAttribute) => x.latam },
    { title: "Programa regional", get: (x: AsqAttribute) => x.all },
  ];
  const xB = (i: number) => xMe + cols.me + i * (cols.val + cols.dif);
  const xBest = xB(3);
  const y0 = AREA.y;
  prims.push(box(AREA.x, y0, AREA.w, headH, { fill: AIGS.surfaceStrong }));
  prims.push(text(AREA.x + 8, y0, cols.label, headH, "Subatributo", { size: 11.5, bold: true, color: INK }));
  prims.push(text(xMe, y0, cols.me, headH, r.airport.code, { size: 11.5, bold: true, color: INK, align: "right" }));
  benches.forEach((b, i) =>
    prims.push(text(xB(i), y0, cols.val + cols.dif, headH, b.title, { size: 11.5, bold: true, color: INK, align: "center", nowrap: true }))
  );
  prims.push(text(xBest, y0, cols.best, headH, "Mejor de Chile", { size: 11.5, bold: true, color: INK, align: "center" }));
  prims.push(text(xBest + cols.best, y0, cols.best, headH, "Mejor del programa", { size: 11.5, bold: true, color: INK, align: "center" }));
  rows.forEach((x, i) => {
    const y = y0 + headH + i * rowH;
    if (i % 2 === 1) prims.push(box(AREA.x, y, AREA.w, rowH, { fill: PANEL }));
    prims.push(text(AREA.x + 8, y, cols.label - 8, rowH, x.label, { size: 11, color: BODY, nowrap: true }));
    prims.push(text(xMe, y, cols.me, rowH, fmtScore2(x.airport), { size: 11, bold: true, mono: true, color: INK, align: "right", nowrap: true }));
    benches.forEach((b, j) => {
      const v = b.get(x);
      const d = diffText(x.airport, v);
      prims.push(text(xB(j), y, cols.val, rowH, fmtScore2(v), { size: 11, mono: true, align: "right", nowrap: true }));
      prims.push(text(xB(j) + cols.val, y, cols.dif - 4, rowH, d.text, { size: 11, mono: true, bold: d.color !== MUTED, color: d.color, align: "right", nowrap: true }));
    });
    const bestCell = (best: AsqAttribute["bestChile"], xx: number) =>
      prims.push(
        text(xx, y, cols.best, rowH, best ? [{ text: `${fmtScore2(best.avg)} `, mono: true, color: INK }, { text: best.code, color: MUTED }] : "—", { size: 11, align: "center", nowrap: true })
      );
    bestCell(x.bestChile, xBest);
    bestCell(x.bestAll, xBest + cols.best);
  });
  prims.push(note(`Ordenado por diferencia con el programa regional. Mejor de Chile y del programa: aeropuertos con al menos 10 respuestas. ${ASQ_NOTE}`));
  return { title: "Comparación con la industria", subtitle: `${full(r)} · ${a.season.label} · ${r.airport.code} vs Chile, América Latina y programa regional`, prims };
}

const HIST_NOTE = "En 2022 cambió el formato de las preguntas: los periodos anteriores no son comparables.";

export function asqHistoryScene(r: SceneReport, a: AsqResults): Scene {
  const prims: Prim[] = [];
  // Por categoría, solo desde el formato de preguntas actual.
  const firstWith = Math.max(0, a.history.findIndex((s) => seasonRank(s.code) >= seasonRank("SU22")));
  const seasons = a.history.slice(firstWith);
  const labelW = 230;
  const cellW = Math.min(90, (AREA.w - labelW) / seasons.length);
  const rows = a.categoryHistory.map((c) => ({ ...c, airport: c.airport.slice(firstWith) }));
  const rowH = Math.min(40, (AREA.b - AREA.y - 80) / (rows.length + 1));
  const y0 = AREA.y;
  seasons.forEach((s, j) =>
    prims.push(text(AREA.x + labelW + j * cellW, y0, cellW, 28, s.code, { size: 12, bold: true, color: INK, align: "center", nowrap: true }))
  );
  const cell = (x: number, y: number, v: number | null, bold = false) => {
    const h = scoreHeat(v);
    prims.push(text(x + 1, y + 1, cellW - 2, rowH - 2, v != null ? fmtScore2(v) : "", { fill: h.fill, color: h.ink, size: 12, align: "center", bold, nowrap: true }));
  };
  rows.forEach((row, i) => {
    const y = y0 + 30 + i * rowH;
    const shift = rowIcon(prims, AREA.x, y, rowH, 36, iconFor(row.label));
    prims.push(text(AREA.x + shift, y, labelW - shift - 6, rowH, row.label, { size: 13, color: INK, nowrap: true }));
    row.airport.forEach((v, j) => cell(AREA.x + labelW + j * cellW, y, v));
  });
  const yT = y0 + 30 + rows.length * rowH;
  prims.push(text(AREA.x, yT, labelW - 10, rowH, "Promedio", { size: 13, bold: true, color: INK }));
  seasons.forEach((_, j) => {
    const vals = rows.map((row) => row.airport[j]).filter((v): v is number => v != null);
    cell(AREA.x + labelW + j * cellW, yT, vals.length ? Math.round((vals.reduce((p, q) => p + q, 0) / vals.length) * 100) / 100 : null, true);
  });
  const yN = yT + rowH + 2;
  prims.push(text(AREA.x, yN, labelW - 10, 22, "Muestras", { size: 11, color: MUTED }));
  seasons.forEach((s, j) =>
    prims.push(text(AREA.x + labelW + j * cellW, yN, cellW, 22, s.n > 0 ? fmtInt(s.n) : "sin encuestas", { size: s.n > 0 ? 11 : 9.5, color: MUTED, align: "center", nowrap: true }))
  );
  const focus = seasons.findIndex((s) => s.code === a.season.code);
  if (focus >= 0) prims.push(box(AREA.x + labelW + focus * cellW, y0, cellW, 30 + (rows.length + 1) * rowH + 24, { stroke: INK, strokeW: 1.5, radius: 4 }));
  prims.push(note(`Azul: sobre 3,50; rojo: bajo 3,50. Recuadro: temporada del informe. ${HIST_NOTE}`));
  return { title: "Resultados históricos", subtitle: `${full(r)} · promedio por categoría y temporada`, prims };
}

const seasonRank = (code: string) => Number(code.slice(2)) * 2 + (code.startsWith("WI") ? 1 : 0);

export function asqHistoryBenchScene(r: SceneReport, a: AsqResults): Scene {
  const prims: Prim[] = [];
  // Desde 2022, cuando el formato de preguntas es comparable.
  const from = a.history.findIndex((s) => seasonRank(s.code) >= seasonRank("SU22"));
  const start = Math.max(from, 0);
  const labels = a.history.slice(start).map((s) => s.code);
  prims.push(...benchLegend(r, AREA.x, AREA.y - 2));
  const cols = 3;
  const gapX = 24;
  const gapY = 6;
  const rows = Math.ceil(a.categoryHistory.length / cols);
  const pw = (AREA.w - gapX * (cols - 1)) / cols;
  const ph = (AREA.b - AREA.y - 18 - gapY * (rows - 1)) / rows;
  const values = a.categoryHistory.flatMap((c) => [...c.airport, ...c.chile, ...c.all].slice(0)).filter((v): v is number => v != null);
  const min = Math.min(2.5, Math.floor(Math.min(...values, 5) * 2) / 2);
  a.categoryHistory.forEach((c, i) => {
    const x = AREA.x + (i % cols) * (pw + gapX);
    const y = AREA.y + 18 + Math.floor(i / cols) * (ph + gapY);
    const shift = rowIcon(prims, x, y, 30, 30, iconFor(c.label));
    prims.push(text(x + shift, y, pw - shift, 30, c.label, { size: 12.5, bold: true, color: INK, nowrap: true }));
    const last = c.airport.slice(start).reduce<number>((acc, v, k) => (v != null ? k : acc), -1);
    prims.push(
      ...lineChart({
        x,
        y: y + 28,
        w: pw,
        h: ph - 28,
        labels,
        min,
        max: 5,
        ticks: [3, 4, 5].filter((t) => t > min),
        fmtTick: (v) => String(v),
        standard: { value: SCORE_STANDARD },
        every: labels.length > 7 ? 2 : 1,
        series: [
          { values: c.all.slice(start), color: BENCH.all },
          { values: c.chile.slice(start), color: BENCH.chile },
          { values: c.airport.slice(start), color: BENCH.airport, width: 2.5, labelAt: last >= 0 ? [last] : [], fmt: (v) => fmtScore2(v) },
        ],
      })
    );
  });
  prims.push(note(`Línea punteada: Estándar AIGS 3,50. Desde SU22, formato comparable. ${ASQ_NOTE}`));
  return { title: "Resultados históricos vs la industria", subtitle: `${full(r)} · promedio por categoría, misma escala en todos los gráficos`, prims };
}

// ---------------------------------------------------------------------------
// Mediciones de tiempos
// ---------------------------------------------------------------------------

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAYS_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MIN_CELL_N = 3;

export function tiemposHotspotScene(r: SceneReport, index: number): Scene {
  const h = r.seasonal!.tiemposHot[index];
  const d = h.data;
  const prims: Prim[] = [...headIcon(h.label)];
  const isQueue = !h.label.startsWith("Retiro");

  // Mapa día × hora.
  const hoursWith = d.hours.map((x) => x.hour);
  const minH = Math.min(...hoursWith);
  const maxH = Math.max(...hoursWith);
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
  const labelW = 34;
  const cellW = 58;
  const totalW = 52;
  const x0 = AREA.x;
  prims.push(panelTitle(x0, AREA.y - 4, 460, isQueue ? "Espera promedio en fila (minutos)" : "Promedio del tramo (minutos)", { size: 13 }));
  const yHead = AREA.y + 20;
  const rowH = Math.min(25, (AREA.b - yHead - 66) / (hours.length + 1));
  const robust = d.cells.filter((c) => c.n >= MIN_CELL_N);
  const scaleMax = Math.max(1, ...(robust.length ? robust : d.cells).map((c) => c.prom));
  const fmt = (v: number) => (scaleMax < 10 ? fmtScore(v) : String(Math.round(v)));
  DAYS.forEach((dn, j) =>
    prims.push(text(x0 + labelW + j * cellW, yHead, cellW, 20, dn, { size: 11, bold: true, color: INK, align: "center" }))
  );
  prims.push(text(x0 + labelW + 7 * cellW, yHead, totalW, 20, "Total", { size: 11, bold: true, color: INK, align: "center" }));
  const yGrid = yHead + 21;
  hours.forEach((hr, i) => {
    const y = yGrid + i * rowH;
    prims.push(text(x0, y, labelW - 5, rowH, String(hr), { size: 11, color: MUTED, align: "right" }));
    DAYS.forEach((_, j) => {
      const c = d.cells.find((x) => x.dow === j && x.hour === hr);
      const cx = x0 + labelW + j * cellW;
      if (!c) {
        prims.push(box(cx + 1, y + 1, cellW - 2, rowH - 2, { fill: "F4F5F7" }));
        return;
      }
      const low = c.n < MIN_CELL_N;
      const heat = low ? { fill: "F4F5F7", ink: MUTED } : timeHeat(c.prom, scaleMax);
      const over = h.meta != null && c.prom > h.meta;
      prims.push(
        text(cx + 1, y + 1, cellW - 2, rowH - 2, fmt(c.prom), {
          fill: heat.fill,
          color: heat.ink,
          size: 11,
          align: "center",
          italic: low,
          bold: over && !low,
          stroke: over && !low ? INK : undefined,
          strokeW: 1.5,
          nowrap: true,
          tip: `${DAYS_LONG[j]} ${hr}:00 · ${fmtMMSS(c.prom)} · ${fmtInt(c.n)} mediciones`,
        })
      );
    });
    const tot = d.hours.find((x) => x.hour === hr);
    prims.push(text(x0 + labelW + 7 * cellW, y, totalW, rowH, tot ? fmt(tot.prom) : "", { size: 11, bold: true, color: INK, align: "center", nowrap: true }));
  });
  const yTot = yGrid + hours.length * rowH;
  prims.push(text(x0 - 6, yTot, labelW + 2, rowH, "Total", { size: 10.5, bold: true, color: INK, align: "right" }));
  DAYS.forEach((_, j) => {
    const tot = d.days.find((x) => x.dow === j);
    prims.push(text(x0 + labelW + j * cellW, yTot, cellW, rowH, tot ? fmt(tot.prom) : "", { size: 11, bold: true, color: INK, align: "center", nowrap: true }));
  });
  prims.push(text(x0 + labelW + 7 * cellW, yTot, totalW, rowH, fmt(d.total!.prom), { size: 11, bold: true, color: INK, align: "center", nowrap: true }));

  // Leyenda del mapa.
  const yLeg = yTot + rowH + 6;
  prims.push(text(x0, yLeg, 78, 16, "Menos minutos", { size: 10, color: MUTED, nowrap: true }));
  [0.1, 0.3, 0.5, 0.7, 0.9].forEach((t, i) => prims.push(box(x0 + 80 + i * 22, yLeg + 2, 20, 12, { fill: timeHeat(t, 1).fill })));
  prims.push(text(x0 + 194, yLeg, 80, 16, `Más (${fmt(scaleMax)} min)`, { size: 10, color: MUTED, nowrap: true }));
  prims.push(
    text(x0, yLeg + 16, 500, 30, `${h.meta != null ? "Borde negro: sobre el Estándar IATA. " : ""}Gris en cursiva: menos de ${MIN_CELL_N} mediciones (referencial). Hora de inicio de la medición, hora de Chile.`, { size: 10, color: MUTED, valign: "top" })
  );

  // Columna derecha: indicadores, distribución y resumen por aerolínea.
  const rx = x0 + labelW + 7 * cellW + totalW + 26;
  const rw = AREA.r - rx;
  const kw = (rw - 16) / 3;
  const kpis: [string, string, string?][] = [
    ["Promedio", fmtMMSS(d.total!.prom), h.meta != null ? `Estándar ${fmtMMSS(h.meta)}` : "Sin estándar"],
    ["Percentil 90", fmtMMSS(d.total!.p90)],
    ["Mediciones", fmtInt(d.total!.n)],
  ];
  kpis.forEach(([lb, v, sub], i) => {
    const color = i === 0 && h.meta != null ? (d.total!.prom > h.meta ? AIGS.down : AIGS.up) : AIGS.blue;
    prims.push(...kpiTile(rx + i * (kw + 8), AREA.y - 4, kw, 84, lb, v, sub, color));
  });

  // Histograma por minuto (la cola se agrupa en la última barra).
  const hy = AREA.y + 90;
  const hh = 190;
  prims.push(panelTitle(rx, hy, rw, isQueue ? "Mediciones por minutos de espera" : "Mediciones por minutos", { size: 13 }));
  const lastBin = Math.max(0, ...d.bins.map((b) => b.min));
  const cut = Math.min(lastBin, Math.max(Math.ceil(d.total!.p90 * 1.6), h.meta != null ? Math.ceil(h.meta * 1.2) : 0, 10));
  const counts = Array.from({ length: cut + 1 }, (_, m) =>
    d.bins.filter((b) => (m === cut ? b.min >= cut : b.min === m)).reduce((a, b) => a + b.n, 0)
  );
  const plotY = hy + 38;
  const plotH = hh - 58;
  const maxC = Math.max(1, ...counts);
  const bw = rw / (cut + 1);
  const tail = lastBin > cut;
  counts.forEach((c, m) => {
    const bh = (c / maxC) * plotH;
    if (c > 0)
      prims.push(box(rx + m * bw + 0.5, plotY + plotH - bh, Math.max(1, bw - 1.5), bh, { fill: AIGS.blue, tip: `${m === cut && tail ? `${m}+` : m} min: ${fmtInt(c)} mediciones` }));
    if (c === maxC)
      prims.push(text(rx + m * bw + bw / 2 - 25, plotY + plotH - bh - 15, 50, 14, fmtInt(c), { size: 10.5, bold: true, color: INK, align: "center", nowrap: true }));
  });
  prims.push(line(rx, plotY + plotH, rx + rw, plotY + plotH, AIGS.hairline));
  const step = cut > 50 ? 10 : cut > 20 ? 5 : 2;
  for (let m = 0; m < (tail ? cut - step / 2 : cut + 1); m += step)
    prims.push(text(rx + m * bw + bw / 2 - 15, plotY + plotH + 2, 30, 14, String(m), { size: 10, color: MUTED, align: "center", nowrap: true }));
  if (tail)
    prims.push(text(rx + cut * bw + bw / 2 - 20, plotY + plotH + 2, 40, 14, `${cut}+`, { size: 10, color: MUTED, align: "center", nowrap: true }));
  if (h.meta != null && h.meta <= cut) {
    const mx = rx + h.meta * bw;
    prims.push(line(mx, plotY - 2, mx, plotY + plotH, STANDARD, { width: 1.5, dash: true }));
    prims.push(text(mx - 110, plotY - 16, 106, 14, `Estándar IATA ${h.meta}`, { size: 10, color: "9A7F00", align: "right", nowrap: true }));
  }

  // Tabla resumen: por aerolínea o, en procesos sin aerolínea, por día de la semana.
  const ty = hy + hh + 2;
  const rowsA = d.airlines.slice(0, 6);
  const tRow = 22;
  const hasAirlines = rowsA.length > 0;
  const summary = hasAirlines
    ? rowsA.map((a) => ({ label: a.airline, n: a.n, prom: a.prom, p90: a.p90 as number | null }))
    : [...d.days].sort((p, q) => p.dow - q.dow).map((x) => ({ label: DAYS_LONG[x.dow][0].toUpperCase() + DAYS_LONG[x.dow].slice(1), n: x.n, prom: x.prom, p90: null as number | null }));
  const heads = hasAirlines ? ["Muestras", "Promedio", "Percentil 90"] : ["Muestras", "Promedio"];
  const colA = rw - heads.length * 72;
  const cell = (x: number, y: number, w: number, t: string, o: BoxOpts = {}) => text(x, y, w, tRow, t, { size: 11.5, nowrap: true, ...o });
  prims.push(box(rx, ty, rw, tRow, { fill: AIGS.surfaceStrong }));
  prims.push(cell(rx + 6, ty, colA, hasAirlines ? "Aerolínea" : "Día", { bold: true, color: INK }));
  heads.forEach((t, i) => prims.push(cell(rx + colA + i * 72, ty, 72, t, { bold: true, color: INK, align: "right", size: 10.5 })));
  summary.forEach((a, i) => {
    const y = ty + tRow * (i + 1);
    prims.push(cell(rx + 6, y, colA - 6, a.label));
    prims.push(cell(rx + colA, y, 72, fmtInt(a.n), { align: "right", mono: true }));
    prims.push(cell(rx + colA + 72, y, 72, fmtMMSS(a.prom), { align: "right", mono: true, color: INK, bold: true }));
    if (hasAirlines) prims.push(cell(rx + colA + 144, y, 72, fmtMMSS(a.p90), { align: "right", mono: true }));
    prims.push(line(rx, y + tRow, rx + rw, y + tRow, "EEF0F3"));
  });
  const yAfter = ty + tRow * (summary.length + 1) + 8;
  const top = hotspotTop(d.cells);
  if (top.length > 0 && yAfter + 40 <= AREA.b + 6)
    prims.push(
      text(rx, yAfter, rw, 40, [
        { text: "Mayores tiempos: ", bold: true, color: INK },
        { text: top.map((c) => `${DAYS_LONG[c.dow]} ${c.hour}:00 (${fmtMMSS(c.prom)}, n=${fmtInt(c.n)})`).join(" · ") },
      ], { size: 11.5, valign: "top" })
    );

  return { title: "Resultados por proceso", subtitle: `${h.label} · ${full(r)} · ${r.seasonal!.focusLabel}`, prims };
}

export function tiemposHistoryScene(r: SceneReport): Scene {
  const t = r.seasonal!.tiemposHistory;
  const prims: Prim[] = [];
  const cols = t.series.length > 6 ? 4 : t.series.length > 4 ? 3 : 2;
  const rows = Math.ceil(t.series.length / cols);
  const gapX = 22;
  const gapY = 14;
  const pw = (AREA.w - gapX * (cols - 1)) / cols;
  const ph = (AREA.b - AREA.y - gapY * (rows - 1)) / rows;
  const labels = t.seasons.map((s) => s.code);
  const focus = labels.indexOf(r.seasonal!.focusCode);
  t.series.forEach((s, i) => {
    const x = AREA.x + (i % cols) * (pw + gapX);
    const y = AREA.y + Math.floor(i / cols) * (ph + gapY);
    const shift = rowIcon(prims, x, y, 34, 34, iconFor(s.label));
    prims.push(text(x + shift, y, pw - shift, 34, s.label, { size: 12.5, bold: true, color: INK, nowrap: true }));
    const axis = timeAxis(s.values, s.meta);
    const ticks = axis.ticks.length > 4 ? axis.ticks.filter((_, k) => k % 2 === 0) : axis.ticks;
    const idx = s.values.map((v, k) => (v != null ? k : -1)).filter((k) => k >= 0);
    const peak = idx.reduce((m, k) => ((s.values[k] ?? 0) > (s.values[m] ?? 0) ? k : m), idx[0] ?? 0);
    const labelAt = [...new Set([peak, focus >= 0 ? focus : idx[idx.length - 1] ?? 0])];
    prims.push(
      ...lineChart({
        x,
        y: y + 36,
        w: pw,
        h: ph - 36,
        labels,
        min: 0,
        max: axis.max,
        ticks,
        fmtTick: (v) => String(v).replace(".", ","),
        standard: s.meta != null ? { value: s.meta } : undefined,
        every: Math.max(1, Math.ceil(labels.length / 4)),
        focusIndex: focus,
        series: [{ values: s.values, color: AIGS.blue, labelAt, fmt: (v) => fmtMMSS(v) }],
      })
    );
  });
  prims.push(note("Minutos (cada proceso con su propia escala). Línea punteada: Estándar IATA. Banda gris: temporada del informe. Temporadas sin mediciones no aparecen."));
  return { title: "Evolutivo de tiempos por temporada", subtitle: `${full(r)} · promedio por temporada hasta ${r.seasonal!.focusLabel}`, prims };
}

// ---------------------------------------------------------------------------
// Encuestas AGA
// ---------------------------------------------------------------------------

export function agaSeasonScene(r: SceneReport, index: number): Scene {
  const s = r.aga[index];
  const m = s.month;
  const title = `Encuestas Complementarias · ${s.audience}`;
  const subtitle = `${full(r)} · ${r.seasonal!.focusLabel}`;
  const prims: Prim[] = [];
  if (m.n === 0) {
    prims.push(text(AREA.x, 340, AREA.w, 40, "Sin encuestas en esta temporada.", { size: 18, color: MUTED, align: "center" }));
    return { title, subtitle, prims };
  }
  const gap = 14;
  const tw = (AREA.w - 2 * gap) / 3;
  prims.push(...kpiTile(AREA.x, AREA.y, tw, 84, "Nota promedio", `${fmtScore(m.ratingAvg)} / 5`, "todas las notas de atributos y servicios", scoreColor(m.ratingAvg)));
  prims.push(...kpiTile(AREA.x + tw + gap, AREA.y, tw, 84, "Notas 4–5", m.ratingTop2 != null ? `${m.ratingTop2}%` : "—", "% de notas 4 o 5"));
  prims.push(...kpiTile(AREA.x + 2 * (tw + gap), AREA.y, tw, 84, "Encuestas", fmtInt(m.n), r.seasonal!.focusLabel, INK));

  const cats = agaCategories(m);
  const yTop = AREA.y + 124;
  const rowH = Math.min(30, (AREA.b - yTop) / Math.max(cats.length, 1));
  const labelW = 262;
  const noteW = 52;
  const reachW = 62;
  const barX = AREA.x + labelW + noteW + 16;
  const barW = AREA.r - reachW - barX - 16;
  const neg = (d: number[]) => d[0] + d[1] + d[2] / 2;
  const pos = (d: number[]) => d[2] / 2 + d[3] + d[4];
  const maxNeg = Math.max(1, ...cats.map((c) => neg(c.dist)));
  const maxPos = Math.max(1, ...cats.map((c) => pos(c.dist)));
  const scale = (barW - 80) / (maxNeg + maxPos);
  const zero = barX + 40 + maxNeg * scale;

  const yHead = AREA.y + 96;
  prims.push(text(AREA.x, yHead, labelW, 22, "Categoría", { size: 11, bold: true, color: INK }));
  prims.push(text(AREA.x + labelW, yHead, noteW, 22, "Nota", { size: 11, bold: true, color: INK, align: "right" }));
  prims.push(text(AREA.r - reachW, yHead, reachW, 22, "Evalúan", { size: 11, bold: true, color: INK, align: "right" }));
  prims.push(
    ...legend(barX, yHead + 3, [
      { color: LIKERT[0], label: "Nota 1" },
      { color: LIKERT[1], label: "Nota 2" },
      { color: LIKERT[2], label: "Nota 3" },
      { color: LIKERT[3], label: "Nota 4" },
      { color: LIKERT[4], label: "Nota 5" },
    ], { size: 10.5 })
  );
  cats.forEach((c, i) => {
    const y = yTop + i * rowH;
    const bh = Math.min(18, rowH * 0.62);
    const by = y + rowH / 2 - bh / 2;
    const shift = rowIcon(prims, AREA.x, y, rowH, 28, agaIcon(c.label));
    prims.push(text(AREA.x + shift, y, labelW - shift - 8, rowH, c.label, { size: 12.5, color: INK, nowrap: true }));
    prims.push({ k: "dot", cx: AREA.x + labelW + 8, cy: y + rowH / 2, r: 4, fill: scoreColor(c.avg) });
    prims.push(text(AREA.x + labelW, y, noteW, rowH, fmtScore2(c.avg), { size: 12.5, bold: true, mono: true, color: INK, align: "right", nowrap: true }));
    let cx = zero - neg(c.dist) * scale;
    c.dist.forEach((p, k) => {
      const w = p * scale;
      if (w <= 0) return;
      prims.push(box(cx, by, Math.max(0.5, w - 1), bh, { fill: LIKERT[k], tip: `${c.label} · nota ${k + 1}: ${Math.round(p)}%` }));
      cx += w;
    });
    const low = Math.round(c.dist[0] + c.dist[1]);
    const high = Math.round(c.dist[3] + c.dist[4]);
    if (low > 0) prims.push(text(zero - neg(c.dist) * scale - 38, by - 2, 34, bh + 4, `${low}%`, { size: 10.5, color: BODY, align: "right", nowrap: true }));
    prims.push(text(zero + pos(c.dist) * scale + 4, by - 2, 38, bh + 4, `${high}%`, { size: 10.5, bold: true, color: INK, nowrap: true }));
    prims.push(text(AREA.r - reachW, y, reachW, rowH, `${c.reach}%`, { size: 11.5, mono: true, align: "right", nowrap: true }));
  });
  prims.push(line(zero, yTop - 2, zero, yTop + cats.length * rowH + 2, AIGS.muted, { width: 1 }));
  prims.push(note("Barras centradas en la nota 3: a la izquierda notas bajas (% de 1–2), a la derecha notas altas (% de 4–5). Evalúan: % de encuestas que califica la categoría. N/A no se considera."));
  return { title, subtitle, prims };
}

export function agaEvolutionScene(r: SceneReport, index: number): Scene {
  const s = r.aga[index];
  const h = r.seasonal!.agaHistory[index];
  const prims: Prim[] = [];
  const focus = h.seasons.findIndex((x) => x.code === r.seasonal!.focusCode);
  const months = h.months;
  const leftW = months.length > 1 ? 720 : AREA.w;
  const values = h.seasons.map((x) => x.ratingAvg);
  const nums = [...values, ...months.map((x) => x.ratingAvg)].filter((v): v is number => v != null);
  const min = Math.min(3, Math.floor(Math.min(...nums, 5) * 2) / 2);
  const ticks = [3, 4, 5].filter((t) => t >= min);
  prims.push(panelTitle(AREA.x, AREA.y - 4, leftW, "Nota promedio por temporada", { size: 13 }));
  prims.push(
    ...lineChart({
      x: AREA.x,
      y: AREA.y + 16,
      w: leftW,
      h: 136,
      labels: h.seasons.map((x) => x.code),
      min,
      max: 5,
      ticks,
      fmtTick: (v) => String(v),
      standard: { value: SCORE_STANDARD },
      focusIndex: focus,
      series: [{ values, color: AIGS.blue, labelAt: values.map((_, i) => i), fmt: (v) => fmtScore(v) }],
    })
  );
  if (months.length > 1) {
    const x2 = AREA.x + leftW + 30;
    const mv = months.map((x) => x.ratingAvg);
    prims.push(panelTitle(x2, AREA.y - 4, AREA.r - x2, "Por mes", { size: 13 }));
    prims.push(
      ...lineChart({
        x: x2,
        y: AREA.y + 16,
        w: AREA.r - x2,
        h: 136,
        labels: months.map((x) => x.label.split(" ")[0]),
        min,
        max: 5,
        ticks,
        fmtTick: (v) => String(v),
        standard: { value: SCORE_STANDARD },
        every: months.length > 8 ? 2 : 1,
        series: [{ values: mv, color: AIGS.blue, labelAt: mv.map((_, i) => i), fmt: (v) => fmtScore(v) }],
      })
    );
  }

  // Mapa categoría × temporada.
  const labelW = 262;
  const n = Math.max(h.seasons.length, 1);
  const cellW = Math.min(90, (AREA.w - labelW) / n);
  const yHead = AREA.y + 160;
  const rowH = Math.min(25, (AREA.b - yHead - 44) / Math.max(h.categories.length, 1));
  h.seasons.forEach((x, j) =>
    prims.push(text(AREA.x + labelW + j * cellW, yHead, cellW, 20, x.code, { size: 11, bold: true, color: INK, align: "center", nowrap: true }))
  );
  h.categories.forEach((c, i) => {
    const y = yHead + 21 + i * rowH;
    const shift = rowIcon(prims, AREA.x, y, rowH, 26, agaIcon(c.label));
    prims.push(text(AREA.x + shift, y, labelW - shift - 8, rowH, c.label, { size: 12, color: INK, nowrap: true }));
    c.values.forEach((v, j) => {
      const heat = scoreHeat(v);
      prims.push(
        text(AREA.x + labelW + j * cellW + 1, y + 1, cellW - 2, rowH - 2, v != null ? fmtScore2(v) : "", { fill: heat.fill, color: heat.ink, size: 11, align: "center", nowrap: true, tip: `${c.label} · ${h.seasons[j].code}` })
      );
    });
  });
  const yN = yHead + 21 + h.categories.length * rowH + 2;
  prims.push(text(AREA.x, yN, labelW - 8, 18, "Encuestas", { size: 11, color: MUTED }));
  h.seasons.forEach((x, j) =>
    prims.push(text(AREA.x + labelW + j * cellW, yN, cellW, 18, fmtInt(x.n), { size: 11, color: MUTED, align: "center", nowrap: true }))
  );
  if (focus >= 0) prims.push(box(AREA.x + labelW + focus * cellW, yHead, cellW, 21 + h.categories.length * rowH + 22, { stroke: INK, strokeW: 1.5, radius: 4 }));
  prims.push(note("Azul: sobre 3,50; rojo: bajo 3,50. Línea punteada: Estándar AIGS. Hasta septiembre de 2026, formulario antiguo (Google Forms); desde octubre de 2026, formulario web."));
  return { title: `Encuestas Complementarias · ${s.audience} · resultados históricos`, subtitle: `${full(r)} · nota por categoría y temporada hasta ${r.seasonal!.focusLabel}`, prims };
}

export function agaMapScene(r: SceneReport, index: number): Scene {
  const s = r.aga[index];
  const prims: Prim[] = [];
  const cats = agaCategories(s.month).filter((c) => c.avg != null);
  const W = 650;
  const box0 = { x: AREA.x + 40, y: AREA.y + 4, w: W - 40, h: AREA.b - AREA.y - 44 };
  const reaches = cats.map((c) => c.reach).sort((a, b) => a - b);
  const mid = reaches.length ? reaches[Math.floor(reaches.length / 2)] : 50;
  const avgAll = s.month.ratingAvg ?? SCORE_STANDARD;
  const scores = cats.map((c) => c.avg!);
  const yMin = Math.floor((Math.min(...scores, avgAll, SCORE_STANDARD) - 0.1) * 5) / 5;
  const yMax = Math.ceil((Math.max(...scores, avgAll) + 0.1) * 5) / 5;
  const X = (v: number) => box0.x + (v / 100) * box0.w;
  const Y = (v: number) => box0.y + (1 - (v - yMin) / (yMax - yMin)) * box0.h;
  prims.push(box(X(mid), Y(avgAll), box0.x + box0.w - X(mid), box0.y + box0.h - Y(avgAll), { fill: "FBECEB" }));
  prims.push(box(X(mid), box0.y, box0.x + box0.w - X(mid), Y(avgAll) - box0.y, { fill: "E7F6EF" }));
  prims.push(line(box0.x, box0.y + box0.h, box0.x + box0.w, box0.y + box0.h, AIGS.hairline));
  prims.push(line(box0.x, box0.y, box0.x, box0.y + box0.h, AIGS.hairline));
  prims.push(line(X(mid), box0.y, X(mid), box0.y + box0.h, MUTED, { dash: true, width: 1 }));
  prims.push(line(box0.x, Y(avgAll), box0.x + box0.w, Y(avgAll), MUTED, { dash: true, width: 1 }));
  if (SCORE_STANDARD > yMin && SCORE_STANDARD < yMax) {
    prims.push(line(box0.x, Y(SCORE_STANDARD), box0.x + box0.w, Y(SCORE_STANDARD), STANDARD, { dash: true, width: 1.5 }));
    prims.push(text(box0.x + 4, Y(SCORE_STANDARD) + 1, 150, 14, STD_LABEL, { size: 10, color: "9A7F00", nowrap: true }));
  }
  prims.push(text(box0.x + box0.w - 200, box0.y + 4, 196, 16, "Fortalezas con alto alcance", { size: 11.5, bold: true, color: AIGS.up, align: "right", nowrap: true }));
  prims.push(text(box0.x + box0.w - 200, box0.y + box0.h - 20, 196, 16, "Prioridad de mejora", { size: 11.5, bold: true, color: AIGS.down, align: "right", nowrap: true }));
  for (const v of [0, 25, 50, 75, 100])
    prims.push(text(X(v) - 20, box0.y + box0.h + 3, 40, 14, `${v}%`, { size: 10, color: MUTED, align: "center", nowrap: true }));
  prims.push(text(box0.x, box0.y + box0.h + 17, box0.w, 16, "Alcance (% de encuestas que califica la categoría)", { size: 10.5, color: MUTED, align: "center" }));
  for (let v = yMin; v <= yMax + 1e-6; v += 0.2 * Math.max(1, Math.round((yMax - yMin) / 1.2)))
    prims.push(text(AREA.x, Y(v) - 8, 36, 16, fmtScore(v), { size: 10, color: MUTED, align: "right", nowrap: true }));
  const color = (c: (typeof cats)[number]) =>
    c.reach > mid ? (c.avg! >= avgAll ? AIGS.up : AIGS.down) : c.avg! >= avgAll ? "3D7593" : "7C828A";
  cats.forEach((c, i) => {
    const R = 10;
    prims.push(
      text(X(c.reach) - R, Y(c.avg!) - R, R * 2, R * 2, String(i + 1), { fill: color(c), radius: R, size: 10.5, bold: true, color: AIGS.white, align: "center", nowrap: true, tip: `${c.label}: ${fmtScore2(c.avg)} · alcance ${c.reach}%` })
    );
  });

  // Lista numerada + ítems más bajos.
  const lx = AREA.x + W + 28;
  const lw = AREA.r - lx;
  const worst = cats
    .flatMap((c) => c.items.filter((it) => it.avg != null && it.n >= 10).map((it) => ({ ...it, cat: c.label })))
    .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))
    .slice(0, 5);
  const listRows = cats.length + (worst.length ? worst.length + 1.6 : 0) + 1;
  const rowH = Math.min(25, (AREA.b - AREA.y) / listRows);
  prims.push(text(lx, AREA.y, lw - 110, rowH, "Categoría", { size: 11, bold: true, color: INK }));
  prims.push(text(AREA.r - 110, AREA.y, 56, rowH, "Nota", { size: 11, bold: true, color: INK, align: "right" }));
  prims.push(text(AREA.r - 54, AREA.y, 54, rowH, "Alcance", { size: 11, bold: true, color: INK, align: "right" }));
  cats.forEach((c, i) => {
    const y = AREA.y + (i + 1) * rowH;
    prims.push(line(lx, y, AREA.r, y, "EEF0F3"));
    const shift = rowIcon(prims, lx, y, rowH, 24, agaIcon(c.label));
    prims.push(text(lx + shift, y, lw - 110 - shift, rowH, [{ text: `${i + 1}. `, bold: true, color: color(c) }, { text: c.label }], { size: 11.5, nowrap: true }));
    prims.push(text(AREA.r - 110, y, 56, rowH, fmtScore2(c.avg), { size: 11.5, bold: true, mono: true, color: INK, align: "right", nowrap: true }));
    prims.push(text(AREA.r - 54, y, 54, rowH, `${c.reach}%`, { size: 11.5, mono: true, align: "right", nowrap: true }));
  });
  if (worst.length) {
    const y0 = AREA.y + (cats.length + 1) * rowH + rowH * 0.3;
    prims.push(text(lx, y0, lw, rowH * 1.2, "Ítems con menor nota", { size: 12.5, bold: true, color: AIGS.down, nowrap: true }));
    worst.forEach((it, i) => {
      const y = y0 + rowH * 1.3 + i * rowH;
      prims.push(text(lx, y, lw - 50, rowH, [{ text: it.label }, { text: ` · ${it.cat}`, color: MUTED }], { size: 11, nowrap: true }));
      prims.push(text(AREA.r - 50, y, 50, rowH, fmtScore2(it.avg), { size: 11.5, bold: true, mono: true, color: INK, align: "right", nowrap: true }));
    });
  }
  prims.push(note("Líneas: mediana de alcance y nota promedio de la encuesta. Ítems con al menos 10 respuestas."));
  return { title: `Encuestas Complementarias · ${s.audience} · nota vs alcance`, subtitle: `${full(r)} · ${r.seasonal!.focusLabel} · dónde una mejora llega a más personas`, prims };
}

export function agaCompareScene(r: SceneReport): Scene {
  const prims: Prim[] = [];
  const pax = r.aga.find((a) => a.audience === "Pasajeros");
  const aco = r.aga.find((a) => a.audience === "Acompañantes");
  const a = pax ? agaCategories(pax.month) : [];
  const b = aco ? agaCategories(aco.month) : [];
  const rows = a
    .map((x) => ({ label: x.label, p: x.avg, q: b.find((y) => y.label === x.label)?.avg ?? null }))
    .filter((x): x is { label: string; p: number; q: number } => x.p != null && x.q != null)
    .sort((x, y) => Math.abs(y.p - y.q) - Math.abs(x.p - x.q));
  const nums = rows.flatMap((x) => [x.p, x.q]);
  const min = Math.min(3, Math.floor(Math.min(...nums, 5) * 2) / 2);
  const labelW = 300;
  const px = AREA.x + labelW;
  const pw = AREA.w - labelW - 110;
  const S = (v: number) => px + ((v - min) / (5 - min)) * pw;
  const top = AREA.y + 34;
  const rowH = Math.min(48, (AREA.b - top - 24) / Math.max(rows.length, 1));
  prims.push(
    ...legend(px, AREA.y, [
      { color: BENCH.airport, label: `Pasajeros (${fmtInt(pax?.month.n ?? 0)} encuestas)` },
      { color: BENCH.chile, label: `Acompañantes (${fmtInt(aco?.month.n ?? 0)} encuestas)` },
    ])
  );
  prims.push(text(AREA.r - 100, AREA.y, 100, 18, "Diferencia", { size: 11, bold: true, color: INK, align: "right" }));
  const ticks: number[] = [];
  for (let v = min; v <= 5; v += 0.5) ticks.push(v);
  for (const v of ticks) {
    prims.push(line(S(v), top, S(v), top + rows.length * rowH, "EEF2F6", { width: 1 }));
    prims.push(text(S(v) - 20, top + rows.length * rowH + 2, 40, 14, fmtScore(v), { size: 10, color: MUTED, align: "center", nowrap: true }));
  }
  rows.forEach((x, i) => {
    const y = top + i * rowH + rowH / 2;
    const shift = rowIcon(prims, AREA.x, y - rowH / 2, rowH, 42, agaIcon(x.label));
    prims.push(text(AREA.x + shift, y - rowH / 2, labelW - shift - 12, rowH, x.label, { size: 13, color: INK, nowrap: true }));
    prims.push(line(S(x.p), y, S(x.q), y, "A9B2BF", { width: 3 }));
    prims.push({ k: "dot", cx: S(x.q), cy: y, r: 8, fill: BENCH.chile, stroke: AIGS.white, tip: `Acompañantes: ${fmtScore2(x.q)}` });
    prims.push({ k: "dot", cx: S(x.p), cy: y, r: 8, fill: BENCH.airport, stroke: AIGS.white, tip: `Pasajeros: ${fmtScore2(x.p)}` });
    const pLeft = x.p <= x.q;
    prims.push(text(S(x.p) + (pLeft ? -50 : 12), y - 9, 38, 18, fmtScore2(x.p), { size: 11.5, bold: true, color: INK, align: pLeft ? "right" : "left", nowrap: true }));
    prims.push(text(S(x.q) + (pLeft ? 12 : -50), y - 9, 38, 18, fmtScore2(x.q), { size: 11.5, color: BODY, align: pLeft ? "left" : "right", nowrap: true }));
    const d = diffText(x.p, x.q);
    prims.push(text(AREA.r - 90, y - 10, 90, 20, d.text, { size: 12, mono: true, bold: true, color: INK, align: "right", nowrap: true }));
  });
  const sx = S(SCORE_STANDARD);
  prims.push(line(sx, top, sx, top + rows.length * rowH, STANDARD, { width: 1.5, dash: true }));
  prims.push(note("Categorías evaluadas por ambos públicos, ordenadas por la mayor diferencia (pasajeros − acompañantes). Línea punteada: Estándar AIGS 3,50."));
  return { title: "Encuestas Complementarias · pasajeros vs acompañantes", subtitle: `${full(r)} · ${r.seasonal!.focusLabel} · nota promedio por categoría`, prims };
}
