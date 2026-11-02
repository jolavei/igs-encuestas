// Generador del PPTX editable del informe mensual. Usa los tokens AIGS con charts
// nativos (portada/cierre sobrios con logo + badge, sin foto de fondo).
// Server-only (runtime nodejs). Import dinámico para no forzar el bundle.

import { AIGS, FONT, SERIES, fmtInt, fmtMMSS, pct, fmtScore, fmtScore2, fmtNps, scoreColor, npsColor, processAxes, stackPointLabels } from "@/lib/reports/design";
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
  AGA_GUIDE_KPIS_SEASON,
  AGA_GUIDE_PERIOD_NOTE_SEASON,
} from "@/lib/reports/agaGuide";
import {
  ASQ_NOTE,
  KIND_BADGE,
  asqMatrix,
  serviceSplitRows,
  coverScope,
  execSummaryCards,
  tiemposSummaryRows,
} from "@/lib/reports/seasonSlides";
import {
  agaCompareScene,
  agaEvolutionScene,
  agaMapScene,
  agaSeasonScene,
  asqAirlinesScene,
  asqBenchmarkScene,
  asqCategoriesScene,
  asqGeneralScene,
  asqGroupScene,
  asqGuideScene,
  asqHistoryBenchScene,
  asqHistoryScene,
  asqIndicesScene,
  asqKeyPointsScene,
  asqProfileScene,
  tiemposHistoryScene,
  tiemposHotspotScene,
} from "@/lib/reports/seasonScenes";
import { PT_PER_PX, PX_PER_IN, iconFor, type Scene } from "@/lib/reports/scene";
import { ICON_DATA_URI } from "@/lib/reports/iconAssets";
import { buildOutline, outlineInputFrom } from "@/lib/reports/outline";
import type { ModuleKey, ModuleNotes } from "@/lib/reports/modules";

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
const isSeasonal = (r: MonthlyReport) => (r.kind ?? "MENSUAL") !== "MENSUAL";

/** Wordmark "AERÓDROMOS.IGS" (solo texto) en la esquina inferior de las diapositivas de contenido. */
function addBottomLogo(slide: Slide) {
  slide.addImage({ data: LOGO_TEXT_DATA_URI, x: MX, y: H - 0.55, w: 2.0, h: 0.22, sizing: { type: "contain", w: 2.0, h: 0.22 } });
}

// "Aeropuerto El Loa - Calama" -> "Aeropuerto El Loa, Calama"
function airportFull(r: MonthlyReport): string {
  return r.airport.companyName.replace(" - ", ", ");
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

/** Dibuja una escena (semestral/anual) con formas y texto editables. */
function addScene(pres: Pptx, scene: Scene) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, scene.title, scene.subtitle);
  const inch = (px: number) => px / PX_PER_IN;
  for (const p of scene.prims) {
    if (p.k === "img") {
      s.addImage({ data: ICON_DATA_URI[p.icon], x: inch(p.x), y: inch(p.y), w: inch(p.w), h: inch(p.h) });
    } else if (p.k === "line") {
      const w = Math.abs(p.x2 - p.x1);
      const h = Math.abs(p.y2 - p.y1);
      // La línea va de esquina a esquina de su caja: sube si los extremos están invertidos.
      const rising = (p.x2 - p.x1) * (p.y2 - p.y1) < 0;
      s.addShape(pres.ShapeType.line, {
        x: inch(Math.min(p.x1, p.x2)),
        y: inch(Math.min(p.y1, p.y2)),
        w: inch(w),
        h: inch(h),
        flipV: rising,
        line: { color: p.color, width: (p.width ?? 1) * PT_PER_PX, ...(p.dash ? { dashType: "dash" } : {}) },
      });
    } else if (p.k === "dot") {
      s.addShape(pres.ShapeType.ellipse, {
        x: inch(p.cx - p.r),
        y: inch(p.cy - p.r),
        w: inch(p.r * 2),
        h: inch(p.r * 2),
        fill: { color: p.fill },
        line: p.stroke ? { color: p.stroke, width: 1.5 } : { type: "none" },
      });
    } else {
      const shape = {
        x: inch(p.x),
        y: inch(p.y),
        w: inch(p.w),
        h: inch(p.h),
        ...(p.fill ? { fill: { color: p.fill } } : {}),
        line: p.stroke ? { color: p.stroke, width: (p.strokeW ?? 1) * PT_PER_PX } : { type: "none" },
        ...(p.radius ? { rectRadius: inch(p.radius) } : {}),
      };
      const kind = p.radius ? pres.ShapeType.roundRect : pres.ShapeType.rect;
      if (p.text == null || p.text === "") {
        if (p.fill || p.stroke) s.addShape(kind, shape);
        continue;
      }
      const size = (p.size ?? 12) * PT_PER_PX;
      const text =
        typeof p.text === "string"
          ? p.text
          : p.text.map((r) => ({
              text: r.text,
              options: {
                ...(r.color ? { color: r.color } : {}),
                ...(r.bold ? { bold: true } : {}),
                ...(r.mono ? { fontFace: FONT.mono } : {}),
                ...(r.size ? { fontSize: r.size * PT_PER_PX } : {}),
              },
            }));
      s.addText(text, {
        ...shape,
        ...(p.fill || p.stroke ? { shape: kind } : {}),
        fontFace: p.mono ? FONT.mono : FONT.face,
        fontSize: size,
        color: p.color ?? AIGS.body,
        bold: !!p.bold,
        italic: !!p.italic,
        align: p.align ?? "left",
        valign: p.valign ?? "top",
        margin: 0,
        wrap: !p.nowrap,
      });
    }
  }
  addBottomLogo(s);
}

// --- Slides -----------------------------------------------------------------

function coverSlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  addLogo(s);
  addBadge(s, pres, KIND_BADGE[r.kind ?? "MENSUAL"], MX, 4.3, AIGS.blue);
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
        text: `${coverScope(r)} · ${r.monthLabel}`,
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

// "avance al 30-09-2026" (+ aviso si la foto es posterior al cierre del mes).
function asqAsOfText(a: NonNullable<MonthlyReport["asq"]>): string {
  const d = a.asOf.split("-").reverse().join("-");
  return a.afterMonthEnd ? `avance al ${d} (posterior al cierre del mes)` : `avance al ${d}`;
}

function asqSlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  const a = r.asq;
  slideTitle(
    s,
    "Encuestas ACI ASQ",
    a ? `${airportFull(r)} · ${a.seasonLabel.replace("-", " ")} · ${asqAsOfText(a)}` : airportFull(r)
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
  yMax: number,
  at?: number | null // atención promedio (desde oct-2026); undefined = no se muestra
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
      ...(at !== undefined ? [{ text: ` at. ${fmtMMSS(at)}`, options: { fontFace: FONT.face, fontSize: 8, bold: true, color: SERIES.at } }] : []),
    ],
    { x: x + w * 0.5, y: y + 0.1, w: w * 0.5 - 0.12, h: 0.3, align: "right", valign: "middle", margin: 0 }
  );
  // Ejes visibles con la escala Y (minutos) común de los mini; meses cortos en X.
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
    valAxisMajorUnit: yMax / 2,
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
  // Mensual: abajo el acumulado de la temporada ("Periodo"); semestral/anual: solo la temporada.
  const sub = (v: string) => (isSeasonal(r) ? undefined : `Periodo ${v}`);
  // Desde oct-2026: KPIs grandes = FILA (Estándar IATA) y la atención en una franja, sin meta.
  const sv = p.service?.kpi ? p.service : null;
  const fila = (l: string) => (sv ? `Fila · ${l.toLowerCase()}` : l);
  const marginCard =
    p.meta == null
      ? { label: "Estándar IATA", value: "—", sub: "sin estándar" }
      : {
          label: sv ? "Margen fila vs Est. IATA" : "Margen vs Est. IATA",
          value: fmtMMSS(p.margin),
          sub: sub(fmtMMSS(seasonMargin)),
          valueColor: p.margin == null ? AIGS.muted : marginOk ? AIGS.up : AIGS.down,
        };

  // KPIs: número del mes en grande + promedio del periodo abajo (pequeño).
  kpiRow(
    s,
    pres,
    [
      { label: fila("Promedio"), value: kpi ? fmtMMSS(kpi.prom) : "—", sub: sub(fmtMMSS(p.kpiSeason.prom)) },
      { label: fila("P90"), value: kpi ? fmtMMSS(kpi.p90) : "—", sub: sub(fmtMMSS(p.kpiSeason.p90)) },
      { label: fila("Mediana"), value: kpi ? fmtMMSS(kpi.med) : "—", sub: sub(fmtMMSS(p.kpiSeason.med)) },
      marginCard,
      { label: "N° de mediciones", value: fmtInt(kpi ? kpi.n : 0), sub: sub(fmtInt(p.kpiSeason.n)) },
    ],
    2.1
  );

  const hasMini = p.byAirline.length > 0;
  const axes = processAxes(p, sv?.series);
  const axis = axes.main;

  if (sv) {
    const k = sv.kpi!;
    s.addShape(pres.ShapeType.rect, { x: MX, y: 4.27, w: 0.06, h: 0.32, fill: { color: SERIES.at }, line: { type: "none" } });
    s.addText(
      [
        { text: "Atención (sin meta)   ", options: { bold: true, color: AIGS.ink } },
        { text: "promedio ", options: { color: AIGS.body } },
        { text: fmtMMSS(k.prom), options: { bold: true, color: AIGS.ink, fontFace: FONT.mono } },
        { text: `   P90 ${fmtMMSS(k.p90)}   mediana ${fmtMMSS(k.med)}   · Total fila + atención `, options: { color: AIGS.body } },
        { text: fmtMMSS(k.totProm), options: { bold: true, color: AIGS.ink, fontFace: FONT.mono } },
        {
          text: `   n=${fmtInt(k.n)}${!isSeasonal(r) && sv.period ? ` · Periodo atención ${fmtMMSS(sv.period.prom)}` : ""}`,
          options: { color: AIGS.muted },
        },
      ],
      { x: MX + 0.15, y: 4.25, w: CONTENT_W - 0.15, h: 0.36, fontFace: FONT.face, fontSize: 12, valign: "middle", margin: 0 }
    );
  }

  // Evolutivo principal (minutos). Legenda abajo.
  const labels = p.series.map((x) => x.label);
  const data: { name: string; labels: string[]; values: (number | null)[] }[] = [
    { name: sv ? "Fila · promedio" : "Promedio", labels, values: p.series.map((x) => (x.prom == null ? null : round1(x.prom))) },
    { name: "Mediana", labels, values: p.series.map((x) => (x.med == null ? null : round1(x.med))) },
    { name: "p90", labels, values: p.series.map((x) => (x.p90 == null ? null : round1(x.p90))) },
  ];
  const chartColors: string[] = [SERIES.prom, SERIES.med, SERIES.p90];
  if (p.meta != null) {
    data.push({ name: "Estándar IATA", labels, values: labels.map(() => p.meta as number) });
    chartColors.push(SERIES.meta);
  }
  if (sv) {
    data.push({ name: "Atención · promedio", labels, values: sv.series.map((v) => (v == null ? null : round1(v))) });
    chartColors.push(SERIES.at);
  }

  s.addText("Evolutivo", {
    x: MX,
    y: hasMini ? (sv ? 4.62 : 4.5) : 4.7,
    w: CONTENT_W,
    h: 0.4,
    fontFace: FONT.face,
    fontSize: 14,
    bold: true,
    color: AIGS.ink,
    margin: 0,
  });
  const chartY = hasMini ? (sv ? 5.02 : 4.95) : 5.2;
  const chartH = hasMini ? (sv ? 2.4 : 2.45) : 5.0;
  // Área de trazado fija (pulgadas) para ubicar las etiquetas de valor sobre los puntos.
  const plot = { x: MX + 0.7, y: chartY + 0.25, w: CONTENT_W - 0.85, h: chartH - 0.95 };
  s.addChart(pres.ChartType.line, data, {
    x: MX,
    y: chartY,
    w: CONTENT_W,
    h: chartH,
    layout: { x: 0.7 / CONTENT_W, y: 0.25 / chartH, w: plot.w / CONTENT_W, h: plot.h / chartH },
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
    valAxisMaxVal: axis.max,
    valAxisMajorUnit: axis.step,
    valGridLine: { color: "EEF2F6", size: 0.5 },
    catGridLine: { style: "none" },
  });

  // Valor (mm:ss) sobre cada punto de fila/promedio y atención. pptxgenjs solo etiqueta todas
  // las series a la vez y en decimales, por eso van como texto sobre el gráfico.
  const yOf = (v: number | null | undefined) => (v == null ? null : plot.y + plot.h * (1 - v / axis.max));
  const labelH = 0.2;
  const pointLabel = (i: number, base: number | null, v: number | null | undefined, color: string) => {
    if (base == null) return;
    s.addText(fmtMMSS(v), {
      x: plot.x + ((i + 0.5) / labels.length) * plot.w - 0.45,
      y: Math.max(chartY, base - labelH),
      w: 0.9,
      h: labelH,
      fontFace: FONT.mono,
      fontSize: 11,
      bold: true,
      color,
      align: "center",
      valign: "bottom",
      margin: 0,
    });
  };
  p.series.forEach((x, i) => {
    const at = sv?.series[i];
    const [promBase, atBase] = stackPointLabels(yOf(x.prom), yOf(at), 0.07, labelH);
    pointLabel(i, promBase, x.prom, SERIES.prom);
    pointLabel(i, atBase, at, SERIES.at);
  });

  // Mini-gráficos por aerolínea (Check in / Retiro), con una escala Y común entre ellos.
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
    cards.forEach((a, i) =>
      miniAirlineChart(s, pres, a, MX + i * (w + gap), 7.95, w, 2.35, axes.mini.max, sv ? sv.byAirline[a.airline] ?? null : undefined)
    );
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
  const kpis = isSeasonal(r) ? AGA_GUIDE_KPIS_SEASON : AGA_GUIDE_KPIS;
  const cardW = (CONTENT_W - gap * (kpis.length - 1)) / kpis.length;
  const cardY = 2.15;
  const cardH = 3.65;
  kpis.forEach((k, i) => {
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
  s.addText(isSeasonal(r) ? AGA_GUIDE_PERIOD_NOTE_SEASON : AGA_GUIDE_PERIOD_NOTE, {
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
// Diapositiva de texto: comentarios y sugerencias, análisis por módulo o recomendaciones.
function textSlide(pres: Pptx, r: MonthlyReport, title: string, comentarios: string) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, title, `${airportFull(r)} · ${r.monthLabel}`);

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

/** Diapositiva "Fotografías": grilla 2×2 (máx. 4 fotos), descripción bajo cada una. */
function photosSlide(pres: Pptx, r: MonthlyReport, group: DeckPhotoData[], gi: number, total: number) {
  const gap = 0.3;
  const top = 2.2;
  const bottom = H - 0.9;
  const cellW = (CONTENT_W - gap) / 2;
  const cellH = (bottom - top - gap) / 2;

  {
    const s = pres.addSlide();
    s.background = { color: AIGS.white };
    slideTitle(s, "Fotografías", `${airportFull(r)} · ${r.monthLabel}${total > 1 ? ` · ${gi + 1}/${total}` : ""}`);

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
  }
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

export type DeckEdition = {
  modules: ModuleKey[]; // encendidos, en el orden de la plantilla
  notes: ModuleNotes;
  comentarios: string;
  photos: DeckPhotoData[];
};

/**
 * Construye el deck completo y devuelve los bytes del .pptx. La secuencia de
 * diapositivas sale de buildOutline (la misma que el informe HTML).
 */
export async function buildDeck(r: MonthlyReport, edition: DeckEdition): Promise<Uint8Array> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "AIGS", width: W, height: H });
  pres.layout = "AIGS";
  pres.author = "Aeródromos IGS";
  pres.title = `${KIND_BADGE[r.kind ?? "MENSUAL"]} ${r.airport.name} · ${r.monthLabel}`;

  const slides = buildOutline(
    outlineInputFrom(r, {
      modules: edition.modules,
      notes: edition.notes,
      comentarios: edition.comentarios,
      photosCount: edition.photos.length,
    })
  );

  for (const spec of slides) {
    switch (spec.type) {
      case "cover":
        coverSlide(pres, r);
        break;
      case "section":
        sectionSlide(pres, spec.module, spec.title);
        break;
      case "asq":
        asqSlide(pres, r);
        break;
      case "tiempos-empty":
        emptyTiemposSlide(pres, r);
        break;
      case "proceso":
        procesoSlide(pres, r, r.processes[spec.index]);
        break;
      case "aga-guide":
        agaGuideSlide(pres, r);
        break;
      case "aga":
        if (isSeasonal(r)) addScene(pres, agaSeasonScene(r, spec.index));
        else agaSlide(pres, r, r.aga[spec.index]);
        break;
      case "voice":
        voiceSlide(pres, r, r.aga[spec.index]);
        break;
      case "text":
        textSlide(pres, r, spec.title, spec.body);
        break;
      case "photos":
        photosSlide(pres, r, edition.photos.slice(spec.start, spec.start + spec.count), spec.index, spec.total);
        break;
      case "closing":
        closingSlide(pres);
        break;
      case "exec-summary":
        execSummarySlide(pres, r, spec.body);
        break;
      case "tiempos-summary":
        tiemposSummarySlide(pres, r);
        break;
      case "tiempos-split":
        tiemposSplitSlide(pres, r);
        break;
      case "tiempos-history":
        addScene(pres, tiemposHistoryScene(r));
        break;
      case "tiempos-hotspot":
        addScene(pres, tiemposHotspotScene(r, spec.index));
        break;
      case "aga-evolution":
        addScene(pres, agaEvolutionScene(r, spec.index));
        break;
      case "aga-map":
        addScene(pres, agaMapScene(r, spec.index));
        break;
      case "aga-compare":
        addScene(pres, agaCompareScene(r));
        break;
      case "asq-empty":
        asqEmptySlide(pres, r);
        break;
      default: {
        // Resultados ACI ASQ (el outline solo los pide si hay datos).
        const a = r.seasonal?.asq;
        if (!a) asqEmptySlide(pres, r);
        else if (spec.type === "asq-guide") addScene(pres, asqGuideScene());
        else if (spec.type === "asq-overall") addScene(pres, asqKeyPointsScene(r, a));
        else if (spec.type === "asq-profile") addScene(pres, asqProfileScene(r, a));
        else if (spec.type === "asq-categories") addScene(pres, asqCategoriesScene(r, a));
        else if (spec.type === "asq-group") addScene(pres, asqGroupScene(r, a, spec.index));
        else if (spec.type === "asq-general") addScene(pres, asqGeneralScene(r, a));
        else if (spec.type === "asq-airlines") addScene(pres, asqAirlinesScene(r, a));
        else if (spec.type === "asq-indices") addScene(pres, asqIndicesScene(r, a));
        else if (spec.type === "asq-benchmark") addScene(pres, asqBenchmarkScene(r, a));
        else if (spec.type === "asq-ranking") asqRankingSlide(pres, r, a);
        else if (spec.type === "asq-matrix") asqMatrixSlide(pres, r, a);
        else if (spec.type === "asq-history") addScene(pres, asqHistoryScene(r, a));
        else if (spec.type === "asq-history-bench") addScene(pres, asqHistoryBenchScene(r, a));
      }
    }
  }

  const out = (await pres.write({ outputType: "nodebuffer" })) as Uint8Array;
  return out;
}

function emptyTiemposSlide(pres: Pptx, r: MonthlyReport) {
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
}

// ---------------------------------------------------------------------------
// Semestral / anual
// ---------------------------------------------------------------------------

type Cell = { text: string; options: Record<string, unknown> };
const headCell = (t: string, align: "left" | "right"): Cell => ({
  text: t,
  options: { bold: true, color: AIGS.muted, fill: { color: AIGS.surfaceSoft }, align, valign: "middle", fontSize: 12 },
});

/** Resumen ejecutivo: cifras clave de cada módulo + texto del consultor (si lo hay). */
function execSummarySlide(pres: Pptx, r: MonthlyReport, body: string) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, "Resumen ejecutivo", `${airportFull(r)} · ${r.monthLabel}`);
  const cards = execSummaryCards(r).slice(0, 4);
  if (cards.length) kpiRow(s, pres, cards, 2.1, 2.6);
  const text = body.trim();
  if (text) {
    const y = cards.length ? 5.1 : 2.2;
    const h = H - y - 0.9;
    s.addShape(pres.ShapeType.roundRect, {
      x: MX, y, w: CONTENT_W, h, fill: { color: AIGS.surfaceSoft }, line: { color: AIGS.hairline, width: 0.75 }, rectRadius: 0.1,
    });
    s.addText(text, {
      x: MX + 0.4, y: y + 0.3, w: CONTENT_W - 0.8, h: h - 0.6, fontFace: FONT.face, fontSize: 17, color: AIGS.body,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.2, fit: "shrink",
    });
  }
  addBottomLogo(s);
}

/** Todos los procesos de la temporada vs Estándar IATA y vs la temporada de comparación. */
function tiemposSummarySlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, "Tiempos vs Estándar IATA", `${airportFull(r)} · ${r.monthLabel}`);
  const rows = tiemposSummaryRows(r);
  const sv = rows.some((x) => x.atencion != null);
  const head = [
    "",
    "Proceso",
    sv ? "Fila prom." : "Promedio",
    "Mediana",
    "P90",
    "Mediciones",
    "Est. IATA",
    "Margen",
    ...(sv ? ["Atención", "Total"] : []),
  ].map((t, i) =>
    headCell(t, i <= 1 ? "left" : "right")
  );
  const mono = (text: string, color: string = AIGS.body, bold = false): Cell => ({
    text,
    options: { align: "right", fontFace: FONT.mono, color, bold },
  });
  const body = rows.map((x) => [
    { text: "", options: { align: "left" } }, // el ícono va encima, en su propia columna
    { text: x.label, options: { align: "left", color: AIGS.ink } },
    mono(fmtMMSS(x.prom), AIGS.ink, true),
    mono(fmtMMSS(x.med)),
    mono(fmtMMSS(x.p90)),
    mono(fmtInt(x.n)),
    mono(x.meta != null ? fmtMMSS(x.meta) : "—"),
    mono(
      x.margin == null ? "—" : `${x.margin >= 0 ? "" : "−"}${fmtMMSS(Math.abs(x.margin))}`,
      x.margin == null ? AIGS.muted : x.margin >= 0 ? AIGS.up : AIGS.down,
      true
    ),
    ...(sv
      ? [mono(x.atencion != null ? fmtMMSS(x.atencion) : "—", SERIES.at), mono(x.total != null ? fmtMMSS(x.total) : "—")]
      : []),
  ]);
  const colW = (sv ? [0.05, 0.23, 0.09, 0.09, 0.09, 0.09, 0.09, 0.09, 0.09, 0.09] : [0.05, 0.29, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11]).map(
    (f) => CONTENT_W * f
  );
  s.addTable([head, ...body], {
    x: MX, y: 2.2, w: CONTENT_W, colW, rowH: 0.62, fontFace: FONT.face, fontSize: 14, color: AIGS.body, valign: "middle",
    border: { type: "solid", color: AIGS.hairline, pt: 0.5 }, autoPage: false,
  });
  rows.forEach((x, i) => {
    const name = iconFor(x.label);
    if (name) s.addImage({ data: ICON_DATA_URI[name], x: MX + 0.1, y: 2.2 + 0.62 * (i + 1) + 0.04, w: 0.54, h: 0.54 });
  });
  s.addText(
    `Margen = Estándar IATA − promedio de fila (verde: dentro del estándar). La evolución por temporada va en el evolutivo de tiempos.${
      sv ? " Atención = salida de la fila a fin de la atención (sin meta); total = fila + atención." : ""
    }${
      r.season.to < "2026-10-01" ? " Hasta septiembre de 2026 se mide solo el tiempo de fila." : ""
    }`,
    { x: MX, y: 2.2 + 0.62 * (body.length + 1) + 0.25, w: CONTENT_W, h: 0.7, fontFace: FONT.face, fontSize: 11, color: AIGS.muted, margin: 0, valign: "top" }
  );
  addBottomLogo(s);
}

// ---------------------------------------------------------------------------
// ACI ASQ · resultados (semestral / anual)
// ---------------------------------------------------------------------------

type AsqData = NonNullable<NonNullable<MonthlyReport["seasonal"]>["asq"]>;

function asqNote(s: Slide) {
  s.addText(ASQ_NOTE, {
    x: W - MX - 12, y: H - 0.62, w: 12, h: 0.3, fontFace: FONT.face, fontSize: 10, color: AIGS.muted, align: "right", margin: 0,
  });
}

/** Barra horizontal (fondo + relleno proporcional). */
function hbar(s: Slide, pres: Pptx, x: number, y: number, w: number, h: number, frac: number, color: string) {
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: AIGS.surfaceSoft }, line: { type: "none" } });
  if (frac > 0) s.addShape(pres.ShapeType.rect, { x, y, w: Math.max(0.02, w * Math.min(1, frac)), h, fill: { color }, line: { type: "none" } });
}

function asqEmptySlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, "Encuestas ACI ASQ · Resultados", `${airportFull(r)} · ${r.seasonal?.focusLabel ?? ""}`);
  s.addText(
    r.seasonal?.asqError
      ? "No se pudo leer la base ACI ASQ (BigQuery)."
      : `La base ACI ASQ de ${r.seasonal?.focusLabel ?? "la temporada"} aún no tiene encuestas de este aeropuerto. Se carga en Ingesta ASQ cuando ACI la publica.`,
    { x: MX, y: 5, w: CONTENT_W, h: 1, fontFace: FONT.face, fontSize: 18, color: AIGS.muted, align: "center", margin: 0 }
  );
  addBottomLogo(s);
}

function asqRankingSlide(pres: Pptx, r: MonthlyReport, a: AsqData) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, "Ranking de satisfacción general", `${airportFull(r)} · ${a.season.label} · nota 1–5`);
  const colGap = 0.8;
  const colW = (CONTENT_W - colGap) / 2;
  const top = 2.3;
  const rowH = Math.min(0.42, 7.6 / Math.max(a.rankingAll.length, a.rankingChile.length, 1));
  const fs = Math.max(9, Math.min(12, Math.floor(rowH * 28)));
  const col = (x: number, title: string, rows: AsqData["rankingAll"]) => {
    s.addText(title, { x, y: top - 0.5, w: colW, h: 0.4, fontFace: FONT.face, fontSize: 14, bold: true, color: AIGS.ink, margin: 0 });
    rows.forEach((row, i) => {
      const y = top + i * rowH;
      const t = { y, h: rowH, fontFace: FONT.face, fontSize: fs, valign: "middle" as const, margin: 0, bold: row.own, color: row.own ? AIGS.ink : AIGS.body };
      s.addText(String(i + 1), { ...t, x, w: 0.35, align: "right", color: AIGS.muted, fontFace: FONT.mono });
      s.addText(`${row.code} · ${row.name.replace(/ (International )?Airport$/i, "")}${!row.chile && row.country ? ` (${row.country})` : ""}`, {
        ...t, x: x + 0.45, w: colW * 0.5, fit: "shrink",
      });
      hbar(s, pres, x + 0.55 + colW * 0.5, y + rowH * 0.28, colW * 0.36, rowH * 0.44, row.avg / 5, row.own ? AIGS.blue : row.chile ? "8DB0BB" : AIGS.surfaceStrong);
      s.addText(fmtScore2(row.avg), { ...t, x: x + colW - 0.6, w: 0.6, align: "right", fontFace: FONT.mono });
    });
  };
  col(MX, `Aeropuertos chilenos (${a.rankingChile.length})`, a.rankingChile);
  col(MX + colW + colGap, `Programa regional (${a.rankingAll.length} aeropuertos)`, a.rankingAll);
  asqNote(s);
  addBottomLogo(s);
}

const QUADRANT_COLOR: Record<string, string> = {
  "Fortaleza clave": AIGS.up,
  "Mejorar con prioridad": AIGS.down,
  Mantener: "3D7593",
  "Menor prioridad": "A9B2BF",
};

function asqMatrixSlide(pres: Pptx, r: MonthlyReport, a: AsqData) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, "Importancia vs puntaje", `${airportFull(r)} · ${a.season.label} · importancia declarada por los pasajeros vs nota del atributo`);
  const { pts, midImp, midScore, quadrant, priority, strengths, number } = asqMatrix(a.attributes);
  const box = { x: MX + 0.6, y: 2.2, w: 11.4, h: 7.2 };
  const maxImp = Math.max(10, ...pts.map((p) => p.importance)) * 1.1;
  const sMin = Math.min(...pts.map((p) => p.airport)) - 0.15;
  const sMax = Math.max(...pts.map((p) => p.airport)) + 0.15;
  const px = (v: number) => box.x + (v / maxImp) * box.w;
  const py = (v: number) => box.y + (1 - (v - sMin) / (sMax - sMin)) * box.h;
  const line = (x: number, y: number, w: number, h: number, dash = false) =>
    s.addShape(pres.ShapeType.line, { x, y, w, h, line: { color: dash ? AIGS.muted : AIGS.hairline, width: 1, dashType: dash ? "dash" : "solid" } });
  line(box.x, box.y + box.h, box.w, 0);
  line(box.x, box.y, 0, box.h);
  line(px(midImp), box.y, 0, box.h, true);
  line(box.x, py(midScore), box.w, 0, true);
  const corner = (text: string, x: number, y: number, align: "left" | "right", color: string) =>
    s.addText(text, { x: align === "left" ? x : x - 3, y, w: 3, h: 0.3, fontFace: FONT.face, fontSize: 11, bold: true, color, align, margin: 0 });
  corner("Fortaleza clave", box.x + box.w, box.y, "right", AIGS.up);
  corner("Mejorar con prioridad", box.x + box.w, box.y + box.h - 0.35, "right", AIGS.down);
  corner("Mantener", box.x + 0.1, box.y, "left", "3D7593");
  corner("Menor prioridad", box.x + 0.1, box.y + box.h - 0.35, "left", AIGS.muted);
  for (const v of [0, 10, 20, 30, 40, 50, 60].filter((v) => v <= maxImp))
    s.addText(`${v}%`, { x: px(v) - 0.4, y: box.y + box.h + 0.05, w: 0.8, h: 0.3, fontFace: FONT.face, fontSize: 10, color: AIGS.muted, align: "center", margin: 0 });
  for (const v of [sMin, (sMin + sMax) / 2, sMax])
    s.addText(fmtScore2(v), { x: box.x - 0.65, y: py(v) - 0.15, w: 0.55, h: 0.3, fontFace: FONT.face, fontSize: 10, color: AIGS.muted, align: "right", margin: 0 });
  s.addText("Importancia (% que lo elige entre sus 3 más importantes)", {
    x: box.x, y: box.y + box.h + 0.35, w: box.w, h: 0.3, fontFace: FONT.face, fontSize: 10, color: AIGS.muted, align: "center", margin: 0,
  });
  for (const p of pts) {
    const cx = px(p.importance);
    const cy = py(p.airport);
    s.addShape(pres.ShapeType.ellipse, { x: cx - 0.08, y: cy - 0.08, w: 0.16, h: 0.16, fill: { color: QUADRANT_COLOR[quadrant(p)] }, line: { type: "none" } });
    if (number.has(p))
      s.addText(String(number.get(p)), {
        x: cx + 0.1, y: cy - 0.15, w: 0.4, h: 0.3, fontFace: FONT.face, fontSize: 11, bold: true, color: AIGS.ink, margin: 0,
      });
  }
  const listX = box.x + box.w + 0.6;
  const listW = W - MX - listX;
  let y = box.y;
  for (const b of [
    { title: "Mejorar con prioridad", color: AIGS.down, rows: priority },
    { title: "Fortalezas clave", color: AIGS.up, rows: strengths },
  ]) {
    s.addText(b.title, { x: listX, y, w: listW, h: 0.35, fontFace: FONT.face, fontSize: 13, bold: true, color: b.color, margin: 0 });
    y += 0.4;
    const rows = b.rows;
    if (!rows.length) {
      s.addText("Ninguno.", { x: listX, y, w: listW, h: 0.3, fontFace: FONT.face, fontSize: 11, color: AIGS.muted, margin: 0 });
      y += 0.4;
    }
    for (const p of rows) {
      s.addText(
        [
          { text: `${number.get(p)}. `, options: { color: AIGS.ink, bold: true } },
          { text: p.label, options: { color: AIGS.body } },
          { text: `   ${fmtScore2(p.airport)} · ${p.importance}%`, options: { color: AIGS.ink, fontFace: FONT.mono } },
        ],
        { x: listX, y, w: listW, h: 0.42, fontFace: FONT.face, fontSize: 10.5, margin: 0, valign: "middle", fit: "shrink" }
      );
      y += 0.46;
    }
    y += 0.3;
  }
  s.addText("Líneas: mediana de importancia y nota promedio de los atributos del aeropuerto. Atributos con al menos 10 respuestas.", {
    x: MX, y: H - 1.0, w: CONTENT_W, h: 0.3, fontFace: FONT.face, fontSize: 10, color: AIGS.muted, margin: 0,
  });
  addBottomLogo(s);
}

/** Fila vs atención por proceso (desde oct-2026): barras apiladas fila + atención = total. */
function tiemposSplitSlide(pres: Pptx, r: MonthlyReport) {
  const s = pres.addSlide();
  s.background = { color: AIGS.white };
  slideTitle(s, "Tiempos · fila vs atención", `${airportFull(r)} · ${r.monthLabel} · promedio por pasajero`);
  const rows = serviceSplitRows(r);
  const max = Math.max(1, ...rows.map((x) => x.total));
  s.addText(
    [
      { text: "■ ", options: { color: SERIES.prom } },
      { text: "Fila (desde el ingreso hasta llegar al counter o control)     ", options: { color: AIGS.muted } },
      { text: "■ ", options: { color: SERIES.at } },
      { text: "Atención (en el counter o control)", options: { color: AIGS.muted } },
    ],
    { x: MX, y: 2.0, w: CONTENT_W, h: 0.35, fontFace: FONT.face, fontSize: 11, margin: 0 }
  );
  const top = 2.6;
  const rowH = Math.min(1.1, 6.6 / Math.max(rows.length, 1));
  const labelW = 4.2;
  const valW = 5.0;
  const barX = MX + labelW + 0.2;
  const barW = CONTENT_W - labelW - valW - 0.4;
  rows.forEach((x, i) => {
    const y = top + i * rowH;
    s.addShape(pres.ShapeType.line, { x: MX, y, w: CONTENT_W, h: 0, line: { color: AIGS.hairline, width: 0.5 } });
    const name = isSeasonal(r) ? iconFor(x.label) : null;
    const size = Math.min(0.72, rowH - 0.12);
    if (name) s.addImage({ data: ICON_DATA_URI[name], x: MX, y: y + (rowH - size) / 2, w: size, h: size });
    const shift = name ? size + 0.15 : 0;
    s.addText(x.label, { x: MX + shift, y, w: labelW - shift, h: rowH, fontFace: FONT.face, fontSize: 14, color: AIGS.ink, valign: "middle", margin: 0 });
    const by = y + rowH / 2 - 0.17;
    const wf = (barW * x.fila) / max;
    const wa = (barW * x.atencion) / max;
    if (wf > 0) s.addShape(pres.ShapeType.rect, { x: barX, y: by, w: wf, h: 0.34, fill: { color: SERIES.prom }, line: { type: "none" } });
    if (wa > 0) s.addShape(pres.ShapeType.rect, { x: barX + wf, y: by, w: wa, h: 0.34, fill: { color: SERIES.at }, line: { type: "none" } });
    s.addText(
      [
        { text: `${fmtMMSS(x.fila)} + `, options: { color: AIGS.body } },
        { text: fmtMMSS(x.atencion), options: { color: SERIES.at } },
        { text: " = ", options: { color: AIGS.body } },
        { text: fmtMMSS(x.total), options: { color: AIGS.ink, bold: true } },
        { text: `  n=${fmtInt(x.n)}`, options: { color: AIGS.muted, fontFace: FONT.face, fontSize: 10 } },
      ],
      { x: MX + CONTENT_W - valW, y, w: valW, h: rowH, fontFace: FONT.mono, fontSize: 13, align: "right", valign: "middle", margin: 0 }
    );
  });
  s.addText(
    "El Estándar IATA aplica solo a la fila; la atención se informa sin meta. Fila = ingreso a la fila → salida de la fila; atención = salida de la fila → fin de la atención. Retiro de equipajes no aplica.",
    { x: MX, y: H - 1.25, w: CONTENT_W, h: 0.5, fontFace: FONT.face, fontSize: 11, color: AIGS.muted, margin: 0, valign: "top" }
  );
  addBottomLogo(s);
}
