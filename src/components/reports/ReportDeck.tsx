"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
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
} from "recharts";
import { AIGS, SERIES, FONT, hx, fmtInt, fmtMMSS, pct, fmtScore, fmtNps, scoreColor, npsColor } from "@/lib/reports/design";
import {
  AGA_GUIDE_KPIS,
  AGA_GUIDE_PERIOD_NOTE,
  AGA_GUIDE_ATTRIBUTES,
  AGA_GUIDE_SERVICES,
  AGA_GUIDE_SCALE_NOTE,
  AGA_GUIDE_EXAMPLE_ATTRIBUTE,
  AGA_GUIDE_EXAMPLE_SERVICE,
} from "@/lib/reports/agaGuide";

// Datos serializables que arma la página (server). Estructuralmente compatible
// con MonthlyReport de src/lib/reports/monthlyReport.ts.
export type DeckData = {
  airport: { code: string; name: string; short: string | null; companyName: string; sedeLabel: string | null };
  month: string;
  monthLabel: string;
  season: { label: string; from: string; to: string };
  asq:
    | {
        seasonLabel: string;
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
  attributes: AgaScoreDeck[];
  services: (AgaScoreDeck & { usePct: number | null; useN: number })[];
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

// Reparte las fotos en grupos de máx. 4 (una diapositiva "Fotografías" por grupo).
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function ReportDeck({
  data,
  comentarios,
  photos,
}: {
  data: DeckData;
  comentarios?: string;
  photos?: DeckPhoto[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const comments = (comentarios ?? "").trim();
  const photoGroups = chunk(photos ?? [], 4);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => setScale(Math.min(1, el.clientWidth / SLIDE_W));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pptxHref =
    `/api/reports/pptx?airport=${encodeURIComponent(data.airport.code)}&mes=${data.month}` +
    (comments ? `&comentarios=${encodeURIComponent(comments)}` : "");

  return (
    <div className="min-h-screen bg-slate-100" style={{ fontFamily: FONT.face }}>
      <PrintStyles />

      {/* Barra de acciones (no se imprime) */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <a href="/admin/informes" className="text-sm text-slate-500 hover:text-slate-800">
            ← Informes
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
        {/* Portada */}
        <Frame scale={scale}>
          <Cover data={data} />
        </Frame>

        {/* Módulo 01 */}
        <Frame scale={scale}>
          <Section module="Módulo 01" title="Encuestas ASQ" />
        </Frame>
        <Frame scale={scale}>
          <AsqSlide data={data} />
        </Frame>

        {/* Módulo 02 */}
        <Frame scale={scale}>
          <Section module="Módulo 02" title="Mediciones de tiempos" />
        </Frame>
        {data.processes.length === 0 ? (
          <Frame scale={scale}>
            <EmptyTiempos data={data} />
          </Frame>
        ) : (
          data.processes.map((p) => (
            <Frame key={`${p.proceso}-${p.fase ?? ""}`} scale={scale}>
              <ProcesoSlide data={data} p={p} />
            </Frame>
          ))
        )}

        {/* Módulo 03: Encuestas AGA (solo si el aeropuerto tiene plan AGA vigente) */}
        {data.aga.length > 0 && (
          <>
            <Frame scale={scale}>
              <Section module="Módulo 03" title="Encuestas AGA · Experiencia" />
            </Frame>
            <Frame scale={scale}>
              <AgaGuideSlide data={data} />
            </Frame>
            {data.aga.map((s) => (
              <Fragment key={`aga-${s.audience}-${s.planTitle}`}>
                <Frame scale={scale}>
                  <AgaSlide data={data} s={s} />
                </Frame>
                {(s.voice.appraisal || s.voice.quotes.length > 0) && (
                  <Frame scale={scale}>
                    <VoiceSlide data={data} s={s} />
                  </Frame>
                )}
              </Fragment>
            ))}
          </>
        )}

        {/* Comentarios y sugerencias (opcional, justo antes del cierre) */}
        {comments && (
          <Frame scale={scale}>
            <Comments data={data} comentarios={comments} />
          </Frame>
        )}

        {/* Fotografías (opcional, justo después de comentarios): máx. 4 por diapositiva */}
        {photoGroups.map((group, i) => (
          <Frame key={`photos-${i}`} scale={scale}>
            <PhotosSlide data={data} photos={group} index={i} total={photoGroups.length} />
          </Frame>
        ))}

        {/* Cierre */}
        <Frame scale={scale}>
          <Closing />
        </Frame>
      </div>
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
        <Badge color={AIGS.blue}>Informe mensual</Badge>
        <div style={{ fontSize: 60, lineHeight: 1.02, letterSpacing: "-0.02em", marginTop: 16 }}>
          {data.airport.name}
        </div>
        <div style={{ fontSize: 22, color: hx(AIGS.body), marginTop: 20 }}>{data.airport.companyName}</div>
        <div style={{ fontSize: 16, color: hx(AIGS.muted), marginTop: 8 }}>
          {data.aga.length > 0
            ? "Cumplimiento de Encuestas ASQ, mediciones de tiempos y Encuestas AGA"
            : "Cumplimiento de Encuestas ASQ y mediciones de tiempos"}{" "}
          · {data.monthLabel}
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
        subtitle={a ? `${full} · ${a.seasonLabel.replace("-", " ")}` : full}
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

// Tope "bonito" (minutos) para compartir escala entre el gráfico principal y los mini.
function niceMax(m: number): number {
  const steps = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120];
  const target = Math.max(1, m) * 1.1;
  return steps.find((s) => s >= target) ?? Math.ceil(target / 30) * 30;
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ display: "inline-block", width: 16, borderTop: `2px ${dashed ? "dashed" : "solid"} ${hx(color)}` }} />
      {label}
    </span>
  );
}

function ChartLegend({ meta }: { meta: number | null }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: hx(AIGS.muted) }}>
      <LegendItem color={SERIES.prom} label="Promedio" />
      <LegendItem color={SERIES.med} label="Mediana" dashed />
      <LegendItem color={SERIES.p90} label="p90" />
      {meta != null && <LegendItem color={SERIES.meta} label="Estándar IATA" dashed />}
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
  const yMax = niceMax(Math.max(0, ...p.series.flatMap((s) => [s.prom ?? 0, s.med ?? 0, s.p90 ?? 0]), p.meta ?? 0));
  // Sin mediciones este mes: la diapositiva se muestra igual (hubo mediciones antes en la
  // temporada). Los KPIs del mes van en "—" y se apoya el lector en el acumulado del periodo.
  const kpi = p.kpi;
  const subtitle = p.monthHasData
    ? `${full} · ${data.monthLabel}`
    : `${full} · ${data.monthLabel} · sin mediciones este mes (se muestra el acumulado de la temporada)`;
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title={title} subtitle={subtitle} />
      {/* KPIs: número del mes en grande + promedio del periodo abajo (pequeño) */}
      <div style={{ position: "absolute", top: 150, left: 72, right: 72 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          <Kpi label="Promedio" value={kpi ? fmtMMSS(kpi.prom) : "—"} sub={`Periodo ${fmtMMSS(p.kpiSeason.prom)}`} />
          <Kpi label="P90" value={kpi ? fmtMMSS(kpi.p90) : "—"} sub={`Periodo ${fmtMMSS(p.kpiSeason.p90)}`} />
          <Kpi label="Mediana" value={kpi ? fmtMMSS(kpi.med) : "—"} sub={`Periodo ${fmtMMSS(p.kpiSeason.med)}`} />
          {p.meta == null ? (
            <Kpi label="Estándar IATA" value="—" sub="sin estándar" />
          ) : (
            <Kpi
              label="Margen vs Est. IATA"
              value={fmtMMSS(p.margin)}
              sub={`Periodo ${fmtMMSS(seasonMargin)}`}
              valueColor={p.margin == null ? AIGS.muted : marginOk ? AIGS.up : AIGS.down}
            />
          )}
          <Kpi label="N° de mediciones" value={fmtInt(kpi ? kpi.n : 0)} sub={`Periodo ${fmtInt(p.kpiSeason.n)}`} />
        </div>
      </div>

      {/* Evolutivo principal (más chico si hay desglose por aerolínea) */}
      <div
        style={
          hasMini
            ? { position: "absolute", top: 292, left: 72, right: 72 }
            : { position: "absolute", top: 410, left: 72, right: 72, bottom: 56 }
        }
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: hx(AIGS.ink) }}>Evolutivo</div>
          <ChartLegend meta={p.meta} />
        </div>
        <ProcesoChart p={p} height={hasMini ? 146 : 210} yMax={yMax} />
      </div>

      {/* Mini-gráficos por aerolínea (Check in / Retiro), misma escala Y que el principal */}
      {hasMini && (
        <div style={{ position: "absolute", top: 486, left: 72, right: 72, bottom: 70 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: hx(AIGS.ink), marginBottom: 6 }}>
            Promedio por aerolínea{" "}
            <span style={{ fontWeight: 400, color: hx(AIGS.muted) }}>· línea: promedio · – – estándar IATA</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
            {p.byAirline.slice(0, 6).map((a) => (
              <MiniAirlineChart key={a.airline} a={a} yMax={yMax} />
            ))}
          </div>
        </div>
      )}
      <BottomLogo />
    </div>
  );
}

function MiniAirlineChart({ a, yMax }: { a: DeckData["processes"][number]["byAirline"][number]; yMax: number }) {
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
        </span>
      </div>
      <div style={{ height: 94, marginTop: 3 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <YAxis
              domain={[0, yMax]}
              ticks={[0, Math.round(yMax / 2), yMax]}
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
            <Line type="monotone" dataKey="prom" stroke={hx(SERIES.prom)} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProcesoChart({ p, height = 200, yMax }: { p: DeckData["processes"][number]; height?: number; yMax: number }) {
  const chartData = p.series.map((s) => ({
    label: s.label,
    prom: s.prom,
    med: s.med,
    p90: s.p90,
    bandDelta: s.med != null && s.p90 != null ? Math.max(0, s.p90 - s.med) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 6, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: hx(AIGS.muted), fontSize: 12 }} tickLine={false} axisLine={{ stroke: hx(AIGS.hairline) }} />
        <YAxis
          tickFormatter={(v) => fmtMMSS(Number(v))}
          tick={{ fill: hx(AIGS.muted), fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          domain={[0, yMax]}
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
        <Line type="monotone" dataKey="p90" stroke={hx(SERIES.p90)} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="med" stroke={hx(SERIES.med)} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="prom" stroke={hx(SERIES.prom)} strokeWidth={2} dot={{ r: 2, fill: hx(SERIES.prom) }} isAnimationActive={false} connectNulls />
        {p.meta != null && <ReferenceLine y={p.meta} stroke={hx(SERIES.meta)} strokeDasharray="4 4" strokeWidth={1.5} />}
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
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}
      >
        {AGA_GUIDE_KPIS.map((k) => (
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
        {AGA_GUIDE_PERIOD_NOTE}
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

function Comments({ data, comentarios }: { data: DeckData; comentarios: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title="Comentarios y sugerencias" subtitle={`${airportFull(data)} · ${data.monthLabel}`} />
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
        {comentarios}
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
