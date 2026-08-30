// Generador del PPTX editable del informe mensual. Usa los tokens AIGS con charts
// nativos (portada/cierre sobrios con logo + badge, sin foto de fondo).
// Server-only (runtime nodejs). Import dinámico para no forzar el bundle.

import { AIGS, FONT, SERIES, fmtInt, fmtMMSS, pct } from "@/lib/reports/design";
import { LOGO_DATA_URI, LOGO_TEXT_DATA_URI } from "@/lib/reports/assets";
import type { MonthlyReport, ReportProcess, ReportAirlineBreakdown } from "@/lib/reports/monthlyReport";

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
        text: `Cumplimiento de Encuestas ASQ y mediciones de tiempos · ${r.monthLabel}`,
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

  closingSlide(pres);

  const out = (await pres.write({ outputType: "nodebuffer" })) as Uint8Array;
  return out;
}
