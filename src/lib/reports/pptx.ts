// Generador del PPTX editable del informe mensual. Usa los tokens AIGS con charts
// nativos (portada/cierre sobrios con logo + badge, sin foto de fondo).
// Server-only (runtime nodejs). Import dinámico para no forzar el bundle.

import { AIGS, FONT, SERIES, fmtInt, fmtMMSS, pct, fmtScore, fmtNps, scoreColor, npsColor } from "@/lib/reports/design";
import { LOGO_DATA_URI, LOGO_TEXT_DATA_URI } from "@/lib/reports/assets";
import type { MonthlyReport, ReportProcess, ReportAirlineBreakdown } from "@/lib/reports/monthlyReport";
import type { AgaScore, AgaSurvey } from "@/lib/reports/agaSurvey";
import {
  AGA_GUIDE_KPIS,
  AGA_GUIDE_PERIOD_NOTE,
  AGA_GUIDE_ATTRIBUTES,
  AGA_GUIDE_SERVICES,
  AGA_GUIDE_SCALE_NOTE,
  AGA_GUIDE_EXAMPLE_ATTRIBUTE,
  AGA_GUIDE_EXAMPLE_SERVICE,
} from "@/lib/reports/agaGuide";

// Lienzo del template: 20" × 11.25" (16:9).
const W = 20;
const H = 11.25;
const MX = 1.1; // margen lateral
const CONTENT_W = W - MX * 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pptx = any;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Wordmark "AERÓDROMOS.IGS" (solo texto) en la esquina inferior de las diapositivas de contenido. */
function addBottomLogo(slide: Slide) {
  slide.addImage({ data: LOGO_TEXT_DATA_URI, x: MX, y: H - 0.55, w: 2.0, h: 0.22, sizing: { type: "contain", w: 2.0, h: 0.22 } });
}

// "Aeropuerto El Loa - Calama" -> "Aeropuerto El Loa, Calama"
function airportFull(r: MonthlyReport): string {
  return r.airport.companyName.replace(" - ", ", ");
}

// Tope "bonito" (minutos) para compartir escala entre el gráfico principal y los mini.
function niceMax(m: number): number {
  const steps = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120];
  const target = Math.max(1, m) * 1.1;
  return steps.find((s) => s >= target) ?? Math.ceil(target / 30) * 30;
}

/** Logo (superior) para portada y cierre. */
function addLogo(slide: Slide, x = MX, y = 0.7) {
  slide.addImage({ data: LOGO_DATA_URI, x, y, w: 2.0, h: 0.75, sizing: { type: "contain", w: 2.0, h: 0.75 } });
}

function addBadge(slide: Slide, pres: Pptx, text: string, x: number, y: number, color: string = AIGS.ink) {
  const w = 0.16 * text.length + 0.5;
  slide.addShape(pres.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.42,
    fill: { color: AIGS.surfaceStrong },
    line: { type: "none" },
    rectRadius: 0.21,
  });
  slide.addText(text.toUpperCase(), {
    x,
    y,
    w,
    h: 0.42,
    align: "center",
    valign: "middle",
    fontFace: FONT.face,
    fontSize: 11,
    bold: true,
    color,
    charSpacing: 1,
    margin: 0,
  });
}

// --- KPI callout ------------------------------------------------------------
function kpiCard(
  slide: Slide,
  pres: Pptx,
  o: { x: number; y: number; w: number; h: number; label: string; value: string; sub?: string; valueColor?: string; subColor?: string }
) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    fill: { color: AIGS.white },
    line: { color: AIGS.hairline, width: 0.75 },
    rectRadius: 0.1,
  });
  slide.addText(o.label.toUpperCase(), {
    x: o.x + 0.22,
    y: o.y + 0.18,
    w: o.w - 0.44,
    h: 0.5,
    fontFace: FONT.face,
    fontSize: 10.5,
    color: AIGS.muted,
    charSpacing: 1,
    margin: 0,
    valign: "top",
  });
  slide.addText(o.value, {
    x: o.x + 0.22,
    y: o.y + 0.62,
    w: o.w - 0.44,
    h: o.h - 1.0,
    fontFace: FONT.mono,
    fontSize: 30,
    bold: true,
    color: o.valueColor ?? AIGS.blue,
    margin: 0,
    valign: "middle",
  });
  if (o.sub)
    slide.addText(o.sub, {
      x: o.x + 0.22,
      y: o.y + o.h - 0.5,
      w: o.w - 0.44,
      h: 0.4,
      fontFace: FONT.face,
      fontSize: 10,
      color: o.subColor ?? AIGS.muted,
      margin: 0,
      valign: "middle",
    });
}

/** Fila de KPIs distribuida en el ancho de contenido. */
function kpiRow(
  slide: Slide,
  pres: Pptx,
  cards: { label: string; value: string; sub?: string; valueColor?: string; subColor?: string }[],
  y: number,
  h = 2.3
) {
  const gap = 0.3;
  const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  cards.forEach((c, i) => kpiCard(slide, pres, { ...c, x: MX + i * (w + gap), y, w, h }));
}

function slideTitle(s: Slide, title: string, subtitle?: string) {
  s.addText(title, {
    x: MX,
    y: 0.7,
    w: CONTENT_W,
    h: 0.7,
    fontFace: FONT.face,
    fontSize: 28,
    bold: true,
    color: AIGS.ink,
    charSpacing: -0.3,
    margin: 0,
  });
  if (subtitle)
    s.addText(subtitle, {
      x: MX,
      y: 1.4,
      w: CONTENT_W,
      h: 0.45,
      fontFace: FONT.face,
      fontSize: 14,
      color: AIGS.muted,
      margin: 0,
    });
}

// --- Slides -----------------------------------------------------------------

function coverSlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  addLogo(s);
  addBadge(s, pres, "Informe mensual", MX, 4.3, AIGS.blue);
  s.addText(r.airport.name, {
    x: MX,
    y: 4.9,
    w: CONTENT_W,
    h: 1.6,
    fontFace: FONT.face,
    fontSize: 54,
    bold: false,
    color: AIGS.ink,
    charSpacing: -0.5,
    margin: 0,
  });
  s.addText(
    [
      { text: r.airport.companyName + "\n", options: { fontSize: 22, color: AIGS.body } },
      {
        text: `${
          r.aga.length > 0
            ? "Cumplimiento de Encuestas ASQ, mediciones de tiempos y Encuestas AGA"
            : "Cumplimiento de Encuestas ASQ y mediciones de tiempos"
        } · ${r.monthLabel}`,
        options: { fontSize: 16, color: AIGS.muted },
      },
    ],
    { x: MX, y: 6.6, w: CONTENT_W, h: 1.4, fontFace: FONT.face, margin: 0, lineSpacingMultiple: 1.2 }
  );
  s.addText(`Aeródromos IGS · ${r.monthLabel}`, {
    x: MX,
    y: H - 1.1,
    w: CONTENT_W,
    h: 0.4,
    fontFace: FONT.face,
    fontSize: 12,
    color: AIGS.muted,
    margin: 0,
  });
}

function sectionSlide(pres: Pptx, moduleLabel: string, title: string) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  s.addText(moduleLabel.toUpperCase(), {
    x: MX,
    y: 4.6,
    w: CONTENT_W,
    h: 0.5,
    fontFace: FONT.face,
    fontSize: 15,
    bold: true,
    color: AIGS.blue,
    charSpacing: 1.5,
    margin: 0,
  });
  s.addText(title, {
    x: MX,
    y: 5.2,
    w: CONTENT_W,
    h: 1.6,
    fontFace: FONT.face,
    fontSize: 48,
    color: AIGS.ink,
    charSpacing: -0.5,
    margin: 0,
  });
  addBottomLogo(s);
}

function asqSlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  const a = r.asq;
  slideTitle(
    s,
    "Encuestas ACI ASQ",
    a ? `${airportFull(r)} · ${a.seasonLabel.replace("-", " ")}` : airportFull(r)
  );

  if (!a) {
    s.addText(`Aún no hay datos de ASQ de la temporada ${r.season.label} para este aeropuerto.`, {
      x: MX,
      y: 5,
      w: CONTENT_W,
      h: 1,
      fontFace: FONT.face,
      fontSize: 18,
      color: AIGS.muted,
      align: "center",
      margin: 0,
    });
    addBottomLogo(s);
    return;
  }

  kpiRow(
    s,
    pres,
    [
      { label: "Plan (target)", value: fmtInt(a.target), sub: "encuestas comprometidas" },
      { label: "Realizadas", value: fmtInt(a.collected), sub: "acumulado de la temporada" },
      {
        label: "Avance",
        value: `${a.pct}%`,
        sub: a.collected >= a.target && a.target > 0 ? "meta alcanzada" : "de la meta",
        valueColor: a.collected >= a.target && a.target > 0 ? AIGS.up : AIGS.blue,
        subColor: a.collected >= a.target && a.target > 0 ? AIGS.up : AIGS.muted,
      },
      { label: "Rutas", value: fmtInt(a.rows.length), sub: "Aerolínea-Destino" },
    ],
    2.1
  );

  const head = ["Aerolínea-Destino", "Plan (target)", "Realizadas", "Avance"].map((t, i) => ({
    text: t,
    options: {
      bold: true,
      color: AIGS.muted,
      fill: { color: AIGS.surfaceSoft },
      align: (i === 0 ? "left" : "right") as "left" | "right",
      valign: "middle",
      fontSize: 12,
    },
  }));
  const body = a.rows.map((row) => {
    const p = pct(row.collected, row.target);
    const ok = row.target > 0 && row.collected >= row.target;
    return [
      { text: row.airlineDestination, options: { align: "left" as const, color: AIGS.body } },
      { text: fmtInt(row.target), options: { align: "right" as const, fontFace: FONT.mono, color: AIGS.ink } },
      { text: fmtInt(row.collected), options: { align: "right" as const, fontFace: FONT.mono, color: AIGS.ink } },
      {
        text: `${p}%${ok ? " ✓" : ""}`,
        options: { align: "right" as const, fontFace: FONT.mono, color: ok ? AIGS.up : AIGS.muted, bold: ok },
      },
    ];
  });
  const total = [
    { text: `Total ${r.airport.short ?? r.airport.code}`, options: { align: "left" as const, bold: true, color: AIGS.ink, fill: { color: AIGS.surfaceStrong } } },
    { text: fmtInt(a.target), options: { align: "right" as const, bold: true, fontFace: FONT.mono, color: AIGS.ink, fill: { color: AIGS.surfaceStrong } } },
    { text: fmtInt(a.collected), options: { align: "right" as const, bold: true, fontFace: FONT.mono, color: AIGS.ink, fill: { color: AIGS.surfaceStrong } } },
    { text: `${a.pct}%`, options: { align: "right" as const, bold: true, fontFace: FONT.mono, color: a.collected >= a.target ? AIGS.up : AIGS.ink, fill: { color: AIGS.surfaceStrong } } },
  ];

  // Alto de fila para caber entre los KPIs (y≈4.7) y el logo inferior (y≈10.4).
  const rowH = Math.min(0.42, 5.6 / Math.max(1, body.length + 2));
  s.addTable([head, ...body, total], {
    x: MX,
    y: 4.7,
    w: CONTENT_W,
    colW: [CONTENT_W * 0.46, CONTENT_W * 0.18, CONTENT_W * 0.18, CONTENT_W * 0.18],
    rowH,
    fontFace: FONT.face,
    fontSize: 12,
    color: AIGS.body,
    valign: "middle",
    border: { type: "solid", color: AIGS.hairline, pt: 0.5 },
    autoPage: false,
  });
  addBottomLogo(s);
}

/** Mini-gráfico de una aerolínea: tarjeta con nombre + promedio del mes + evolutivo con ejes. */
function miniAirlineChart(
  slide: Slide,
  pres: Pptx,
  a: ReportAirlineBreakdown,
  x: number,
  y: number,
  w: number,
  h: number,
  yMax: number
) {
  slide.addShape(pres.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: AIGS.white },
    line: { color: AIGS.hairline, width: 0.75 },
    rectRadius: 0.08,
  });
  // Título a la izquierda; promedio + n a la derecha (deja más alto para el gráfico).
  slide.addText(a.label, {
    x: x + 0.12,
    y: y + 0.1,
    w: w * 0.5 - 0.14,
    h: 0.3,
    fontFace: FONT.face,
    fontSize: 11,
    bold: true,
    color: AIGS.ink,
    align: "left",
    valign: "middle",
    margin: 0,
  });
  const ok = a.meta != null && a.monthProm != null ? a.monthProm <= a.meta : null;
  const valColor = ok == null ? AIGS.blue : ok ? AIGS.up : AIGS.down;
  slide.addText(
    [
      { text: fmtMMSS(a.monthProm), options: { fontFace: FONT.mono, fontSize: 13, bold: true, color: valColor } },
      { text: ` n=${a.monthN}`, options: { fontFace: FONT.face, fontSize: 8, color: AIGS.muted } },
    ],
    { x: x + w * 0.5, y: y + 0.1, w: w * 0.5 - 0.12, h: 0.3, align: "right", valign: "middle", margin: 0 }
  );
  // Ejes visibles con la MISMA escala Y (minutos) que el gráfico principal; meses cortos en X.
  const labels = a.series.map((p) => p.label.split(" ")[0]);
  const series: { name: string; labels: string[]; values: (number | null)[] }[] = [
    { name: "Promedio", labels, values: a.series.map((p) => (p.prom == null ? null : round1(p.prom))) },
  ];
  const colors: string[] = [SERIES.prom];
  if (a.meta != null) {
    series.push({ name: "Estándar", labels, values: labels.map(() => a.meta as number) });
    colors.push(SERIES.meta);
  }
  slide.addChart(pres.ChartType.line, series, {
    x: x + 0.06,
    y: y + 0.5,
    w: w - 0.12,
    h: h - 0.6,
    chartColors: colors,
    lineSize: 1.75,
    showLegend: false,
    showTitle: false,
    showValue: false,
    catAxisLabelColor: AIGS.muted,
    catAxisLabelFontFace: FONT.face,
    catAxisLabelFontSize: 7,
    valAxisLabelColor: AIGS.muted,
    valAxisLabelFontFace: FONT.face,
    valAxisLabelFontSize: 7,
    valAxisMinVal: 0,
    valAxisMaxVal: yMax,
    valGridLine: { color: "F1F5F9", size: 0.5 },
    catGridLine: { style: "none" },
  });
}

function procesoSlide(pres: Pptx, r: MonthlyReport, p: ReportProcess) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  const title = `${p.proceso}${p.faseLabel ? ` — ${p.faseLabel}` : ""}`;
  // Sin mediciones este mes: la diapositiva se muestra igual (hubo mediciones antes en la
  // temporada); los KPIs del mes van en "—" y se apoya el lector en el acumulado del periodo.
  const subtitle = p.monthHasData
    ? `${airportFull(r)} · ${r.monthLabel}`
    : `${airportFull(r)} · ${r.monthLabel} · sin mediciones este mes (se muestra el acumulado de la temporada)`;
  slideTitle(s, title, subtitle);

  const kpi = p.kpi;
  const marginOk = p.margin != null && p.margin >= 0;
  const seasonMargin = p.meta != null ? p.meta - p.kpiSeason.prom : null;
  const marginCard =
    p.meta == null
      ? { label: "Estándar IATA", value: "—", sub: "sin estándar" }
      : {
          label: "Margen vs Est. IATA",
          value: fmtMMSS(p.margin),
          sub: `Periodo ${fmtMMSS(seasonMargin)}`,
          valueColor: p.margin == null ? AIGS.muted : marginOk ? AIGS.up : AIGS.down,
        };

  // KPIs: número del mes en grande + promedio del periodo abajo (pequeño).
  kpiRow(
    s,
    pres,
    [
      { label: "Promedio", value: kpi ? fmtMMSS(kpi.prom) : "—", sub: `Periodo ${fmtMMSS(p.kpiSeason.prom)}` },
      { label: "P90", value: kpi ? fmtMMSS(kpi.p90) : "—", sub: `Periodo ${fmtMMSS(p.kpiSeason.p90)}` },
      { label: "Mediana", value: kpi ? fmtMMSS(kpi.med) : "—", sub: `Periodo ${fmtMMSS(p.kpiSeason.med)}` },
      marginCard,
      { label: "N° de mediciones", value: fmtInt(kpi ? kpi.n : 0), sub: `Periodo ${fmtInt(p.kpiSeason.n)}` },
    ],
    2.1
  );

  const hasMini = p.byAirline.length > 0;
  const yMax = niceMax(Math.max(0, ...p.series.flatMap((x) => [x.prom ?? 0, x.med ?? 0, x.p90 ?? 0]), p.meta ?? 0));

  // Evolutivo principal (minutos; misma escala Y que los mini). Legenda abajo.
  const labels = p.series.map((x) => x.label);
  const data: { name: string; labels: string[]; values: (number | null)[] }[] = [
    { name: "Promedio", labels, values: p.series.map((x) => (x.prom == null ? null : round1(x.prom))) },
    { name: "Mediana", labels, values: p.series.map((x) => (x.med == null ? null : round1(x.med))) },
    { name: "p90", labels, values: p.series.map((x) => (x.p90 == null ? null : round1(x.p90))) },
  ];
  const chartColors: string[] = [SERIES.prom, SERIES.med, SERIES.p90];
  if (p.meta != null) {
    data.push({ name: "Estándar IATA", labels, values: labels.map(() => p.meta as number) });
    chartColors.push(SERIES.meta);
  }

  s.addText("Evolutivo", {
    x: MX,
    y: hasMini ? 4.5 : 4.7,
    w: CONTENT_W,
    h: 0.4,
    fontFace: FONT.face,
    fontSize: 14,
    bold: true,
    color: AIGS.ink,
    margin: 0,
  });
  s.addChart(pres.ChartType.line, data, {
    x: MX,
    y: hasMini ? 4.95 : 5.2,
    w: CONTENT_W,
    h: hasMini ? 2.45 : 5.0,
    chartColors,
    lineSize: 2.25,
    lineSmooth: false,
    showLegend: true,
    legendPos: "b",
    legendFontFace: FONT.face,
    legendFontSize: 11,
    legendColor: AIGS.body,
    showTitle: false,
    showValue: false,
    catAxisLabelColor: AIGS.muted,
    catAxisLabelFontFace: FONT.face,
    catAxisLabelFontSize: 11,
    valAxisLabelColor: AIGS.muted,
    valAxisLabelFontFace: FONT.face,
    valAxisLabelFontSize: 11,
    valAxisMinVal: 0,
    valAxisMaxVal: yMax,
    valGridLine: { color: "EEF2F6", size: 0.5 },
    catGridLine: { style: "none" },
  });

  // Mini-gráficos por aerolínea (Check in / Retiro), misma escala Y que el principal.
  if (hasMini) {
    s.addText("Promedio por aerolínea · línea: promedio, guiones: estándar IATA · ejes en minutos", {
      x: MX,
      y: 7.55,
      w: CONTENT_W,
      h: 0.35,
      fontFace: FONT.face,
      fontSize: 12,
      bold: true,
      color: AIGS.ink,
      margin: 0,
    });
    const cards = p.byAirline.slice(0, 6);
    const gap = 0.28;
    const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
    cards.forEach((a, i) => miniAirlineChart(s, pres, a, MX + i * (w + gap), 7.95, w, 2.35, yMax));
  }

  addBottomLogo(s);
}

type ScoreRowData = AgaScore & { usePct?: number | null };

/** Panel de barras horizontales (nota 1–5) con semáforo; servicios agregan el % de uso. */
function scorePanel(
  slide: Slide,
  pres: Pptx,
  o: {
    x: number;
    y: number;
    w: number;
    rowH: number;
    title: string;
    note: string;
    rows: ScoreRowData[];
  }
) {
  slide.addText(
    [
      { text: o.title, options: { bold: true, color: AIGS.ink, fontSize: 14 } },
      { text: `  · ${o.note}`, options: { color: AIGS.muted, fontSize: 11 } },
    ],
    { x: o.x, y: o.y, w: o.w, h: 0.4, fontFace: FONT.face, margin: 0, valign: "middle" }
  );
  if (o.rows.length === 0) {
    slide.addText("Sin calificaciones.", { x: o.x, y: o.y + 0.5, w: o.w, h: 0.4, fontFace: FONT.face, fontSize: 12, color: AIGS.muted, margin: 0 });
    return;
  }
  const fs = Math.max(9, Math.min(12, Math.floor(o.rowH * 28)));
  const labelW = o.w * 0.46;
  const barX = o.x + labelW + 0.1;
  const barW = o.w * 0.3;
  const valX = barX + barW + 0.08;
  const valW = 0.55;
  const extraX = valX + valW;
  const extraW = o.x + o.w - extraX;
  o.rows.forEach((r, i) => scoreRow(r, o.y + 0.5 + i * o.rowH));

  function scoreRow(r: ScoreRowData, y: number) {
    slide.addShape(pres.ShapeType.line, { x: o.x, y, w: o.w, h: 0, line: { color: AIGS.hairline, width: 0.5 } });
    const t = { y, h: o.rowH, fontFace: FONT.face, valign: "middle" as const, margin: 0 };
    slide.addText(r.label, { ...t, x: o.x, w: labelW, fontSize: fs, color: AIGS.body, fit: "shrink" });
    const by = y + o.rowH / 2 - 0.06;
    slide.addShape(pres.ShapeType.roundRect, { x: barX, y: by, w: barW, h: 0.12, fill: { color: AIGS.surfaceStrong }, line: { type: "none" }, rectRadius: 0.06 });
    if (r.avg != null && r.avg > 0)
      slide.addShape(pres.ShapeType.roundRect, {
        x: barX,
        y: by,
        w: Math.max(0.12, (barW * r.avg) / 5),
        h: 0.12,
        fill: { color: scoreColor(r.avg) },
        line: { type: "none" },
        rectRadius: 0.06,
      });
    slide.addText(fmtScore(r.avg), { ...t, x: valX, w: valW, fontFace: FONT.mono, fontSize: fs, bold: true, color: AIGS.ink, align: "right" });
    const extra = `${r.usePct !== undefined ? `${r.usePct != null ? `${r.usePct}%` : "—"} · ` : ""}n=${r.n}`;
    slide.addText(extra, { ...t, x: extraX, w: extraW, fontSize: Math.max(8, fs - 2), color: AIGS.muted, align: "right" });
  }
}

/** Leyenda del semáforo (abajo a la derecha, junto al wordmark). */
function scoreLegend(s: Slide, tail: string) {
  s.addText(
    [
      { text: "● ", options: { color: AIGS.up } },
      { text: "≥ 4,0   ", options: { color: AIGS.muted } },
      { text: "● ", options: { color: AIGS.yellow } },
      { text: "3,5 – 3,9   ", options: { color: AIGS.muted } },
      { text: "● ", options: { color: AIGS.down } },
      { text: `< 3,5   · ${tail}`, options: { color: AIGS.muted } },
    ],
    { x: W - MX - 12, y: H - 0.62, w: 12, h: 0.3, fontFace: FONT.face, fontSize: 10, align: "right", valign: "middle", margin: 0 }
  );
}

/** Diapositiva explicativa previa: qué es cada KPI y cómo leer atributos / servicios. */
function agaGuideSlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, "Cómo leer las Encuestas AGA", `${airportFull(r)} · Indicadores y leyenda`);

  const gap = 0.3;
  const cardW = (CONTENT_W - gap * 3) / 4;
  const cardY = 2.15;
  const cardH = 3.65;
  AGA_GUIDE_KPIS.forEach((k, i) => {
    const x = MX + i * (cardW + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: cardY, w: cardW, h: cardH, fill: { color: AIGS.white }, line: { color: AIGS.hairline, width: 0.75 }, rectRadius: 0.1,
    });
    const tx = { x: x + 0.25, w: cardW - 0.5, fontFace: FONT.face, margin: 0, valign: "top" as const };
    s.addText(k.title, { ...tx, y: cardY + 0.22, h: 0.45, fontSize: 17, bold: true, color: AIGS.blue });
    s.addText(k.question, { ...tx, y: cardY + 0.72, h: 0.6, fontSize: 11, italic: true, color: AIGS.muted, fit: "shrink" });
    s.addText(k.how, { ...tx, y: cardY + 1.4, h: 1.65, fontSize: 12, color: AIGS.body, lineSpacingMultiple: 1.15, fit: "shrink" });
    if (k.color) s.addText(k.color, { ...tx, y: cardY + cardH - 0.5, h: 0.35, fontSize: 10.5, color: AIGS.ink, valign: "middle" });
  });
  s.addText(AGA_GUIDE_PERIOD_NOTE, {
    x: MX, y: cardY + cardH + 0.15, w: CONTENT_W, h: 0.35, fontFace: FONT.face, fontSize: 12, color: AIGS.muted, margin: 0,
  });

  const colGap = 0.6;
  const colW = (CONTENT_W - colGap) / 2;
  const top = 6.65;
  const rowH = 0.45;
  const blocks = [
    { title: "Atributos de la experiencia", note: "nota 1–5 · ejemplo", row: AGA_GUIDE_EXAMPLE_ATTRIBUTE, text: AGA_GUIDE_ATTRIBUTES },
    { title: "Servicios evaluados", note: "nota 1–5 · % que lo usó · ejemplo", row: AGA_GUIDE_EXAMPLE_SERVICE, text: AGA_GUIDE_SERVICES },
  ];
  blocks.forEach((b, i) => {
    const x = MX + i * (colW + colGap);
    scorePanel(s, pres, { x, y: top, w: colW, rowH, title: b.title, note: b.note, rows: [b.row] });
    s.addText(b.text, {
      x, y: top + 0.5 + rowH + 0.15, w: colW, h: 1.75, fontFace: FONT.face, fontSize: 12, color: AIGS.body,
      valign: "top", margin: 0, lineSpacingMultiple: 1.15, fit: "shrink",
    });
  });

  scoreLegend(s, AGA_GUIDE_SCALE_NOTE);
  addBottomLogo(s);
}

/** Encuesta AGA de un público en una diapositiva: KPIs + atributos + servicios. */
function agaSlide(pres: Pptx, r: MonthlyReport, a: AgaSurvey) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  const m = a.month;
  const p = a.period;
  const hasMonth = m.n > 0;
  const shown = hasMonth ? m : p;
  slideTitle(
    s,
    `Encuestas AGA · ${a.audience}`,
    `${airportFull(r)} · ${r.monthLabel} · ${a.planTitle}${
      hasMonth || p.n === 0 ? "" : " · sin encuestas este mes (se muestra el acumulado del periodo)"
    }`
  );

  if (p.n === 0) {
    s.addText("Aún no hay encuestas registradas para este plan.", {
      x: MX, y: 5, w: CONTENT_W, h: 1, fontFace: FONT.face, fontSize: 18, color: AIGS.muted, align: "center", margin: 0,
    });
    addBottomLogo(s);
    return;
  }

  const kpiY = 2.1;
  const kpiH = 2.6;
  kpiRow(
    s,
    pres,
    [
      { label: "NPS", value: hasMonth ? fmtNps(m.nps) : "—", valueColor: npsColor(hasMonth ? m.nps : null), sub: `Periodo ${fmtNps(p.nps)}` },
      {
        label: "Satisfacción general",
        value: hasMonth ? `${fmtScore(m.sat)} / 5` : "—",
        valueColor: scoreColor(hasMonth ? m.sat : null),
        sub: `Periodo ${fmtScore(p.sat)} / 5`,
      },
      {
        label: "Satisfechos (nota 4–5)",
        value: hasMonth && m.satTop2 != null ? `${m.satTop2}%` : "—",
        sub: `Periodo ${p.satTop2 != null ? `${p.satTop2}%` : "—"}`,
      },
      {
        label: "Encuestas del mes",
        value: fmtInt(m.n),
        sub: `Periodo ${fmtInt(p.n)}${a.target > 0 ? ` de ${fmtInt(a.target)} (${pct(p.n, a.target)}%)` : ""}`,
      },
    ],
    kpiY,
    kpiH
  );

  // Composición del NPS dentro de la primera tarjeta (promotores / pasivos / detractores).
  if (hasMonth && m.npsN > 0) {
    const cardW = (CONTENT_W - 0.3 * 3) / 4;
    const bx = MX + 0.22;
    const bw = cardW - 0.44;
    const by = kpiY + 1.62;
    let x = bx;
    for (const [v, c] of [
      [m.promotersPct ?? 0, AIGS.up],
      [m.passivesPct ?? 0, AIGS.hairline],
      [m.detractorsPct ?? 0, AIGS.down],
    ] as [number, string][]) {
      const w = (bw * v) / 100;
      if (w > 0) s.addShape(pres.ShapeType.rect, { x, y: by, w, h: 0.09, fill: { color: c }, line: { type: "none" } });
      x += w;
    }
    s.addText(`Prom. ${m.promotersPct ?? 0}% · Pas. ${m.passivesPct ?? 0}% · Det. ${m.detractorsPct ?? 0}%`, {
      x: bx, y: by + 0.12, w: bw, h: 0.28, fontFace: FONT.face, fontSize: 9, color: AIGS.muted, margin: 0, valign: "middle",
    });
  }

  const gap = 0.6;
  const colW = (CONTENT_W - gap) / 2;
  const top = 5.0;
  const rows = Math.max(shown.attributes.length, shown.services.length, 1);
  const rowH = Math.min(0.45, (H - 0.95 - (top + 0.5)) / rows);
  scorePanel(s, pres, { x: MX, y: top, w: colW, rowH, title: "Atributos de la experiencia", note: "nota 1–5", rows: shown.attributes });
  scorePanel(s, pres, { x: MX + colW + gap, y: top, w: colW, rowH, title: "Servicios evaluados", note: "nota 1–5 · % que lo usó", rows: shown.services });

  scoreLegend(s, "N/A no se considera");
  addBottomLogo(s);
}

/** "Voz del pasajero / acompañante": apreciación general + citas destacadas del mes. */
function voiceSlide(pres: Pptx, r: MonthlyReport, a: AgaSurvey) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  const who = a.audience === "Acompañantes" ? "acompañante" : "pasajero";
  slideTitle(s, `Voz del ${who}`, `${airportFull(r)} · ${r.monthLabel} · ${a.planTitle}`);
  const { appraisal, quotes } = a.voice;
  const shown = quotes.slice(0, appraisal ? 4 : 6);
  const top = 2.2;
  const bottom = H - 1.0;
  const gap = 0.45;
  let qx = MX;
  let qw = CONTENT_W;
  if (appraisal) {
    const aw = shown.length ? CONTENT_W * 0.44 : CONTENT_W;
    s.addShape(pres.ShapeType.roundRect, {
      x: MX, y: top, w: aw, h: bottom - top, fill: { color: AIGS.surfaceSoft }, line: { color: AIGS.hairline, width: 0.75 }, rectRadius: 0.12,
    });
    s.addText("APRECIACIÓN GENERAL", {
      x: MX + 0.35, y: top + 0.3, w: aw - 0.7, h: 0.35, fontFace: FONT.face, fontSize: 11, bold: true, color: AIGS.blue, charSpacing: 1, margin: 0,
    });
    s.addText(appraisal, {
      x: MX + 0.35, y: top + 0.8, w: aw - 0.7, h: bottom - top - 1.1, fontFace: FONT.face, fontSize: 16, color: AIGS.body,
      valign: "top", margin: 0, lineSpacingMultiple: 1.2, fit: "shrink",
    });
    qx = MX + aw + gap;
    qw = CONTENT_W - aw - gap;
  }
  if (shown.length) {
    const cols = appraisal ? 1 : 2;
    const rows = Math.ceil(shown.length / cols);
    const cw = (qw - (cols - 1) * 0.3) / cols;
    const ch = Math.min(1.75, (bottom - top - (rows - 1) * 0.2) / rows); // tarjetas compactas si hay pocas citas
    shown.forEach((q, i) => {
      const x = qx + (i % cols) * (cw + 0.3);
      const y = top + Math.floor(i / cols) * (ch + 0.2);
      const tone = q.nps == null ? AIGS.muted : q.nps >= 9 ? AIGS.up : q.nps <= 6 ? AIGS.down : AIGS.muted;
      s.addShape(pres.ShapeType.rect, { x, y, w: cw, h: ch, fill: { color: AIGS.white }, line: { color: AIGS.hairline, width: 0.75 } });
      s.addShape(pres.ShapeType.rect, { x, y, w: 0.07, h: ch, fill: { color: tone }, line: { type: "none" } });
      s.addText(`${q.label.toUpperCase()}${q.nps != null ? ` · NPS ${q.nps}` : ""}`, {
        x: x + 0.25, y: y + 0.12, w: cw - 0.4, h: 0.3, fontFace: FONT.face, fontSize: 9.5, color: AIGS.muted, charSpacing: 0.5, margin: 0,
      });
      s.addText(`“${q.text}”`, {
        x: x + 0.25, y: y + 0.45, w: cw - 0.4, h: ch - 0.55, fontFace: FONT.face, fontSize: 14, italic: true, color: AIGS.ink,
        valign: "top", margin: 0, fit: "shrink",
      });
    });
  }
  addBottomLogo(s);
}

/** Diapositiva opcional "Comentarios y sugerencias" (antes del cierre). */
function commentsSlide(pres: Pptx, r: MonthlyReport, comentarios: string) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, "Comentarios y sugerencias", `${airportFull(r)} · ${r.monthLabel}`);

  const boxY = 2.2;
  const boxH = H - boxY - 0.9; // deja aire para el logo inferior
  s.addShape(pres.ShapeType.roundRect, {
    x: MX,
    y: boxY,
    w: CONTENT_W,
    h: boxH,
    fill: { color: AIGS.surfaceSoft },
    line: { color: AIGS.hairline, width: 0.75 },
    rectRadius: 0.1,
  });
  s.addText(comentarios, {
    x: MX + 0.4,
    y: boxY + 0.3,
    w: CONTENT_W - 0.8,
    h: boxH - 0.6,
    fontFace: FONT.face,
    fontSize: 18,
    color: AIGS.body,
    align: "left",
    valign: "top",
    margin: 0,
    lineSpacingMultiple: 1.25,
    fit: "shrink", // achica el texto si el comentario es largo, para que no desborde
  });
  addBottomLogo(s);
}

export type DeckPhotoData = { caption: string | null; dataUri: string };

/** Diapositivas "Fotografías" (opcionales, justo después de comentarios): grilla 2×2, máx. 4 por diapositiva. */
function photosSlides(pres: Pptx, r: MonthlyReport, photos: DeckPhotoData[]) {
  const chunks: DeckPhotoData[][] = [];
  for (let i = 0; i < photos.length; i += 4) chunks.push(photos.slice(i, i + 4));

  const gap = 0.3;
  const top = 2.2;
  const bottom = H - 0.9;
  const cellW = (CONTENT_W - gap) / 2;
  const cellH = (bottom - top - gap) / 2;

  chunks.forEach((group, gi) => {
    const s = pres.addSlide();
    s.background = { color: AIGS.white };
    slideTitle(
      s,
      "Fotografías",
      `${airportFull(r)} · ${r.monthLabel}${chunks.length > 1 ? ` · ${gi + 1}/${chunks.length}` : ""}`
    );

    group.forEach((p, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MX + col * (cellW + gap);
      const y = top + row * (cellH + gap);
      const capH = p.caption ? 0.5 : 0;
      const imgH = cellH - capH;
      s.addImage({ data: p.dataUri, x, y, w: cellW, h: imgH, sizing: { type: "contain", w: cellW, h: imgH } });
      if (p.caption) {
        s.addText(p.caption, {
          x,
          y: y + imgH + 0.04,
          w: cellW,
          h: capH,
          fontFace: FONT.face,
          fontSize: 11,
          color: AIGS.muted,
          align: "center",
          valign: "top",
          margin: 0,
          fit: "shrink",
        });
      }
    });

    addBottomLogo(s);
  });
}

function closingSlide(pres: Pptx) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  addLogo(s);
  s.addText("Gracias", {
    x: MX,
    y: 4.6,
    w: CONTENT_W,
    h: 1.4,
    fontFace: FONT.face,
    fontSize: 60,
    color: AIGS.ink,
    charSpacing: -1,
    margin: 0,
  });
  s.addText("contacto@aerodromosigs.cl · www.aerodromosigs.cl", {
    x: MX,
    y: 6.2,
    w: CONTENT_W,
    h: 0.5,
    fontFace: FONT.face,
    fontSize: 18,
    color: AIGS.body,
    margin: 0,
  });
}

/**
 * Construye el deck completo y devuelve los bytes del .pptx.
 * `comentarios`: si trae texto, agrega la diapositiva "Comentarios y sugerencias"
 * justo antes del cierre; si viene vacío, se omite.
 * `photos`: si trae elementos, agrega diapositiva(s) "Fotografías" (máx. 4 por
 * diapositiva) justo después de comentarios; si viene vacío, se omite.
 */
export async function buildDeck(r: MonthlyReport, comentarios?: string, photos?: DeckPhotoData[]): Promise<Uint8Array> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "AIGS", width: W, height: H });
  pres.layout = "AIGS";
  pres.author = "Aeródromos IGS";
  pres.title = `Informe mensual ${r.airport.name} · ${r.monthLabel}`;

  coverSlide(pres, r);

  sectionSlide(pres, "Módulo 01", "Encuestas ASQ");
  asqSlide(pres, r);

  sectionSlide(pres, "Módulo 02", "Mediciones de tiempos");
  if (r.processes.length === 0) {
    const s = pres.addSlide();
    s.background = { color: AIGS.white };
    slideTitle(s, "Mediciones de tiempos", airportFull(r));
    s.addText(
      r.bqError
        ? "No se pudieron leer las mediciones de tiempos (credenciales de BigQuery)."
        : "Sin mediciones de tiempos registradas en esta temporada.",
      { x: MX, y: 5, w: CONTENT_W, h: 1, fontFace: FONT.face, fontSize: 18, color: AIGS.muted, align: "center", margin: 0 }
    );
    addBottomLogo(s);
  } else {
    for (const p of r.processes) procesoSlide(pres, r, p);
  }

  // Módulo 03: Encuestas AGA (solo si el aeropuerto tiene plan AGA vigente).
  if (r.aga.length > 0) {
    sectionSlide(pres, "Módulo 03", "Encuestas AGA · Experiencia");
    agaGuideSlide(pres, r);
    for (const a of r.aga) {
      agaSlide(pres, r, a);
      if (a.voice.appraisal || a.voice.quotes.length > 0) voiceSlide(pres, r, a);
    }
  }

  const comments = (comentarios ?? "").trim();
  if (comments) commentsSlide(pres, r, comments);

  if (photos && photos.length > 0) photosSlides(pres, r, photos);

  closingSlide(pres);

  const out = (await pres.write({ outputType: "nodebuffer" })) as Uint8Array;
  return out;
}
