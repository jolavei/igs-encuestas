"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Customized,
} from "recharts";
import { AIGS, SERIES, FONT, hx, fmtInt, fmtMMSS, pct, fmtScore, fmtScore2, fmtNps, scoreColor, npsColor, processAxes, stackPointLabels, timeAxis } from "@/lib/reports/design";
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
import { iconFor, type Prim, type ReportIcon, type Run, type Scene } from "@/lib/reports/scene";
import type { SeasonExtras } from "@/lib/reports/seasonReport";
import type { ReportKind } from "@/lib/reports/period";
import { buildOutline, outlineInputFrom, type SlideSpec } from "@/lib/reports/outline";
import type { ModuleKey, ModuleNotes } from "@/lib/reports/modules";

// Datos serializables que arma la página (server). Estructuralmente compatible
// con MonthlyReport de src/lib/reports/monthlyReport.ts.
export type DeckData = {
  kind?: ReportKind; // semestral/anual: monthLabel = periodo; "mes" = temporada de detalle
  seasonal?: SeasonExtras;
  airport: { code: string; name: string; short: string | null; companyName: string; sedeLabel: string | null };
  month: string;
  monthLabel: string;
  season: { label: string; from: string; to: string };
  asq:
    | {
        seasonLabel: string;
        asOf: string; // "YYYY-MM-DD" del avance mostrado
        afterMonthEnd: boolean;
        rows: { airlineDestination: string; target: number; collected: number }[];
        target: number;
        collected: number;
        pct: number;
      }
    | null;
  processes: {
    proceso: string;
    fase: string | null;
    faseLabel: string | null;
    meta: number | null;
    monthHasData: boolean;
    kpi: { n: number; prom: number; med: number; p90: number } | null;
    kpiSeason: { n: number; prom: number; med: number; p90: number };
    margin: number | null;
    series: { label: string; prom: number | null; med: number | null; p90: number | null }[];
    byAirline: {
      airline: string;
      label: string;
      meta: number | null;
      monthProm: number | null;
      monthN: number;
      series: { label: string; prom: number | null }[];
    }[];
    // Desde oct-2026: tiempo de atención (t3 − t2). Antes no existe (ni se muestra).
    service?: {
      kpi: { n: number; prom: number; med: number; p90: number; totProm: number; totMed: number; totP90: number } | null;
      period: { n: number; prom: number } | null;
      series: (number | null)[];
      byAirline: Record<string, number | null>;
    } | null;
  }[];
  bqError: string | null;
  aga: AgaDeck[];
};

type AgaScoreDeck = { label: string; avg: number | null; n: number };
type AgaStatsDeck = {
  n: number;
  nps: number | null;
  promotersPct: number | null;
  passivesPct: number | null;
  detractorsPct: number | null;
  sat: number | null;
  satTop2: number | null;
  ratingAvg?: number | null;
  ratingTop2?: number | null;
  attributes: AgaScoreDeck[];
  services: (AgaScoreDeck & { usePct: number | null; useN: number })[];
  items: { section: string; label: string; n: number; sum: number; avg: number | null; dist: number[] }[];
};
type AgaVoiceDeck = { appraisal: string | null; quotes: { label: string; text: string; nps: number | null }[] };
type AgaDeck = {
  audience: string;
  planTitle: string;
  target: number;
  month: AgaStatsDeck;
  period: AgaStatsDeck;
  voice: AgaVoiceDeck;
};

const SLIDE_W = 1280;
const SLIDE_H = 720;

export type DeckPhoto = { id: string; caption: string | null; url: string };

export default function ReportDeck({
  data,
  modules,
  notes,
  comentarios,
  photos,
  pptxHref,
  backHref,
}: {
  data: DeckData;
  modules: ModuleKey[]; // encendidos, en el orden de la plantilla
  notes: ModuleNotes;
  comentarios: string;
  photos: DeckPhoto[];
  pptxHref: string;
  backHref: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => setScale(Math.min(1, el.clientWidth / SLIDE_W));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slides = buildOutline(outlineInputFrom(data, { modules, notes, comentarios, photosCount: photos.length }));

  return (
    <div className="min-h-screen bg-slate-100" style={{ fontFamily: FONT.face }}>
      <PrintStyles />

      {/* Barra de acciones (no se imprime) */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <a href={backHref} className="text-sm text-slate-500 hover:text-slate-800">
            ← Editar informe
          </a>
          <p className="truncate text-sm font-medium text-slate-800">
            {data.airport.name} · {data.monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={pptxHref}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Descargar PPTX
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="deck-wrap mx-auto max-w-[1280px] px-3 py-6">
        {slides.map((spec, i) => (
          <Frame key={i} scale={scale}>
            <SlideFor spec={spec} data={data} photos={photos} />
          </Frame>
        ))}
      </div>
    </div>
  );
}

/* ---------- Diapositiva según el outline (mismo orden que el PPTX) ---------- */

function SlideFor({ spec, data, photos }: { spec: SlideSpec; data: DeckData; photos: DeckPhoto[] }) {
  switch (spec.type) {
    case "cover":
      return <Cover data={data} />;
    case "section":
      return <Section module={spec.module} title={spec.title} />;
    case "asq":
      return <AsqSlide data={data} />;
    case "tiempos-empty":
      return <EmptyTiempos data={data} />;
    case "proceso":
      return <ProcesoSlide data={data} p={data.processes[spec.index]} />;
    case "aga-guide":
      return <AgaGuideSlide data={data} />;
    case "aga":
      if ((data.kind ?? "MENSUAL") !== "MENSUAL") return <SceneSlide scene={agaSeasonScene(data, spec.index)} />;
      return <AgaSlide data={data} s={data.aga[spec.index]} />;
    case "voice":
      return <VoiceSlide data={data} s={data.aga[spec.index]} />;
    case "text":
      return <TextSlide data={data} title={spec.title} body={spec.body} />;
    case "photos":
      return (
        <PhotosSlide
          data={data}
          photos={photos.slice(spec.start, spec.start + spec.count)}
          index={spec.index}
          total={spec.total}
        />
      );
    case "closing":
      return <Closing />;
    case "exec-summary":
      return <ExecSummarySlide data={data} body={spec.body} />;
    case "tiempos-summary":
      return <TiemposSummarySlide data={data} />;
    case "tiempos-split":
      return <TiemposSplitSlide data={data} />;
    case "tiempos-history":
      return <SceneSlide scene={tiemposHistoryScene(data)} />;
    case "tiempos-hotspot":
      return <SceneSlide scene={tiemposHotspotScene(data, spec.index)} />;
    case "aga-evolution":
      return <SceneSlide scene={agaEvolutionScene(data, spec.index)} />;
    case "aga-map":
      return <SceneSlide scene={agaMapScene(data, spec.index)} />;
    case "aga-compare":
      return <SceneSlide scene={agaCompareScene(data)} />;
    case "asq-empty":
      return <AsqEmptySlide data={data} />;
  }
  // Resultados ACI ASQ (el outline solo los pide si hay datos).
  const a = data.seasonal?.asq;
  if (!a) return <AsqEmptySlide data={data} />;
  switch (spec.type) {
    case "asq-guide":
      return <SceneSlide scene={asqGuideScene()} />;
    case "asq-overall":
      return <SceneSlide scene={asqKeyPointsScene(data, a)} />;
    case "asq-profile":
      return <SceneSlide scene={asqProfileScene(data, a)} />;
    case "asq-categories":
      return <SceneSlide scene={asqCategoriesScene(data, a)} />;
    case "asq-group":
      return <SceneSlide scene={asqGroupScene(data, a, spec.index)} />;
    case "asq-general":
      return <SceneSlide scene={asqGeneralScene(data, a)} />;
    case "asq-airlines":
      return <SceneSlide scene={asqAirlinesScene(data, a)} />;
    case "asq-indices":
      return <SceneSlide scene={asqIndicesScene(data, a)} />;
    case "asq-benchmark":
      return <SceneSlide scene={asqBenchmarkScene(data, a)} />;
    case "asq-ranking":
      return <AsqRankingSlide data={data} a={a} />;
    case "asq-matrix":
      return <AsqMatrixSlide data={data} a={a} />;
    case "asq-history":
      return <SceneSlide scene={asqHistoryScene(data, a)} />;
    case "asq-history-bench":
      return <SceneSlide scene={asqHistoryBenchScene(data, a)} />;
  }
  return null;
}

/* ---------- Escenas (semestral / anual): mismas primitivas que el PPTX ---------- */

function SceneRuns({ text }: { text: string | Run[] }) {
  if (typeof text === "string") return <>{text}</>;
  return (
    <>
      {text.map((r, i) => (
        <span
          key={i}
          style={{
            color: r.color ? hx(r.color) : undefined,
            fontWeight: r.bold ? 700 : undefined,
            fontFamily: r.mono ? FONT.mono : undefined,
            fontSize: r.size,
          }}
        >
          {r.text}
        </span>
      ))}
    </>
  );
}

function SceneBox({ p }: { p: Extract<Prim, { k: "box" }> }) {
  const align = p.align ?? "left";
  const valign = p.valign ?? "top";
  return (
    <div
      title={p.tip}
      style={{
        position: "absolute",
        left: p.x,
        top: p.y,
        width: p.w,
        height: p.h,
        boxSizing: "border-box",
        background: p.fill ? hx(p.fill) : undefined,
        border: p.stroke ? `${p.strokeW ?? 1}px solid ${hx(p.stroke)}` : undefined,
        borderRadius: p.radius,
        display: "flex",
        alignItems: valign === "middle" ? "center" : valign === "bottom" ? "flex-end" : "flex-start",
        justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        textAlign: align,
        fontSize: p.size,
        lineHeight: 1.22,
        color: p.color ? hx(p.color) : undefined,
        fontWeight: p.bold ? 700 : 400,
        fontStyle: p.italic ? "italic" : undefined,
        fontFamily: p.mono ? FONT.mono : undefined,
        whiteSpace: p.nowrap ? "nowrap" : undefined,
      }}
    >
      {p.text != null && p.text !== "" && (
        <span>
          <SceneRuns text={p.text} />
        </span>
      )}
    </div>
  );
}

function IconImg({ icon, size, style }: { icon: ReportIcon; size: number; style?: React.CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/report/icons/${icon}.png`} alt="" style={{ width: size, height: size, flexShrink: 0, ...style }} />;
}

// Líneas y puntos consecutivos van en un mismo SVG; el orden de las primitivas define qué
// queda encima, igual que en el PPTX.
function SceneSlide({ scene }: { scene: Scene }) {
  const groups: (Extract<Prim, { k: "box" | "img" }> | Extract<Prim, { k: "line" | "dot" }>[])[] = [];
  for (const p of scene.prims) {
    if (p.k === "box" || p.k === "img") groups.push(p);
    else {
      const last = groups[groups.length - 1];
      if (Array.isArray(last)) last.push(p);
      else groups.push([p]);
    }
  }
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <SlideHead title={scene.title} subtitle={scene.subtitle} />
      {groups.map((g, i) =>
        Array.isArray(g) ? (
          <svg key={i} width={SLIDE_W} height={SLIDE_H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
            {g.map((p, j) =>
              p.k === "line" ? (
                <line
                  key={j}
                  x1={p.x1}
                  y1={p.y1}
                  x2={p.x2}
                  y2={p.y2}
                  stroke={hx(p.color)}
                  strokeWidth={p.width ?? 1}
                  strokeDasharray={p.dash ? "6 4" : undefined}
                  strokeLinecap="round"
                />
              ) : (
                <circle
                  key={j}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  fill={hx(p.fill)}
                  stroke={p.stroke ? hx(p.stroke) : undefined}
                  strokeWidth={p.stroke ? 2 : undefined}
                  style={p.tip ? { pointerEvents: "auto" } : undefined}
                >
                  {p.tip && <title>{p.tip}</title>}
                </circle>
              )
            )}
          </svg>
        ) : g.k === "img" ? (
          <IconImg key={i} icon={g.icon} size={g.w} style={{ position: "absolute", left: g.x, top: g.y }} />
        ) : (
          <SceneBox key={i} p={g} />
        )
      )}
      <BottomLogo />
    </div>
  );
}

/* ---------- Marco de diapositiva (escala en pantalla, 1 página al imprimir) ---------- */
function Frame({ scale, children }: { scale: number; children: React.ReactNode }) {
  return (
    <div className="slide-frame" style={{ height: SLIDE_H * scale }}>
      <div
        className="rslide"
        style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Slides ---------- */

// Wordmark "AERÓDROMOS.IGS" (solo texto) en la esquina inferior izquierda de las
// diapositivas de contenido (no en portada/cierre, que llevan el logo completo).
function BottomLogo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/report/logo-texto.png"
      alt="Aeródromos IGS"
      style={{ position: "absolute", left: 48, bottom: 26, height: 16, width: "auto", opacity: 0.95 }}
    />
  );
}

function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="Aeródromos IGS" style={{ height: 46, width: "auto" }} />;
}

// "Aeropuerto El Loa - Calama" -> "Aeropuerto El Loa, Calama"
function airportFull(data: DeckData): string {
  return data.airport.companyName.replace(" - ", ", ");
}

function Cover({ data }: { data: DeckData }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72, color: hx(AIGS.ink) }}>
      <div style={{ position: "absolute", top: 56, left: 72 }}>
        <Logo />
      </div>
      <div style={{ position: "absolute", left: 72, top: 300, right: 72 }}>
        <Badge color={AIGS.blue}>{KIND_BADGE[data.kind ?? "MENSUAL"]}</Badge>
        <div style={{ fontSize: 60, lineHeight: 1.02, letterSpacing: "-0.02em", marginTop: 16 }}>
          {data.airport.name}
        </div>
        <div style={{ fontSize: 22, color: hx(AIGS.body), marginTop: 20 }}>{data.airport.companyName}</div>
        <div style={{ fontSize: 16, color: hx(AIGS.muted), marginTop: 8 }}>
          {coverScope(data)} · {data.monthLabel}
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, bottom: 48, fontSize: 13, color: hx(AIGS.muted) }}>
        Aeródromos IGS · {data.monthLabel}
      </div>
    </div>
  );
}

function Section({ module, title }: { module: string; title: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <div style={{ position: "absolute", left: 72, top: 300, right: 72 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: hx(AIGS.blue),
          }}
        >
          {module}
        </div>
        <div style={{ fontSize: 52, letterSpacing: "-0.02em", color: hx(AIGS.ink), marginTop: 10 }}>{title}</div>
      </div>
      <BottomLogo />
    </div>
  );
}

function SlideHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ position: "absolute", top: 56, left: 72, right: 72 }}>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", color: hx(AIGS.ink) }}>{title}</div>
      {subtitle && <div style={{ fontSize: 15, color: hx(AIGS.muted), marginTop: 6 }}>{subtitle}</div>}
    </div>
  );
}

// "avance al 30-09-2026" (+ aviso si la foto es posterior al cierre del mes).
function asqAsOfText(a: NonNullable<DeckData["asq"]>): string {
  const d = a.asOf.split("-").reverse().join("-");
  return a.afterMonthEnd ? `avance al ${d} (posterior al cierre del mes)` : `avance al ${d}`;
}

function AsqSlide({ data }: { data: DeckData }) {
  const a = data.asq;
  // Densidad adaptativa: reparte el alto disponible (~372px bajo los KPIs) entre las
  // filas (rutas + cabecera + total) para que la tabla siempre quepa en la diapositiva.
  const nRows = a?.rows.length ?? 0;
  const rowH = Math.min(30, 372 / Math.max(1, nRows + 2));
  const fs = Math.max(8, Math.min(14, Math.floor(rowH * 0.58)));
  const pv = Math.max(0, Math.floor((rowH - fs * 1.3) / 2));
  const full = airportFull(data);
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead
        title="Encuestas ACI ASQ"
        subtitle={a ? `${full} · ${a.seasonLabel.replace("-", " ")} · ${asqAsOfText(a)}` : full}
      />
      {!a ? (
        <Centered>Aún no hay datos de ASQ de la temporada {data.season.label} para este aeropuerto.</Centered>
      ) : (
        <div style={{ position: "absolute", top: 150, left: 72, right: 72, bottom: 56, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <Kpi label="Plan (target)" value={fmtInt(a.target)} sub="encuestas comprometidas" />
            <Kpi label="Realizadas" value={fmtInt(a.collected)} sub="acumulado de la temporada" />
            <Kpi
              label="Avance"
              value={`${a.pct}%`}
              sub={a.target > 0 && a.collected >= a.target ? "meta alcanzada" : "de la meta"}
              valueColor={a.target > 0 && a.collected >= a.target ? AIGS.up : AIGS.blue}
              subColor={a.target > 0 && a.collected >= a.target ? AIGS.up : AIGS.muted}
            />
            <Kpi label="Rutas" value={fmtInt(a.rows.length)} sub="Aerolínea-Destino" />
          </div>

          <table
            style={
              {
                width: "100%",
                marginTop: 22,
                borderCollapse: "collapse",
                fontSize: "var(--fs)",
                tableLayout: "fixed",
                "--fs": `${fs}px`,
                "--pv": `${pv}px`,
              } as React.CSSProperties
            }
          >
            <thead>
              <tr style={{ background: hx(AIGS.surfaceSoft), color: hx(AIGS.muted) }}>
                <Th align="left" w="46%">
                  Aerolínea-Destino
                </Th>
                <Th align="right" w="18%">
                  Plan (target)
                </Th>
                <Th align="right" w="18%">
                  Realizadas
                </Th>
                <Th align="right" w="18%">
                  Avance
                </Th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r) => {
                const p = pct(r.collected, r.target);
                const ok = r.target > 0 && r.collected >= r.target;
                return (
                  <tr key={r.airlineDestination} style={{ borderTop: `1px solid ${hx(AIGS.hairline)}` }}>
                    <Td align="left" color={AIGS.body}>
                      {r.airlineDestination}
                    </Td>
                    <Td align="right" mono color={AIGS.ink}>
                      {fmtInt(r.target)}
                    </Td>
                    <Td align="right" mono color={AIGS.ink}>
                      {fmtInt(r.collected)}
                    </Td>
                    <Td align="right" mono color={ok ? AIGS.up : AIGS.muted} bold={ok}>
                      {p}%{ok ? " ✓" : ""}
                    </Td>
                  </tr>
                );
              })}
              <tr style={{ background: hx(AIGS.surfaceStrong), borderTop: `2px solid ${hx(AIGS.hairline)}` }}>
                <Td align="left" bold color={AIGS.ink}>
                  Total {data.airport.short ?? data.airport.code}
                </Td>
                <Td align="right" mono bold color={AIGS.ink}>
                  {fmtInt(a.target)}
                </Td>
                <Td align="right" mono bold color={AIGS.ink}>
                  {fmtInt(a.collected)}
                </Td>
                <Td align="right" mono bold color={a.collected >= a.target ? AIGS.up : AIGS.ink}>
                  {a.pct}%
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <BottomLogo />
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ display: "inline-block", width: 16, borderTop: `2px ${dashed ? "dashed" : "solid"} ${hx(color)}` }} />
      {label}
    </span>
  );
}

function ChartLegend({ meta, service }: { meta: number | null; service?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: hx(AIGS.muted) }}>
      <LegendItem color={SERIES.prom} label={service ? "Fila · promedio" : "Promedio"} />
      <LegendItem color={SERIES.med} label="Mediana" dashed />
      <LegendItem color={SERIES.p90} label="p90" />
      {meta != null && <LegendItem color={SERIES.meta} label="Estándar IATA" dashed />}
      {service && <LegendItem color={SERIES.at} label="Atención · promedio" />}
    </div>
  );
}

function ProcesoSlide({ data, p }: { data: DeckData; p: DeckData["processes"][number] }) {
  const marginOk = p.margin != null && p.margin >= 0;
  const title = `${p.proceso}${p.faseLabel ? ` — ${p.faseLabel}` : ""}`;
  const full = airportFull(data);
  const hasMini = p.byAirline.length > 0;
  const cols = Math.min(p.byAirline.length, 6);
  const seasonMargin = p.meta != null ? p.meta - p.kpiSeason.prom : null;
  const axes = processAxes(p, p.service?.kpi ? p.service.series : undefined);
  // Sin mediciones este mes: la diapositiva se muestra igual (hubo mediciones antes en la
  // temporada). Los KPIs del mes van en "—" y se apoya el lector en el acumulado del periodo.
  const kpi = p.kpi;
  const subtitle = p.monthHasData
    ? `${full} · ${data.monthLabel}`
    : `${full} · ${data.monthLabel} · sin mediciones este mes (se muestra el acumulado de la temporada)`;
  // Mensual: abajo va el acumulado de la temporada ("Periodo"). Semestral/anual: solo la
  // temporada (la evolución va en el gráfico y en el evolutivo por temporada).
  const seasonal = (data.kind ?? "MENSUAL") !== "MENSUAL";
  const sub = (v: string) => (seasonal ? undefined : `Periodo ${v}`);
  // Desde oct-2026 los KPIs grandes son de la FILA (a la que aplica el Estándar IATA) y la
  // atención va en una franja propia, sin meta.
  const sv = p.service?.kpi ? p.service : null;
  const fila = (l: string) => (sv ? `Fila · ${l.toLowerCase()}` : l);
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title={title} subtitle={subtitle} />
      {/* KPIs: número del mes en grande + promedio del periodo abajo (pequeño) */}
      <div style={{ position: "absolute", top: 150, left: 72, right: 72 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          <Kpi label={fila("Promedio")} value={kpi ? fmtMMSS(kpi.prom) : "—"} sub={sub(fmtMMSS(p.kpiSeason.prom))} />
          <Kpi label={fila("P90")} value={kpi ? fmtMMSS(kpi.p90) : "—"} sub={sub(fmtMMSS(p.kpiSeason.p90))} />
          <Kpi label={fila("Mediana")} value={kpi ? fmtMMSS(kpi.med) : "—"} sub={sub(fmtMMSS(p.kpiSeason.med))} />
          {p.meta == null ? (
            <Kpi label="Estándar IATA" value="—" sub="sin estándar" />
          ) : (
            <Kpi
              label={sv ? "Margen fila vs Est. IATA" : "Margen vs Est. IATA"}
              value={fmtMMSS(p.margin)}
              sub={sub(fmtMMSS(seasonMargin))}
              valueColor={p.margin == null ? AIGS.muted : marginOk ? AIGS.up : AIGS.down}
            />
          )}
          <Kpi label="N° de mediciones" value={fmtInt(kpi ? kpi.n : 0)} sub={sub(fmtInt(p.kpiSeason.n))} />
        </div>
      </div>

      {/* Atención (desde oct-2026): franja compacta bajo los KPIs de fila */}
      {sv && (
        <div
          style={{
            position: "absolute",
            top: 280,
            left: 72,
            right: 72,
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 18px",
            alignItems: "baseline",
            fontSize: 13,
            color: hx(AIGS.body),
            borderLeft: `4px solid ${hx(SERIES.at)}`,
            paddingLeft: 10,
          }}
        >
          <b style={{ color: hx(AIGS.ink) }}>Atención (sin meta)</b>
          <span>
            promedio <b style={{ fontFamily: FONT.mono, color: hx(AIGS.ink) }}>{fmtMMSS(sv.kpi!.prom)}</b>
          </span>
          <span>P90 <span style={{ fontFamily: FONT.mono }}>{fmtMMSS(sv.kpi!.p90)}</span></span>
          <span>mediana <span style={{ fontFamily: FONT.mono }}>{fmtMMSS(sv.kpi!.med)}</span></span>
          <span>
            · Total fila + atención <b style={{ fontFamily: FONT.mono, color: hx(AIGS.ink) }}>{fmtMMSS(sv.kpi!.totProm)}</b>
          </span>
          <span style={{ color: hx(AIGS.muted) }}>
            n={fmtInt(sv.kpi!.n)}
            {!seasonal && sv.period ? ` · Periodo atención ${fmtMMSS(sv.period.prom)}` : ""}
          </span>
        </div>
      )}

      {/* Evolutivo principal (más chico si hay desglose por aerolínea) */}
      <div
        style={
          hasMini
            ? { position: "absolute", top: sv ? 308 : 292, left: 72, right: 72 }
            : { position: "absolute", top: 410, left: 72, right: 72, bottom: 56 }
        }
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: hx(AIGS.ink) }}>Evolutivo</div>
          <ChartLegend meta={p.meta} service={!!sv} />
        </div>
        <ProcesoChart p={p} height={hasMini ? (sv ? 132 : 146) : 210} axis={axes.main} />
      </div>

      {/* Mini-gráficos por aerolínea (Check in / Retiro), con una escala Y común entre ellos */}
      {hasMini && (
        <div style={{ position: "absolute", top: 486, left: 72, right: 72, bottom: 70 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: hx(AIGS.ink), marginBottom: 6 }}>
            Promedio por aerolínea{" "}
            <span style={{ fontWeight: 400, color: hx(AIGS.muted) }}>· línea: promedio · – – estándar IATA</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
            {p.byAirline.slice(0, 6).map((a) => (
              <MiniAirlineChart key={a.airline} a={a} yMax={axes.mini.max} at={sv ? sv.byAirline[a.airline] ?? null : undefined} />
            ))}
          </div>
        </div>
      )}
      <BottomLogo />
    </div>
  );
}

function MiniAirlineChart({
  a,
  yMax,
  at,
}: {
  a: DeckData["processes"][number]["byAirline"][number];
  yMax: number;
  at?: number | null; // atención promedio (desde oct-2026); undefined = no se muestra
}) {
  const chartData = a.series.map((s) => ({ label: s.label, prom: s.prom }));
  const ok = a.meta != null && a.monthProm != null ? a.monthProm <= a.meta : null;
  const valColor = ok == null ? AIGS.blue : ok ? AIGS.up : AIGS.down;
  return (
    <div style={{ border: `1px solid ${hx(AIGS.hairline)}`, borderRadius: 10, background: "#fff", padding: "6px 8px", minWidth: 0 }}>
      {/* Título a la izquierda; promedio + n a la derecha (deja más alto para el gráfico) */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: hx(AIGS.ink),
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {a.label}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0, whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 700, color: hx(valColor) }}>
            {fmtMMSS(a.monthProm)}
          </span>
          <span style={{ fontSize: 9, color: hx(AIGS.muted) }}>n={a.monthN}</span>
          {at !== undefined && (
            <span style={{ fontSize: 9, color: hx(SERIES.at), fontWeight: 700 }}>at. {fmtMMSS(at)}</span>
          )}
        </span>
      </div>
      <div style={{ height: 94, marginTop: 3 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <YAxis
              domain={[0, yMax]}
              ticks={[0, yMax / 2, yMax]}
              interval={0}
              tickFormatter={(v) => fmtMMSS(Number(v))}
              tick={{ fill: hx(AIGS.muted), fontSize: 8 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <XAxis
              dataKey="label"
              tickFormatter={(v) => String(v).split(" ")[0]}
              tick={{ fill: hx(AIGS.muted), fontSize: 8 }}
              tickLine={false}
              axisLine={{ stroke: hx(AIGS.hairline) }}
              interval={0}
            />
            {a.meta != null && <ReferenceLine y={a.meta} stroke={hx(SERIES.meta)} strokeDasharray="3 3" strokeWidth={1} />}
            <Line type="monotone" dataKey="prom" stroke={hx(SERIES.prom)} strokeWidth={1.75} dot={{ r: 2.5, fill: hx(SERIES.prom) }} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Valor (mm:ss) sobre cada punto de fila/promedio y atención del evolutivo.
function PointLabels({
  chart,
  rows,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chart: any;
  rows: { label: string; prom: number | null; at: number | null }[];
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xAxis = Object.values(chart.xAxisMap ?? {})[0] as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yAxis = Object.values(chart.yAxisMap ?? {})[0] as any;
  if (!xAxis || !yAxis) return null;
  const fs = 11;
  // Los puntos extremos caen en el borde: la etiqueta se corre para no pisar el eje Y ni cortarse.
  const halfW = 24;
  const clampX = (x: number) => Math.min(xAxis.x + xAxis.width - 2, Math.max(xAxis.x + halfW, x));
  const text = (key: string, x: number, y: number | null, v: number | null, color: string) =>
    y == null ? null : (
      <text
        key={key}
        x={x}
        y={Math.max(fs, y)}
        textAnchor="middle"
        fontSize={fs}
        fontWeight={700}
        fontFamily={FONT.mono}
        fill={hx(color)}
        stroke="#fff"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {fmtMMSS(v)}
      </text>
    );
  return (
    <g>
      {rows.map((r) => {
        const x = clampX(xAxis.scale(r.label) + (xAxis.scale.bandwidth?.() ?? 0) / 2);
        const [promY, atY] = stackPointLabels(
          r.prom == null ? null : yAxis.scale(r.prom),
          r.at == null ? null : yAxis.scale(r.at),
          5,
          fs + 1
        );
        return [text(`p${r.label}`, x, promY, r.prom, SERIES.prom), text(`a${r.label}`, x, atY, r.at, SERIES.at)];
      })}
    </g>
  );
}

function ProcesoChart({ p, height = 200, axis }: { p: DeckData["processes"][number]; height?: number; axis: ReturnType<typeof timeAxis> }) {
  const chartData = p.series.map((s, i) => ({
    at: p.service?.kpi ? (p.service.series[i] ?? null) : null,
    label: s.label,
    prom: s.prom,
    med: s.med,
    p90: s.p90,
    bandDelta: s.med != null && s.p90 != null ? Math.max(0, s.p90 - s.med) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: hx(AIGS.muted), fontSize: 12 }} tickLine={false} axisLine={{ stroke: hx(AIGS.hairline) }} />
        <YAxis
          tickFormatter={(v) => fmtMMSS(Number(v))}
          tick={{ fill: hx(AIGS.muted), fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          domain={[0, axis.max]}
          ticks={axis.ticks}
          interval={0}
        />
        <Tooltip formatter={(v: number, n) => [fmtMMSS(v), n]} />
        <Area type="monotone" dataKey="med" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
        <Area
          type="monotone"
          dataKey="bandDelta"
          stackId="band"
          stroke="none"
          fill="rgba(0,49,82,0.06)"
          isAnimationActive={false}
        />
        {/* Etiquetas detrás de los puntos y mediana al final, como anillo: con valores casi iguales todos se ven */}
        <Customized component={(chart: unknown) => <PointLabels chart={chart} rows={chartData} />} />
        <Line type="monotone" dataKey="p90" stroke={hx(SERIES.p90)} strokeWidth={1.5} dot={{ r: 2, fill: hx(SERIES.p90) }} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="prom" stroke={hx(SERIES.prom)} strokeWidth={2} dot={{ r: 2, fill: hx(SERIES.prom) }} isAnimationActive={false} connectNulls />
        {p.meta != null && <ReferenceLine y={p.meta} stroke={hx(SERIES.meta)} strokeDasharray="4 4" strokeWidth={1.5} />}
        {p.service?.kpi && (
          <Line type="monotone" dataKey="at" name="Atención" stroke={hx(SERIES.at)} strokeWidth={2} dot={{ r: 2, fill: hx(SERIES.at) }} isAnimationActive={false} connectNulls />
        )}
        <Line type="monotone" dataKey="med" stroke={hx(SERIES.med)} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4, fill: "none", strokeWidth: 1.5, strokeDasharray: "none" }} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function EmptyTiempos({ data }: { data: DeckData }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title="Mediciones de tiempos" subtitle={airportFull(data)} />
      <Centered>
        {data.bqError
          ? "No se pudieron leer las mediciones de tiempos (credenciales de BigQuery)."
          : "Sin mediciones de tiempos registradas en esta temporada."}
      </Centered>
      <BottomLogo />
    </div>
  );
}

// Encuesta AGA de un público (Pasajeros / Acompañantes) en una sola diapositiva:
// KPIs del mes (con el acumulado del periodo abajo) + barras de atributos y servicios.
function AgaSlide({ data, s }: { data: DeckData; s: AgaDeck }) {
  const m = s.month;
  const p = s.period;
  const hasMonth = m.n > 0;
  // Las barras usan el mes; si el mes no tuvo encuestas, el acumulado del periodo.
  const shown = hasMonth ? m : p;
  const full = airportFull(data);
  const subtitle = `${full} · ${data.monthLabel} · ${s.planTitle}${
    hasMonth || p.n === 0 ? "" : " · sin encuestas este mes (se muestra el acumulado del periodo)"
  }`;
  const rows = Math.max(shown.attributes.length, shown.services.length, 1);
  const rowH = Math.min(30, 318 / rows);
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title={`Encuestas AGA · ${s.audience}`} subtitle={subtitle} />
      {p.n === 0 ? (
        <Centered>Aún no hay encuestas registradas para este plan.</Centered>
      ) : (
        <>
          <div style={{ position: "absolute", top: 140, left: 72, right: 72 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              <Kpi
                label="NPS"
                value={hasMonth ? fmtNps(m.nps) : "—"}
                valueColor={npsColor(hasMonth ? m.nps : null)}
                sub={`Periodo ${fmtNps(p.nps)}`}
                extra={hasMonth ? <NpsBar st={m} /> : undefined}
              />
              <Kpi
                label="Satisfacción general"
                value={hasMonth ? `${fmtScore(m.sat)} / 5` : "—"}
                valueColor={scoreColor(hasMonth ? m.sat : null)}
                sub={`Periodo ${fmtScore(p.sat)} / 5`}
              />
              <Kpi
                label="Satisfechos (nota 4–5)"
                value={hasMonth && m.satTop2 != null ? `${m.satTop2}%` : "—"}
                sub={`Periodo ${p.satTop2 != null ? `${p.satTop2}%` : "—"}`}
              />
              <Kpi
                label="Encuestas del mes"
                value={fmtInt(m.n)}
                sub={`Periodo ${fmtInt(p.n)}${s.target > 0 ? ` de ${fmtInt(s.target)} (${pct(p.n, s.target)}%)` : ""}`}
              />
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              top: 300,
              left: 72,
              right: 72,
              bottom: 60,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 40,
              overflow: "hidden",
            }}
          >
            <ScorePanel title="Atributos de la experiencia" note="nota 1–5" rows={shown.attributes} rowH={rowH} />
            <ScorePanel title="Servicios evaluados" note="nota 1–5 · % que lo usó" rows={shown.services} rowH={rowH} />
          </div>
        </>
      )}
      {p.n > 0 && (
        <div
          style={{
            position: "absolute",
            right: 72,
            bottom: 24,
            display: "flex",
            gap: 12,
            fontSize: 11,
            color: hx(AIGS.muted),
          }}
        >
          <LegendDot color={AIGS.up} label="≥ 4,0" />
          <LegendDot color={AIGS.yellow} label="3,5 – 3,9" />
          <LegendDot color={AIGS.down} label="< 3,5" />
          <span>· N/A no se considera</span>
        </div>
      )}
      <BottomLogo />
    </div>
  );
}

const guideKpis = (data: DeckData) => ((data.kind ?? "MENSUAL") === "MENSUAL" ? AGA_GUIDE_KPIS : AGA_GUIDE_KPIS_SEASON);

// Diapositiva explicativa previa a las de Pasajeros / Acompañantes: qué es cada KPI y
// cómo leer las listas de atributos y servicios (textos en lib/reports/agaGuide.ts).
function AgaGuideSlide({ data }: { data: DeckData }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title="Cómo leer las Encuestas AGA" subtitle={`${airportFull(data)} · Indicadores y leyenda`} />
      <div
        style={{
          position: "absolute",
          top: 140,
          left: 72,
          right: 72,
          display: "grid",
          gridTemplateColumns: `repeat(${guideKpis(data).length}, 1fr)`,
          gap: 14,
        }}
      >
        {guideKpis(data).map((k) => (
          <div
            key={k.title}
            style={{
              border: `1px solid ${hx(AIGS.hairline)}`,
              borderRadius: 12,
              background: "#fff",
              padding: "16px 18px",
              height: 232,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: hx(AIGS.blue) }}>{k.title}</div>
            <div style={{ fontSize: 12, fontStyle: "italic", color: hx(AIGS.muted), lineHeight: 1.35 }}>{k.question}</div>
            <div style={{ fontSize: 13, color: hx(AIGS.body), lineHeight: 1.4, flex: 1 }}>{k.how}</div>
            {k.color && <div style={{ fontSize: 11.5, color: hx(AIGS.ink) }}>{k.color}</div>}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", top: 384, left: 72, right: 72, fontSize: 13, color: hx(AIGS.muted) }}>
        {(data.kind ?? "MENSUAL") === "MENSUAL" ? AGA_GUIDE_PERIOD_NOTE : AGA_GUIDE_PERIOD_NOTE_SEASON}
      </div>

      <div
        style={{
          position: "absolute",
          top: 424,
          left: 72,
          right: 72,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 40,
        }}
      >
        {[
          { title: "Atributos de la experiencia", note: "nota 1–5 · ejemplo", row: AGA_GUIDE_EXAMPLE_ATTRIBUTE, text: AGA_GUIDE_ATTRIBUTES },
          { title: "Servicios evaluados", note: "nota 1–5 · % que lo usó · ejemplo", row: AGA_GUIDE_EXAMPLE_SERVICE, text: AGA_GUIDE_SERVICES },
        ].map((b) => (
          <div key={b.title} style={{ minWidth: 0 }}>
            <ScorePanel title={b.title} note={b.note} rows={[b.row]} rowH={30} />
            <div style={{ fontSize: 13, color: hx(AIGS.body), lineHeight: 1.45, marginTop: 10 }}>{b.text}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          right: 72,
          bottom: 24,
          display: "flex",
          gap: 12,
          fontSize: 11,
          color: hx(AIGS.muted),
        }}
      >
        <LegendDot color={AIGS.up} label="≥ 4,0" />
        <LegendDot color={AIGS.yellow} label="3,5 – 3,9" />
        <LegendDot color={AIGS.down} label="< 3,5" />
        <span>· {AGA_GUIDE_SCALE_NOTE}</span>
      </div>
      <BottomLogo />
    </div>
  );
}

// "Voz del pasajero / acompañante": apreciación general (escrita en el Dashboard) +
// citas destacadas con ★ de las respuestas abiertas del mes.
function VoiceSlide({ data, s }: { data: DeckData; s: AgaDeck }) {
  const { appraisal, quotes } = s.voice;
  const shown = quotes.slice(0, appraisal ? 4 : 6);
  const who = s.audience === "Acompañantes" ? "acompañante" : "pasajero";
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title={`Voz del ${who}`} subtitle={`${airportFull(data)} · ${data.monthLabel} · ${s.planTitle}`} />
      <div
        style={{
          position: "absolute",
          top: 140,
          left: 72,
          right: 72,
          bottom: 64,
          display: "grid",
          gridTemplateColumns: appraisal && shown.length ? "0.9fr 1.1fr" : "1fr",
          gap: 28,
        }}
      >
        {appraisal && (
          <div
            style={{
              background: hx(AIGS.surfaceSoft),
              border: `1px solid ${hx(AIGS.hairline)}`,
              borderRadius: 14,
              padding: "22px 26px",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: hx(AIGS.blue) }}>
              Apreciación general
            </div>
            <div style={{ fontSize: 17, lineHeight: 1.5, color: hx(AIGS.body), marginTop: 12, whiteSpace: "pre-wrap" }}>{appraisal}</div>
          </div>
        )}
        {shown.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: appraisal ? "1fr" : "1fr 1fr",
              alignContent: "start",
              gap: 12,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {shown.map((q, i) => {
              const tone = q.nps == null ? AIGS.muted : q.nps >= 9 ? AIGS.up : q.nps <= 6 ? AIGS.down : AIGS.muted;
              return (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${hx(AIGS.hairline)}`,
                    borderLeft: `4px solid ${hx(tone)}`,
                    borderRadius: 0,
                    padding: "10px 16px",
                    overflow: "hidden",
                    minHeight: 0,
                  }}
                >
                  <div style={{ fontSize: 11, color: hx(AIGS.muted), letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {q.label}
                    {q.nps != null ? ` · NPS ${q.nps}` : ""}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      lineHeight: 1.4,
                      color: hx(AIGS.ink),
                      marginTop: 4,
                      fontStyle: "italic",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    “{q.text}”
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <BottomLogo />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: hx(color), display: "inline-block" }} />
      {label}
    </span>
  );
}

// Composición del NPS: promotores / pasivos / detractores.
function NpsBar({ st }: { st: AgaStatsDeck }) {
  const parts = [
    { v: st.promotersPct ?? 0, c: AIGS.up },
    { v: st.passivesPct ?? 0, c: AIGS.hairline },
    { v: st.detractorsPct ?? 0, c: AIGS.down },
  ];
  return (
    <div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: hx(AIGS.surfaceStrong) }}>
        {parts.map((x, i) => (
          <div key={i} style={{ width: `${x.v}%`, background: hx(x.c) }} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: hx(AIGS.muted), marginTop: 3 }}>
        Prom. {st.promotersPct ?? 0}% · Pas. {st.passivesPct ?? 0}% · Det. {st.detractorsPct ?? 0}%
      </div>
    </div>
  );
}

type ScoreRowData = AgaScoreDeck & { usePct?: number | null };

function ScorePanel({
  title,
  note,
  rows,
  rowH,
}: {
  title: string;
  note: string;
  rows: ScoreRowData[];
  rowH: number;
}) {
  const fs = Math.max(10, Math.min(13, Math.floor(rowH * 0.48)));
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: hx(AIGS.ink), marginBottom: 8 }}>
        {title} <span style={{ fontSize: 12, fontWeight: 400, color: hx(AIGS.muted) }}>· {note}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: hx(AIGS.muted) }}>Sin calificaciones.</div>
      ) : (
        rows.map((r) => <ScoreRow key={r.label} r={r} rowH={rowH} fs={fs} />)
      )}
    </div>
  );
}

function ScoreRow({ r, rowH, fs }: { r: ScoreRowData; rowH: number; fs: number }) {
  return (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 24% 34px 74px",
              alignItems: "center",
              gap: 8,
              height: rowH,
              fontSize: fs,
              borderTop: `1px solid ${hx(AIGS.hairline)}`,
            }}
          >
            <span style={{ color: hx(AIGS.body), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.label}
            </span>
            <span style={{ height: 8, borderRadius: 4, background: hx(AIGS.surfaceStrong), overflow: "hidden" }}>
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${r.avg != null ? (r.avg / 5) * 100 : 0}%`,
                  background: hx(scoreColor(r.avg)),
                }}
              />
            </span>
            <span style={{ fontFamily: FONT.mono, fontWeight: 700, textAlign: "right", color: hx(AIGS.ink) }}>
              {fmtScore(r.avg)}
            </span>

            <span style={{ fontSize: Math.max(9, fs - 2), color: hx(AIGS.muted), textAlign: "right", whiteSpace: "nowrap" }}>
              {r.usePct !== undefined ? `${r.usePct != null ? `${r.usePct}%` : "—"} · ` : ""}n={r.n}
            </span>
          </div>
  );
}

/* ---------- Semestral / anual ---------- */

// Resumen ejecutivo: cifras clave de cada módulo + texto del consultor (si lo hay).
function ExecSummarySlide({ data, body }: { data: DeckData; body: string }) {
  const cards = execSummaryCards(data).slice(0, 4);
  const text = body.trim();
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title="Resumen ejecutivo" subtitle={`${airportFull(data)} · ${data.monthLabel}`} />
      {cards.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 140,
            left: 72,
            right: 72,
            display: "grid",
            gridTemplateColumns: `repeat(${cards.length}, 1fr)`,
            gap: 14,
          }}
        >
          {cards.map((c) => (
            <Kpi key={c.label} label={c.label} value={c.value} sub={c.sub} valueColor={c.valueColor} />
          ))}
        </div>
      )}
      {text && (
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            top: cards.length ? 320 : 150,
            bottom: 64,
            border: `1px solid ${hx(AIGS.hairline)}`,
            background: hx(AIGS.surfaceSoft),
            borderRadius: 14,
            padding: "24px 30px",
            fontSize: 17,
            lineHeight: 1.5,
            color: hx(AIGS.body),
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            overflow: "hidden",
          }}
        >
          {text}
        </div>
      )}
      {!text && cards.length === 0 && <Centered>Sin datos para resumir en este periodo.</Centered>}
      <BottomLogo />
    </div>
  );
}

// Tabla de todos los procesos de la temporada frente al Estándar IATA y a la temporada de comparación.
function TiemposSummarySlide({ data }: { data: DeckData }) {
  const rows = tiemposSummaryRows(data);
  const sv = rows.some((r) => r.atencion != null);
  const w = sv ? "9%" : "11%";
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title="Tiempos vs Estándar IATA" subtitle={`${airportFull(data)} · ${data.monthLabel}`} />
      <div style={{ position: "absolute", top: 150, left: 72, right: 72, bottom: 64, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: hx(AIGS.surfaceSoft), color: hx(AIGS.muted) }}>
              <Th align="left" w={sv ? "28%" : "34%"}>Proceso</Th>
              <Th align="right" w={w}>{sv ? "Fila prom." : "Promedio"}</Th>
              <Th align="right" w={w}>Mediana</Th>
              <Th align="right" w={w}>P90</Th>
              <Th align="right" w={w}>Mediciones</Th>
              <Th align="right" w={w}>Est. IATA</Th>
              <Th align="right" w={w}>Margen</Th>
              {sv && <Th align="right" w={w}>Atención</Th>}
              {sv && <Th align="right" w={w}>Total</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const icon = iconFor(r.label);
              return (
              <tr key={r.label} style={{ borderTop: `1px solid ${hx(AIGS.hairline)}`, height: 58 }}>
                <Td align="left" color={AIGS.ink}>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {icon && <IconImg icon={icon} size={42} />}
                    {r.label}
                  </span>
                </Td>
                <Td align="right" mono bold color={AIGS.ink}>{fmtMMSS(r.prom)}</Td>
                <Td align="right" mono>{fmtMMSS(r.med)}</Td>
                <Td align="right" mono>{fmtMMSS(r.p90)}</Td>
                <Td align="right" mono>{fmtInt(r.n)}</Td>
                <Td align="right" mono>{r.meta != null ? fmtMMSS(r.meta) : "—"}</Td>
                <Td
                  align="right"
                  mono
                  bold
                  color={r.margin == null ? AIGS.muted : r.margin >= 0 ? AIGS.up : AIGS.down}
                >
                  {r.margin == null ? "—" : `${r.margin >= 0 ? "" : "−"}${fmtMMSS(Math.abs(r.margin))}`}
                </Td>
                {sv && <Td align="right" mono color={SERIES.at}>{r.atencion != null ? fmtMMSS(r.atencion) : "—"}</Td>}
                {sv && <Td align="right" mono>{r.total != null ? fmtMMSS(r.total) : "—"}</Td>}
              </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: hx(AIGS.muted), marginTop: 14, lineHeight: 1.5 }}>
          Margen = Estándar IATA − promedio de fila (verde: dentro del estándar). La evolución por temporada va en el
          evolutivo de tiempos.{sv ? " Atención = salida de la fila a fin de la atención (sin meta); total = fila + atención." : ""}
          {data.seasonal && data.season.to < "2026-10-01" ? " Hasta septiembre de 2026 se mide solo el tiempo de fila." : ""}
        </div>
      </div>
      <BottomLogo />
    </div>
  );
}

// Fila vs atención por proceso (desde oct-2026): barras apiladas fila + atención = total.
function TiemposSplitSlide({ data }: { data: DeckData }) {
  const rows = serviceSplitRows(data);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const rowH = Math.min(78, 430 / Math.max(rows.length, 1));
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title="Tiempos · fila vs atención" subtitle={`${airportFull(data)} · ${data.monthLabel} · promedio por pasajero`} />
      <div style={{ position: "absolute", top: 140, left: 72, right: 72, display: "flex", gap: 18, fontSize: 12, color: hx(AIGS.muted) }}>
        <LegendDot color={SERIES.prom} label="Fila (desde el ingreso hasta llegar al counter o control)" />
        <LegendDot color={SERIES.at} label="Atención (en el counter o control)" />
      </div>
      <div style={{ position: "absolute", top: 180, left: 72, right: 72, bottom: 92 }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "260px minmax(0, 1fr) 300px",
              alignItems: "center",
              gap: 16,
              height: rowH,
              borderTop: `1px solid ${hx(AIGS.hairline)}`,
            }}
          >
            <span style={{ fontSize: 15, color: hx(AIGS.ink), display: "flex", alignItems: "center", gap: 12 }}>
              {data.seasonal && iconFor(r.label) && <IconImg icon={iconFor(r.label)!} size={Math.min(46, rowH - 8)} />}
              {r.label}
            </span>
            <span style={{ display: "flex", height: 22 }}>
              <span style={{ width: `${(r.fila / max) * 100}%`, background: hx(SERIES.prom) }} />
              <span style={{ width: `${(r.atencion / max) * 100}%`, background: hx(SERIES.at) }} />
            </span>
            <span style={{ fontSize: 14, color: hx(AIGS.body), textAlign: "right", fontFamily: FONT.mono }}>
              {fmtMMSS(r.fila)} + <span style={{ color: hx(SERIES.at) }}>{fmtMMSS(r.atencion)}</span> ={" "}
              <b style={{ color: hx(AIGS.ink) }}>{fmtMMSS(r.total)}</b>
              <span style={{ fontFamily: FONT.face, fontSize: 11, color: hx(AIGS.muted) }}> · n={fmtInt(r.n)}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 56, fontSize: 12, color: hx(AIGS.muted) }}>
        El Estándar IATA aplica solo a la fila; la atención se informa sin meta. Fila = ingreso a la fila → salida de la
        fila; atención = salida de la fila → fin de la atención. Retiro de equipajes no aplica.
      </div>
      <BottomLogo />
    </div>
  );
}


/* ---------- ACI ASQ · resultados (semestral / anual) ---------- */

type AsqData = NonNullable<NonNullable<DeckData["seasonal"]>["asq"]>;

function AsqEmptySlide({ data }: { data: DeckData }) {
  const err = data.seasonal?.asqError;
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title="Encuestas ACI ASQ · Resultados" subtitle={`${airportFull(data)} · ${data.seasonal?.focusLabel ?? ""}`} />
      <Centered>
        {err
          ? "No se pudo leer la base ACI ASQ (BigQuery)."
          : `La base ACI ASQ de ${data.seasonal?.focusLabel ?? "la temporada"} aún no tiene encuestas de este aeropuerto. Se carga en Ingesta ASQ cuando ACI la publica.`}
      </Centered>
      <BottomLogo />
    </div>
  );
}

function AsqNote() {
  return (
    <div style={{ position: "absolute", right: 72, bottom: 26, fontSize: 11, color: hx(AIGS.muted), maxWidth: 820, textAlign: "right" }}>
      {ASQ_NOTE}
    </div>
  );
}

// Barras horizontales de satisfacción general por aeropuerto (escala 1–5).
function RankBars({ title, rows, rowH }: { title: string; rows: AsqData["rankingAll"]; rowH: number }) {
  const fs = Math.max(10, Math.min(14, Math.floor(rowH * 0.5)));
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: hx(AIGS.ink), marginBottom: 8 }}>{title}</div>
      {rows.map((r, i) => {
        const color = r.own ? AIGS.blue : r.chile ? "8DB0BB" : AIGS.surfaceStrong;
        return (
          <div
            key={r.code}
            style={{
              display: "grid",
              gridTemplateColumns: "24px minmax(0, 1fr) 40% 40px",
              alignItems: "center",
              gap: 8,
              height: rowH,
              fontSize: fs,
              fontWeight: r.own ? 700 : 400,
              color: hx(r.own ? AIGS.ink : AIGS.body),
            }}
          >
            <span style={{ fontFamily: FONT.mono, color: hx(AIGS.muted), textAlign: "right" }}>{i + 1}</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.code} · {r.name.replace(/ (International )?Airport$/i, "")}
              {!r.chile && r.country ? ` (${r.country})` : ""}
            </span>
            <span style={{ height: Math.max(6, rowH * 0.42), background: hx(AIGS.surfaceSoft), borderRadius: 3, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(r.avg / 5) * 100}%`, background: hx(color) }} />
            </span>
            <span style={{ fontFamily: FONT.mono, textAlign: "right" }}>{fmtScore2(r.avg)}</span>
          </div>
        );
      })}
    </div>
  );
}

function AsqRankingSlide({ data, a }: { data: DeckData; a: AsqData }) {
  const rowH = Math.min(30, 470 / Math.max(a.rankingAll.length, a.rankingChile.length, 1));
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title="Ranking de satisfacción general" subtitle={`${airportFull(data)} · ${a.season.label} · nota 1–5`} />
      <div style={{ position: "absolute", top: 140, left: 72, right: 72, bottom: 64, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
        <RankBars title={`Aeropuertos chilenos (${a.rankingChile.length})`} rows={a.rankingChile} rowH={rowH} />
        <RankBars title={`Programa regional (${a.rankingAll.length} aeropuertos)`} rows={a.rankingAll} rowH={rowH} />
      </div>
      <div style={{ position: "absolute", left: 72, bottom: 52, display: "flex", gap: 14, fontSize: 11, color: hx(AIGS.muted) }}>
        <LegendDot color={AIGS.blue} label={data.airport.short ?? data.airport.code} />
        <LegendDot color="8DB0BB" label="Chile" />
        <LegendDot color={AIGS.surfaceStrong} label="Otros países" />
      </div>
      <AsqNote />
      <BottomLogo />
    </div>
  );
}

const QUADRANT_COLOR: Record<string, string> = {
  "Fortaleza clave": AIGS.up,
  "Mejorar con prioridad": AIGS.down,
  Mantener: "3D7593",
  "Menor prioridad": "A9B2BF",
};

// Importancia (% que lo elige entre sus 3 más importantes) vs puntaje (nota 1–5).
function AsqMatrixSlide({ data, a }: { data: DeckData; a: AsqData }) {
  const { pts, midImp, midScore, quadrant, priority, strengths, number } = asqMatrix(a.attributes);
  const W = 760;
  const H = 470;
  const pad = { l: 48, r: 16, t: 12, b: 36 };
  const maxImp = Math.max(10, ...pts.map((p) => p.importance)) * 1.1;
  const sMin = Math.min(...pts.map((p) => p.airport)) - 0.15;
  const sMax = Math.max(...pts.map((p) => p.airport)) + 0.15;
  const x = (v: number) => pad.l + (v / maxImp) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - sMin) / (sMax - sMin)) * (H - pad.t - pad.b);
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead
        title="Importancia vs puntaje"
        subtitle={`${airportFull(data)} · ${a.season.label} · importancia declarada por los pasajeros vs nota del atributo`}
      />
      <svg width={W} height={H} style={{ position: "absolute", top: 140, left: 60 }}>
        <rect x={x(midImp)} y={pad.t} width={W - pad.r - x(midImp)} height={y(midScore) - pad.t} fill="#05B16910" />
        <rect x={x(midImp)} y={y(midScore)} width={W - pad.r - x(midImp)} height={H - pad.b - y(midScore)} fill="#CF202F10" />
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke={hx(AIGS.hairline)} />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke={hx(AIGS.hairline)} />
        <line x1={x(midImp)} y1={pad.t} x2={x(midImp)} y2={H - pad.b} stroke={hx(AIGS.muted)} strokeDasharray="4 4" />
        <line x1={pad.l} y1={y(midScore)} x2={W - pad.r} y2={y(midScore)} stroke={hx(AIGS.muted)} strokeDasharray="4 4" />
        <text x={W - pad.r - 4} y={pad.t + 14} textAnchor="end" fontSize={12} fill={hx(AIGS.up)} fontWeight={700}>Fortaleza clave</text>
        <text x={W - pad.r - 4} y={H - pad.b - 8} textAnchor="end" fontSize={12} fill={hx(AIGS.down)} fontWeight={700}>Mejorar con prioridad</text>
        <text x={pad.l + 6} y={pad.t + 14} fontSize={12} fill={hx("3D7593")} fontWeight={700}>Mantener</text>
        <text x={pad.l + 6} y={H - pad.b - 8} fontSize={12} fill={hx(AIGS.muted)} fontWeight={700}>Menor prioridad</text>
        {[0, 10, 20, 30, 40, 50, 60].filter((v) => v <= maxImp).map((v) => (
          <text key={v} x={x(v)} y={H - pad.b + 16} textAnchor="middle" fontSize={11} fill={hx(AIGS.muted)}>{v}%</text>
        ))}
        <text x={(W + pad.l) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill={hx(AIGS.muted)}>Importancia (% que lo elige entre sus 3 más importantes)</text>
        {[sMin, (sMin + sMax) / 2, sMax].map((v) => (
          <text key={v} x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={hx(AIGS.muted)}>{fmtScore2(v)}</text>
        ))}
        {pts.map((p) => (
          <g key={p.key}>
            <circle cx={x(p.importance)} cy={y(p.airport)} r={6} fill={hx(QUADRANT_COLOR[quadrant(p)])} opacity={0.9} />
            {number.has(p) && (
              <text x={x(p.importance) + 9} y={y(p.airport) + 4} fontSize={12} fontWeight={700} fill={hx(AIGS.ink)}>
                {number.get(p)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div style={{ position: "absolute", top: 140, right: 72, width: 330, bottom: 64, overflow: "hidden" }}>
        {[
          { title: "Mejorar con prioridad", color: AIGS.down, rows: priority },
          { title: "Fortalezas clave", color: AIGS.up, rows: strengths },
        ].map((b) => (
          <div key={b.title} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: hx(b.color), marginBottom: 6 }}>{b.title}</div>
            {b.rows.length === 0 ? (
              <div style={{ fontSize: 12, color: hx(AIGS.muted) }}>Ninguno.</div>
            ) : (
              b.rows.map((p) => (
                <div
                  key={p.key}
                  style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "4px 0", borderTop: `1px solid ${hx(AIGS.hairline)}` }}
                >
                  <span style={{ color: hx(AIGS.body), minWidth: 0 }}>
                    <b style={{ color: hx(AIGS.ink) }}>{number.get(p)}.</b> {p.label}
                  </span>
                  <span style={{ fontFamily: FONT.mono, whiteSpace: "nowrap", color: hx(AIGS.ink) }}>
                    {fmtScore2(p.airport)} · {p.importance}%
                  </span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 52, fontSize: 11, color: hx(AIGS.muted) }}>
        Líneas: mediana de importancia y nota promedio de los atributos del aeropuerto. Atributos con al menos 10 respuestas.
      </div>
      <BottomLogo />
    </div>
  );
}

// Diapositiva de texto: comentarios y sugerencias, análisis por módulo o recomendaciones.
function TextSlide({ data, title, body }: { data: DeckData; title: string; body: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title={title} subtitle={`${airportFull(data)} · ${data.monthLabel}`} />
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 150,
          bottom: 64,
          border: `1px solid ${hx(AIGS.hairline)}`,
          background: hx(AIGS.surfaceSoft),
          borderRadius: 14,
          padding: "28px 32px",
          fontSize: 18,
          lineHeight: 1.5,
          color: hx(AIGS.body),
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          overflow: "hidden",
        }}
      >
        {body}
      </div>
      <BottomLogo />
    </div>
  );
}

// Grilla 2×2 (máx. 4 fotos), cada una con su descripción breve debajo.
function PhotosSlide({
  data,
  photos,
  index,
  total,
}: {
  data: DeckData;
  photos: DeckPhoto[];
  index: number;
  total: number;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead
        title="Fotografías"
        subtitle={`${airportFull(data)} · ${data.monthLabel}${total > 1 ? ` · ${index + 1}/${total}` : ""}`}
      />
      <div
        style={{
          position: "absolute",
          top: 150,
          left: 72,
          right: 72,
          bottom: 56,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
          gap: 20,
        }}
      >
        {photos.map((p) => (
          <div key={p.id} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                borderRadius: 10,
                overflow: "hidden",
                background: hx(AIGS.surfaceSoft),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            {p.caption && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: hx(AIGS.muted),
                  textAlign: "center",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {p.caption}
              </div>
            )}
          </div>
        ))}
      </div>
      <BottomLogo />
    </div>
  );
}

function Closing() {
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <div style={{ position: "absolute", top: 56, left: 72 }}>
        <Logo />
      </div>
      <div style={{ position: "absolute", left: 72, top: 320, right: 72 }}>
        <div style={{ fontSize: 64, letterSpacing: "-0.03em", color: hx(AIGS.ink) }}>Gracias</div>
        <div style={{ fontSize: 18, color: hx(AIGS.body), marginTop: 18 }}>
          contacto@aerodromosigs.cl · www.aerodromosigs.cl
        </div>
      </div>
    </div>
  );
}

/* ---------- Piezas ---------- */
function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: hx(AIGS.surfaceStrong),
        color: hx(color),
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "6px 14px",
        borderRadius: 999,
      }}
    >
      {children}
    </span>
  );
}

function Kpi({
  label,
  value,
  sub,
  valueColor = AIGS.blue,
  subColor = AIGS.muted,
  extra,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  subColor?: string;
  extra?: React.ReactNode; // contenido opcional entre el valor y el sub (p. ej. composición del NPS)
}) {
  return (
    <div
      style={{
        border: `1px solid ${hx(AIGS.hairline)}`,
        borderRadius: 12,
        background: "#fff",
        padding: "16px 18px",
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: hx(AIGS.muted) }}>
        {label}
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 30, fontWeight: 700, color: hx(valueColor), lineHeight: 1.1 }}>
        {value}
      </div>
      {extra}
      {sub && <div style={{ fontSize: 12, color: hx(subColor) }}>{sub}</div>}
    </div>
  );
}

function Th({ children, align, w }: { children: React.ReactNode; align: "left" | "right"; w: string }) {
  return (
    <th
      style={{
        width: w,
        textAlign: align,
        padding: "var(--pv, 8px) 12px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  color = AIGS.body,
  mono,
  bold,
}: {
  children: React.ReactNode;
  align: "left" | "right";
  color?: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "var(--pv, 8px) 12px",
        color: hx(color),
        fontFamily: mono ? FONT.mono : undefined,
        fontWeight: bold ? 700 : 400,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </td>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: hx(AIGS.muted),
        fontSize: 18,
        padding: 72,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

/* ---------- CSS de pantalla + impresión ---------- */
function PrintStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
        .slide-frame { position: relative; width: 100%; overflow: hidden; margin: 0 auto 24px; }
        .rslide { position: relative; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06); border-radius: 8px; overflow: hidden; }
        @media print {
          @page { size: 13.333in 7.5in; margin: 0; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .deck-wrap { max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .slide-frame { height: auto !important; width: 13.333in !important; margin: 0 !important; overflow: visible; page-break-after: always; break-after: page; }
          .slide-frame:last-child { page-break-after: auto; break-after: auto; }
          .rslide { transform: none !important; width: 13.333in !important; height: 7.5in !important; box-shadow: none !important; border-radius: 0 !important; }
        }
      `,
      }}
    />
  );
}
