// Generador del PPTX editable del informe mensual. Portada y cierre siguen la
// referencia "Informe Mensual Calidad de Servicio" (foto de terminal + tinte /
// cierre teal); el resto usa los tokens AIGS con charts nativos.
// Server-only (runtime nodejs). Import dinámico para no forzar el bundle.

import { AIGS, FONT, SERIES, fmtInt, fmtMMSS, pct, shortAirline } from "@/lib/reports/design";
import { LOGO_DATA_URI, LOGO_WHITE_DATA_URI, TERMINAL_DATA_URI } from "@/lib/reports/assets";
import type { MonthlyReport, ReportProcess, ReportAirlineBreakdown } from "@/lib/reports/monthlyReport";

// Lienzo del template: 20" × 11.25" (16:9).
const W = 20;
const H = 11.25;
const MX = 1.1; // margen lateral
const CONTENT_W = W - MX * 2;
const TINT = "055E84"; // tinte azul de la portada (referencia AIGS)
const CLOSE_BG = "8DB0BB"; // teal del cierre (referencia AIGS)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pptx = any;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Logo en la esquina inferior izquierda de las diapositivas de contenido. */
function addBottomLogo(slide: Slide) {
  slide.addImage({ data: LOGO_DATA_URI, x: MX, y: H - 0.7, w: 1.7, h: 0.5, sizing: { type: "contain", w: 1.7, h: 0.5 } });
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
  // Foto de terminal a sangre completa + tinte azul.
  s.addImage({ data: TERMINAL_DATA_URI, x: 0, y: 0, w: W, h: H, sizing: { type: "cover", w: W, h: H } });
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: TINT, transparency: 38 }, line: { type: "none" } });
  // Logo blanco arriba-derecha.
  s.addImage({ data: LOGO_WHITE_DATA_URI, x: W - 4.2, y: 0.9, w: 3.2, h: 1.0, sizing: { type: "contain", w: 3.2, h: 1.0 } });
  // Título.
  s.addText("Informe Mensual\nEncuestas de\nCalidad de Servicio", {
    x: 1.3,
    y: 3.3,
    w: 13,
    h: 3.6,
    fontFace: FONT.face,
    fontSize: 50,
    bold: true,
    color: AIGS.white,
    charSpacing: -0.5,
    lineSpacingMultiple: 1.05,
    margin: 0,
  });
  s.addText(r.airport.name, { x: 1.3, y: 8.2, w: 15, h: 0.6, fontFace: FONT.face, fontSize: 22, bold: true, color: AIGS.white, margin: 0 });
  s.addText(r.monthLabel, { x: 1.3, y: 8.8, w: 15, h: 0.5, fontFace: FONT.face, fontSize: 18, color: AIGS.white, margin: 0 });
  s.addShape(pres.ShapeType.rect, { x: 1.35, y: 9.55, w: 5.6, h: 0.03, fill: { color: AIGS.white }, line: { type: "none" } });
  s.addText("Elaborado por AERÓDROMOS.IGS", {
    x: 1.3,
    y: 9.7,
    w: 15,
    h: 0.4,
    fontFace: FONT.face,
    fontSize: 13,
    color: AIGS.white,
    charSpacing: 0.5,
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
    "Encuestas ASQ — cumplimiento",
    a ? `${r.airport.short ?? r.airport.name} · temporada ${a.seasonLabel}` : r.airport.name
  );

  if (!a) {
    s.addText("Aún no hay datos de ASQ para este aeropuerto.", {
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

/** Mini-gráfico de una aerolínea: tarjeta con nombre + promedio del mes + sparkline. */
function miniAirlineChart(slide: Slide, pres: Pptx, a: ReportAirlineBreakdown, x: number, y: number, w: number, h: number) {
  slide.addShape(pres.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: AIGS.white },
    line: { color: AIGS.hairline, width: 0.75 },
    rectRadius: 0.08,
  });
  slide.addText(shortAirline(a.airline), {
    x: x + 0.14,
    y: y + 0.12,
    w: w - 0.28,
    h: 0.32,
    fontFace: FONT.face,
    fontSize: 11,
    bold: true,
    color: AIGS.ink,
    margin: 0,
  });
  const ok = a.meta != null && a.monthProm != null ? a.monthProm <= a.meta : null;
  const valColor = ok == null ? AIGS.blue : ok ? AIGS.up : AIGS.down;
  slide.addText(
    [
      { text: fmtMMSS(a.monthProm), options: { fontFace: FONT.mono, fontSize: 16, bold: true, color: valColor } },
      { text: `  n=${a.monthN}`, options: { fontFace: FONT.face, fontSize: 9, color: AIGS.muted } },
    ],
    { x: x + 0.14, y: y + 0.42, w: w - 0.28, h: 0.34, margin: 0, valign: "middle" }
  );
  const labels = a.series.map((p) => p.label);
  const series: { name: string; labels: string[]; values: (number | null)[] }[] = [
    { name: "Promedio", labels, values: a.series.map((p) => (p.prom == null ? null : round1(p.prom))) },
  ];
  const colors: string[] = [SERIES.prom];
  if (a.meta != null) {
    series.push({ name: "Estándar", labels, values: labels.map(() => a.meta as number) });
    colors.push(SERIES.meta);
  }
  slide.addChart(pres.ChartType.line, series, {
    x: x + 0.08,
    y: y + 0.82,
    w: w - 0.16,
    h: h - 0.94,
    chartColors: colors,
    lineSize: 1.75,
    showLegend: false,
    showTitle: false,
    showValue: false,
    catAxisHidden: true,
    valAxisHidden: true,
    valAxisMinVal: 0,
    valGridLine: { style: "none" },
    catGridLine: { style: "none" },
  });
}

function procesoSlide(pres: Pptx, r: MonthlyReport, p: ReportProcess) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  const title = `${p.proceso}${p.faseLabel ? ` — ${p.faseLabel}` : ""}`;
  slideTitle(s, title, `${r.airport.short ?? r.airport.name} · ${r.monthLabel}`);

  const marginOk = p.margin != null && p.margin >= 0;
  const marginCard =
    p.meta == null
      ? { label: "Estándar IATA", value: "—", sub: "sin estándar" }
      : {
          label: "Margen vs Est. IATA",
          value: fmtMMSS(p.margin),
          sub: `${marginOk ? "bajo" : "sobre"} estándar ${fmtMMSS(p.meta)}`,
          valueColor: marginOk ? AIGS.up : AIGS.down,
          subColor: marginOk ? AIGS.up : AIGS.down,
        };

  kpiRow(
    s,
    pres,
    [
      { label: "Promedio", value: fmtMMSS(p.kpi.prom), sub: "mm:ss" },
      { label: "P90", value: fmtMMSS(p.kpi.p90), sub: "mm:ss" },
      { label: "Mediana", value: fmtMMSS(p.kpi.med), sub: "mm:ss" },
      marginCard,
      { label: "N° de mediciones", value: fmtInt(p.kpi.n), sub: "en el mes" },
    ],
    2.1
  );

  const hasMini = p.byAirline.length > 0;

  // Evolutivo principal (más chico si hay desglose por aerolínea).
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

  s.addText("Evolutivo — distribución (minutos)", {
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
    valGridLine: { color: "EEF2F6", size: 0.5 },
    catGridLine: { style: "none" },
  });

  // Mini-gráficos por aerolínea (Check in / Retiro).
  if (hasMini) {
    s.addText("Promedio por aerolínea (mm:ss)", {
      x: MX,
      y: 7.55,
      w: CONTENT_W,
      h: 0.35,
      fontFace: FONT.face,
      fontSize: 13,
      bold: true,
      color: AIGS.ink,
      margin: 0,
    });
    const cards = p.byAirline.slice(0, 6);
    const gap = 0.28;
    const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
    cards.forEach((a, i) => miniAirlineChart(s, pres, a, MX + i * (w + gap), 7.95, w, 2.35));
  }

  addBottomLogo(s);
}

function closingSlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: CLOSE_BG };
  s.addImage({
    data: LOGO_WHITE_DATA_URI,
    x: (W - 5) / 2,
    y: 3.6,
    w: 5,
    h: 2.5,
    sizing: { type: "contain", w: 5, h: 2.5 },
  });
  const year = r.month.slice(0, 4);
  s.addText(`contacto@aerodromosigs.cl     |     Copyright © ${year}     |     Aeródromos IGS`, {
    x: 0,
    y: 8.4,
    w: W,
    h: 0.5,
    align: "center",
    fontFace: FONT.face,
    fontSize: 15,
    color: AIGS.white,
    margin: 0,
  });
}

/** Construye el deck completo y devuelve los bytes del .pptx. */
export async function buildDeck(r: MonthlyReport): Promise<Uint8Array> {
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
    slideTitle(s, "Mediciones de tiempos", r.airport.short ?? r.airport.name);
    s.addText(
      r.bqError
        ? "No se pudieron leer las mediciones de tiempos (credenciales de BigQuery)."
        : "Sin mediciones de tiempos registradas para este mes.",
      { x: MX, y: 5, w: CONTENT_W, h: 1, fontFace: FONT.face, fontSize: 18, color: AIGS.muted, align: "center", margin: 0 }
    );
    addBottomLogo(s);
  } else {
    for (const p of r.processes) procesoSlide(pres, r, p);
  }

  closingSlide(pres, r);

  const out = (await pres.write({ outputType: "nodebuffer" })) as Uint8Array;
  return out;
}
