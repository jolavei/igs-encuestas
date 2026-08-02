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
} from "recharts";
import { AIGS, SERIES, FONT, hx, fmtInt, fmtMMSS, pct, shortAirline } from "@/lib/reports/design";

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
    kpi: { n: number; prom: number; med: number; p90: number };
    margin: number | null;
    series: { label: string; prom: number | null; med: number | null; p90: number | null }[];
    byAirline: {
      airline: string;
      meta: number | null;
      monthProm: number | null;
      monthN: number;
      series: { label: string; prom: number | null }[];
    }[];
  }[];
  bqError: string | null;
};

const SLIDE_W = 1280;
const SLIDE_H = 720;

export default function ReportDeck({ data }: { data: DeckData }) {
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

  const pptxHref = `/api/reports/pptx?airport=${encodeURIComponent(data.airport.code)}&mes=${data.month}`;

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

        {/* Cierre */}
        <Frame scale={scale}>
          <Closing data={data} />
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
const TINT = "5,94,132"; // #055E84 (tinte azul de la portada, referencia AIGS)
const CLOSE_BG = "8DB0BB"; // teal del cierre (referencia AIGS)

// Logo en la esquina inferior izquierda de las diapositivas de contenido.
function BottomLogo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Aeródromos IGS"
      style={{ position: "absolute", left: 48, bottom: 20, height: 30, width: "auto", opacity: 0.9 }}
    />
  );
}

function Cover({ data }: { data: DeckData }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Foto de terminal + tinte azul */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/report/terminal.jpg"
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(105deg, rgba(${TINT},0.86) 0%, rgba(${TINT},0.62) 45%, rgba(${TINT},0.30) 100%)`,
        }}
      />
      {/* Logo blanco arriba-derecha */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/report/logo-blanco.png"
        alt="Aeródromos IGS"
        style={{ position: "absolute", top: 60, right: 72, height: 66, width: "auto" }}
      />
      {/* Título + datos */}
      <div style={{ position: "absolute", left: 84, top: 250, right: 400, color: "#fff" }}>
        <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
          Informe Mensual
          <br />
          Encuestas de
          <br />
          Calidad de Servicio
        </div>
      </div>
      <div style={{ position: "absolute", left: 84, top: 560, right: 84, color: "#fff" }}>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{data.airport.name}</div>
        <div style={{ fontSize: 20, marginTop: 4, opacity: 0.95 }}>{data.monthLabel}</div>
        <div style={{ width: 360, height: 2, background: "rgba(255,255,255,0.8)", margin: "22px 0 14px" }} />
        <div style={{ fontSize: 14, letterSpacing: "0.02em", opacity: 0.95 }}>
          Elaborado por AERÓDROMOS.IGS
        </div>
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
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead
        title="Encuestas ASQ — cumplimiento"
        subtitle={a ? `${data.airport.short ?? data.airport.name} · temporada ${a.seasonLabel}` : data.airport.name}
      />
      {!a ? (
        <Centered>Aún no hay datos de ASQ para este aeropuerto.</Centered>
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

function ProcesoSlide({ data, p }: { data: DeckData; p: DeckData["processes"][number] }) {
  const marginOk = p.margin != null && p.margin >= 0;
  const title = `${p.proceso}${p.faseLabel ? ` — ${p.faseLabel}` : ""}`;
  const hasMini = p.byAirline.length > 0;
  const cols = Math.min(p.byAirline.length, 6);
  return (
    <div style={{ position: "absolute", inset: 0, padding: 72 }}>
      <SlideHead title={title} subtitle={`${data.airport.short ?? data.airport.name} · ${data.monthLabel}`} />
      <div style={{ position: "absolute", top: 150, left: 72, right: 72 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          <Kpi label="Promedio" value={fmtMMSS(p.kpi.prom)} sub="mm:ss" />
          <Kpi label="P90" value={fmtMMSS(p.kpi.p90)} sub="mm:ss" />
          <Kpi label="Mediana" value={fmtMMSS(p.kpi.med)} sub="mm:ss" />
          {p.meta == null ? (
            <Kpi label="Estándar IATA" value="—" sub="sin estándar" />
          ) : (
            <Kpi
              label="Margen vs Est. IATA"
              value={fmtMMSS(p.margin)}
              sub={`${marginOk ? "bajo" : "sobre"} estándar ${fmtMMSS(p.meta)}`}
              valueColor={marginOk ? AIGS.up : AIGS.down}
              subColor={marginOk ? AIGS.up : AIGS.down}
            />
          )}
          <Kpi label="N° de mediciones" value={fmtInt(p.kpi.n)} sub="en el mes" />
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
        <div style={{ fontSize: 15, fontWeight: 700, color: hx(AIGS.ink), marginBottom: 6 }}>
          Evolutivo — distribución (mm:ss)
        </div>
        <ProcesoChart p={p} height={hasMini ? 150 : 200} />
      </div>

      {/* Mini-gráficos por aerolínea (Check in / Retiro) */}
      {hasMini && (
        <div style={{ position: "absolute", top: 500, left: 72, right: 72, bottom: 74 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: hx(AIGS.ink), marginBottom: 6 }}>
            Promedio por aerolínea (mm:ss)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
            {p.byAirline.slice(0, 6).map((a) => (
              <MiniAirlineChart key={a.airline} a={a} />
            ))}
          </div>
        </div>
      )}
      <BottomLogo />
    </div>
  );
}

function MiniAirlineChart({ a }: { a: DeckData["processes"][number]["byAirline"][number] }) {
  const chartData = a.series.map((s) => ({ label: s.label, prom: s.prom }));
  const ok = a.meta != null && a.monthProm != null ? a.monthProm <= a.meta : null;
  const valColor = ok == null ? AIGS.blue : ok ? AIGS.up : AIGS.down;
  return (
    <div
      style={{
        border: `1px solid ${hx(AIGS.hairline)}`,
        borderRadius: 10,
        background: "#fff",
        padding: "8px 10px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: hx(AIGS.ink),
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {shortAirline(a.airline)}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: hx(valColor) }}>
          {fmtMMSS(a.monthProm)}
        </span>
        <span style={{ fontSize: 10, color: hx(AIGS.muted) }}>n={a.monthN}</span>
      </div>
      <div style={{ height: 58, marginTop: 2 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <YAxis hide domain={[0, "auto"]} />
            <XAxis dataKey="label" hide />
            {a.meta != null && <ReferenceLine y={a.meta} stroke={hx(SERIES.meta)} strokeDasharray="3 3" strokeWidth={1} />}
            <Line type="monotone" dataKey="prom" stroke={hx(SERIES.prom)} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProcesoChart({ p, height = 200 }: { p: DeckData["processes"][number]; height?: number }) {
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
          domain={[0, "auto"]}
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
      <SlideHead title="Mediciones de tiempos" subtitle={data.airport.short ?? data.airport.name} />
      <Centered>
        {data.bqError
          ? "No se pudieron leer las mediciones de tiempos (credenciales de BigQuery)."
          : "Sin mediciones de tiempos registradas para este mes."}
      </Centered>
      <BottomLogo />
    </div>
  );
}

function Closing({ data }: { data: DeckData }) {
  const year = data.month.slice(0, 4);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: hx(CLOSE_BG),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/report/logo-blanco.png" alt="Aeródromos IGS" style={{ height: 168, width: "auto" }} />
      <div
        style={{
          position: "absolute",
          bottom: 110,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "#fff",
          fontSize: 18,
          letterSpacing: "0.01em",
        }}
      >
        contacto@aerodromosigs.cl&nbsp;&nbsp;|&nbsp;&nbsp;Copyright © {year}&nbsp;&nbsp;|&nbsp;&nbsp;Aeródromos IGS
      </div>
    </div>
  );
}

/* ---------- Piezas ---------- */

function Kpi({
  label,
  value,
  sub,
  valueColor = AIGS.blue,
  subColor = AIGS.muted,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  subColor?: string;
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
