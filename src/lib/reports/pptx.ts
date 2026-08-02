// Generador del PPTX editable del informe mensual, replicando los layouts del
// template "AIGS Design System" (Workshop Deck) con pptxgenjs. Charts nativos.
// Server-only (runtime nodejs). Import dinámico para no forzar el bundle.

import { AIGS, FONT, SERIES, fmtInt, fmtMMSS, pct } from "@/lib/reports/design";
import { LOGO_DATA_URI } from "@/lib/reports/logoAsset";
import type { MonthlyReport, ReportProcess } from "@/lib/reports/monthlyReport";

// Lienzo del template: 20" × 11.25" (16:9).
const W = 20;
const H = 11.25;
const MX = 1.1; // margen lateral
const CONTENT_W = W - MX * 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pptx = any;

function addLogo(slide: Slide, logo: string | null, x = MX, y = 0.7) {
  if (logo) slide.addImage({ data: logo, x, y, w: 2.0, h: 0.75, sizing: { type: "contain", w: 2.0, h: 0.75 } });
}

/** Píldora (badge) estilo AIGS: fondo surfaceStrong, texto caption-strong. */
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

// --- KPI callout (estilo slide "Key metrics this period") -------------------
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
  y: number
) {
  const gap = 0.3;
  const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  cards.forEach((c, i) => kpiCard(slide, pres, { ...c, x: MX + i * (w + gap), y, w, h: 2.3 }));
}

// --- Slides -----------------------------------------------------------------

function coverSlide(pres: Pptx, r: MonthlyReport, logo: string | null) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  addLogo(s, logo);
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

function sectionSlide(pres: Pptx, moduleLabel: string, title: string, logo: string | null) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  addLogo(s, logo);
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
    return;
  }

  // KPIs de cabecera.
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

  // Tabla de rutas.
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

  // Alto de fila ajustado para caber en la diapositiva.
  const rowH = Math.min(0.42, (H - 4.9) / Math.max(1, body.length + 2));
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
}

function procesoSlide(pres: Pptx, r: MonthlyReport, p: ReportProcess) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  const faseTxt = p.fase ? " · espera 1ª maleta" : "";
  slideTitle(s, `Mediciones de tiempos — ${p.proceso}`, `${r.airport.short ?? r.airport.name}${faseTxt} · ${r.monthLabel}`);

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

  // Evolutivo (líneas prom/mediana/p90 + estándar) sobre la temporada.
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
    y: 4.7,
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
    y: 5.2,
    w: CONTENT_W,
    h: H - 5.2 - 0.7,
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
}

function closingSlide(pres: Pptx, logo: string | null) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  addLogo(s, logo);
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
  s.addText(
    [
      { text: "Consultas y detalle del levantamiento a disposición.\n", options: { fontSize: 16, color: AIGS.body } },
      { text: "jolave@aerodromosigs.cl · aerodromosigs.cl", options: { fontSize: 14, color: AIGS.muted } },
    ],
    { x: MX, y: 6.2, w: CONTENT_W, h: 1.2, fontFace: FONT.face, margin: 0, lineSpacingMultiple: 1.3 }
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Construye el deck completo y devuelve los bytes del .pptx. */
export async function buildDeck(r: MonthlyReport): Promise<Uint8Array> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "AIGS", width: W, height: H });
  pres.layout = "AIGS";
  pres.author = "Aeródromos IGS";
  pres.title = `Informe mensual ${r.airport.name} · ${r.monthLabel}`;

  const logo = LOGO_DATA_URI;

  coverSlide(pres, r, logo);

  sectionSlide(pres, "Módulo 01", "Encuestas ASQ", logo);
  asqSlide(pres, r);

  sectionSlide(pres, "Módulo 02", "Mediciones de tiempos", logo);
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
  } else {
    for (const p of r.processes) procesoSlide(pres, r, p);
  }

  closingSlide(pres, logo);

  const out = (await pres.write({ outputType: "nodebuffer" })) as Uint8Array;
  return out;
}
