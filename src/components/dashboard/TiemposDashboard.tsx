"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  PROCESOS,
  AIRLINES,
  metaFor,
  hasAirline,
  hasFase,
  ymLabel,
  seasonOf,
  monthsBetween,
  type Proceso,
  type Fase,
  type Periodo,
} from "@/lib/dashboardTiempos";

const COL = { prom: "#003152", med: "#3d7593", p90: "#a9b2bf", meta: "#D9B300", band: "rgba(0,49,82,0.06)" };

// Estilo de <select> alineado a los controles de la app (borde marcado para verse sobre slate-50).
const SELECT_CLS =
  "min-w-[180px] rounded-md border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

type Agg = { name: string; n: number; prom: number; med: number; p90: number };
type Serie = { ym: string; n: number; prom: number; med: number; p90: number };
type ApiData = { byAirport: Agg[]; series: Serie[]; seasons: Periodo[] };
// Aeropuerto ya filtrado por alcance/vigencia en el servidor (subconjunto de AIRPORTS).
type DashboardAirport = { code: string; name: string; short: string };

const nf0 = new Intl.NumberFormat("es-CL");
// Duración (minutos decimales) -> "MM:SS" (minutos:segundos).
function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  const total = Math.round(v * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Escala Y "bonita": tope y ticks en pasos redondos de minutos, para que el eje
// (en mm:ss) muestre 00:00, 05:00, 10:00… en vez de un tope raro (22:24).
function niceScale(rawMax: number): { max: number; ticks: number[] } {
  const STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120];
  const safe = rawMax > 0 ? rawMax : 1;
  const step = STEPS.find((s) => s >= safe / 4) ?? 120;
  let max = Math.ceil(safe / step) * step;
  if (max <= safe) max += step; // deja aire sobre el valor máximo / el estándar
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-6; t += step) ticks.push(t);
  return { max, ticks };
}

export default function TiemposDashboard({ airports }: { airports: DashboardAirport[] }) {
  const [proceso, setProceso] = useState<Proceso>("Check in");
  const [airline, setAirline] = useState<string>("Todas");
  const [fase, setFase] = useState<Fase>("espera");
  const [airportCode, setAirportCode] = useState<string>(() => airports[0]?.code ?? "");
  const [periodo, setPeriodo] = useState<Periodo>(() => seasonOf(new Date())); // estimación inicial
  const [seasons, setSeasons] = useState<Periodo[]>([]); // temporadas con datos del aeropuerto
  const [showMeta, setShowMeta] = useState(false);

  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ msg: string; code?: string } | null>(null);

  const airport = airports.find((a) => a.code === airportCode) ?? airports[0] ?? null;
  const meta = metaFor(proceso, airline);

  const reqId = useRef(0);
  useEffect(() => {
    if (!airport) {
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    const qs = new URLSearchParams({
      proceso,
      airport: airport.name,
      desde: periodo.from,
      hasta: periodo.to,
    });
    if (hasFase(proceso)) qs.set("fase", fase);
    if (hasAirline(proceso) && airline !== "Todas") qs.set("airline", airline);

    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/tiempos?${qs.toString()}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Object.assign(new Error(j.error || "Error"), { code: j.code });
        return j as ApiData;
      })
      .then((j) => {
        if (id !== reqId.current) return;
        setData(j);
        setSeasons(j.seasons);
        // Ajusta a la temporada más reciente CON datos de este aeropuerto si la
        // seleccionada no existe para él (p. ej. al cambiar de aeropuerto).
        if (j.seasons.length && !j.seasons.some((s) => s.from === periodo.from)) {
          setPeriodo(j.seasons[0]);
        }
      })
      .catch((e: Error & { code?: string }) => {
        if (id === reqId.current) setError({ msg: e.message, code: e.code });
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [proceso, airline, fase, airport?.name, periodo]);

  const selAgg = airport ? data?.byAirport.find((r) => r.name === airport.name) ?? null : null;

  // Serie mensual continua (rellena los meses sin datos con null).
  const chartData = useMemo(() => {
    const byYm = new Map((data?.series ?? []).map((s) => [s.ym, s]));
    return monthsBetween(periodo.from, periodo.to).map((ym) => {
      const s = byYm.get(ym);
      const med = s ? s.med : null;
      const p90 = s ? s.p90 : null;
      return {
        label: ymLabel(ym),
        prom: s ? s.prom : null,
        med,
        p90,
        bandDelta: med != null && p90 != null ? Math.max(0, p90 - med) : null,
      };
    });
  }, [data, periodo]);

  const barData = useMemo(
    () =>
      airports.map((a) => {
        const r = data?.byAirport.find((x) => x.name === a.name);
        return { code: a.code, prom: r ? r.prom : 0 };
      }),
    [data]
  );

  const dataMax = Math.max(0, ...chartData.map((d) => d.p90 ?? 0), ...barData.map((d) => d.prom));
  const rawMax = showMeta && meta ? Math.max(dataMax, meta) : dataMax;
  const { max: yTop, ticks: yTicks } = niceScale(rawMax);

  if (airports.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No tienes aeropuertos con el cuestionario &ldquo;Mediciones de tiempos&rdquo; vigente. Cuando un
        administrador lo habilite para tu aeropuerto, aparecerá aquí.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Field label="Aeropuerto">
          <div className="flex gap-2">
            {airports.map((a) => (
              <Pill key={a.code} on={a.code === airportCode} onClick={() => setAirportCode(a.code)}>
                {a.code}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Periodo">
          <select
            className={SELECT_CLS}
            value={periodo.from}
            onChange={(e) => {
              const s = seasons.find((x) => x.from === e.target.value);
              if (s) setPeriodo(s);
            }}
          >
            {(seasons.length ? seasons : [periodo]).map((s) => (
              <option key={s.from} value={s.from}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Proceso">
          <select
            className={SELECT_CLS}
            value={proceso}
            onChange={(e) => {
              setProceso(e.target.value as Proceso);
              setAirline("Todas");
            }}
          >
            {PROCESOS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>

        {hasAirline(proceso) && (
          <Field label="Aerolínea">
            <select
              className={SELECT_CLS}
              value={airline}
              onChange={(e) => setAirline(e.target.value)}
            >
              <option>Todas</option>
              {AIRLINES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
        )}

        {hasFase(proceso) && (
          <Field label="Fase del retiro">
            <div className="flex gap-2">
              <Pill on={fase === "espera"} onClick={() => setFase("espera")}>
                Espera 1ª maleta
              </Pill>
              <Pill on={fase === "descarga"} onClick={() => setFase("descarga")}>
                Descarga de correa
              </Pill>
            </div>
          </Field>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Promedio" value={fmt(selAgg?.prom)} unit="mm:ss" />
        <Kpi label="P90" value={fmt(selAgg?.p90)} unit="mm:ss" />
        <Kpi label="Mediana" value={fmt(selAgg?.med)} unit="mm:ss" />
        {meta != null ? (
          <MarginKpi meta={meta} prom={selAgg?.prom ?? null} />
        ) : (
          <Kpi label="Estándar IATA" value="—" unit="sin estándar" />
        )}
        <Kpi label="N° de mediciones" value={selAgg ? nf0.format(selAgg.n) : "—"} unit="en el filtro" />
      </div>

      {/* Evolutivo — distribución */}
      <div className="card">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Evolutivo — distribución</h2>
            <p className="text-xs text-slate-400">
              &ldquo;{proceso}&rdquo;
              {hasFase(proceso) ? ` · ${fase === "espera" ? "espera 1ª maleta" : "descarga de correa"}` : ""}
              {hasAirline(proceso) && airline !== "Todas" ? ` · ${airline}` : ""} · {airport?.short}
            </p>
          </div>
          {meta != null && (
            <Pill on={showMeta} onClick={() => setShowMeta((v) => !v)}>
              {showMeta ? "Ocultar Estándar IATA" : "Mostrar Estándar IATA"}
            </Pill>
          )}
        </div>

        <div className="mb-1 flex flex-wrap gap-4 text-xs text-slate-500">
          <LegendItem color={COL.prom} label="Promedio" />
          <LegendItem color={COL.med} label="Mediana" dashed />
          <LegendItem color={COL.p90} label="p90 (banda)" />
          {showMeta && meta != null && <LegendItem color={COL.meta} label={`Estándar IATA ${fmt(meta)}`} dashed />}
        </div>

        <ChartFrame loading={loading} error={error} empty={!loading && !error && chartData.every((d) => d.prom == null)}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="#eef2f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis
                domain={[0, yTop]}
                ticks={yTicks}
                tickFormatter={fmt}
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={56}
                label={{ value: "mm:ss", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "#94a3b8", fontSize: 11 } }}
              />
              <Tooltip content={<ChartTooltip />} />
              {/* Banda mediana → p90 (dos áreas apiladas: base invisible + delta con relleno) */}
              <Area type="monotone" dataKey="med" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
              <Area type="monotone" dataKey="bandDelta" stackId="band" stroke="none" fill={COL.band} isAnimationActive={false} activeDot={false} />
              <Line type="monotone" dataKey="p90" stroke={COL.p90} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="med" stroke={COL.med} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="prom" stroke={COL.prom} strokeWidth={2} dot={{ r: 2, fill: COL.prom }} isAnimationActive={false} connectNulls />
              {showMeta && meta != null && <ReferenceLine y={meta} stroke={COL.meta} strokeDasharray="4 4" strokeWidth={1.5} />}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Promedio por aeropuerto */}
        <div className="card">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-800">Promedio por aeropuerto</h2>
            <span className="text-xs text-slate-400">promedio del periodo</span>
          </div>
          <ChartFrame loading={loading} error={error} empty={!loading && !error && barData.every((d) => d.prom === 0)}>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={barData} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="code" tick={{ fill: "#475569", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis
                  domain={[0, yTop]}
                  ticks={yTicks}
                  tickFormatter={fmt}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  label={{ value: "mm:ss", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "#94a3b8", fontSize: 11 } }}
                />
                <Tooltip formatter={(v) => [fmt(Number(v)), "Promedio"]} cursor={{ fill: "rgba(0,49,82,0.04)" }} />
                <Bar dataKey="prom" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {barData.map((d) => (
                    <Cell key={d.code} fill={d.code === airportCode ? "#003152" : "#cbd5e1"} />
                  ))}
                </Bar>
                {showMeta && meta != null && <ReferenceLine y={meta} stroke={COL.meta} strokeDasharray="4 4" strokeWidth={1.5} />}
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        {/* Resumen */}
        <div className="card">
          <h2 className="mb-2 text-base font-semibold text-slate-800">Resumen</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="py-1.5 text-left font-normal">Aerop.</th>
                <th className="py-1.5 text-right font-normal">N</th>
                <th className="py-1.5 text-right font-normal">Prom</th>
                <th className="py-1.5 text-right font-normal">Med</th>
                <th className="py-1.5 text-right font-normal">p90</th>
                <th className="py-1.5 text-right font-normal">Est. IATA</th>
              </tr>
            </thead>
            <tbody>
              {airports.map((a) => {
                const r = data?.byAirport.find((x) => x.name === a.name);
                const sel = a.code === airportCode;
                const under = meta != null && r ? r.prom <= meta : null;
                return (
                  <tr key={a.code} className="border-t border-slate-100 tabular-nums text-slate-700">
                    <td className={`py-1.5 ${sel ? "font-semibold text-brand-700" : "text-slate-500"}`}>
                      {sel ? "● " : ""}
                      {a.code}
                    </td>
                    <td className="py-1.5 text-right">{r ? nf0.format(r.n) : "—"}</td>
                    <td className="py-1.5 text-right">{fmt(r?.prom)}</td>
                    <td className="py-1.5 text-right">{fmt(r?.med)}</td>
                    <td className="py-1.5 text-right">{fmt(r?.p90)}</td>
                    <td className="py-1.5 text-right">
                      {meta == null || !r ? (
                        "—"
                      ) : (
                        <span className={under ? "text-green-600" : "text-red-600"}>{under ? "✓" : "✗"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

/* ----- piezas de UI ----- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-lg border px-3.5 py-1.5 text-sm font-medium shadow-sm transition-colors ${
        on
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-slate-400 bg-slate-100 text-slate-800 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Kpi({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold leading-tight text-brand-700">
        {value} <span className="text-xs font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function MarginKpi({ meta, prom }: { meta: number; prom: number | null }) {
  const mg = prom == null ? null : meta - prom;
  const ok = mg != null && mg >= 0;
  const cls = mg == null ? "text-slate-400" : ok ? "text-green-700" : "text-red-700";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">Margen vs Estándar IATA</div>
      <div className={`mt-1 text-2xl font-bold leading-tight ${cls}`}>
        {mg == null ? "—" : `${mg >= 0 ? "−" : "+"}${fmt(Math.abs(mg))}`}{" "}
        <span className={`text-xs font-normal ${cls}`}>
          {mg == null ? `Est. IATA ${fmt(meta)}` : `${ok ? "bajo" : "sobre"} Est. IATA ${fmt(meta)}`}
        </span>
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-4"
        style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
      />
      {label}
    </span>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value;
  const rows: [string, number | undefined, string][] = [
    ["Promedio", get("prom"), COL.prom],
    ["Mediana", get("med"), COL.med],
    ["p90", get("p90"), COL.p90],
  ];
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-slate-700">{label}</div>
      {rows.map(
        ([n, v, c]) =>
          v != null && (
            <div key={n} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />
              <span className="text-slate-500">{n}:</span>
              <span className="font-medium text-slate-800">{fmt(v)}</span>
            </div>
          )
      )}
    </div>
  );
}

function ChartFrame({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: { msg: string; code?: string } | null;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (error) {
    const creds = error.code === "BQ_NO_CREDS";
    return (
      <div className="flex h-[230px] flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium text-slate-600">
          {creds ? "El dashboard aún no puede leer BigQuery" : "No se pudieron cargar los datos"}
        </p>
        <p className="max-w-md text-xs text-slate-400">
          {creds
            ? "Faltan las credenciales GCP_PROJECT_ID y GCP_SA_KEY en el entorno del sitio."
            : error.msg}
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex h-[230px] items-center justify-center text-sm text-slate-400">Cargando…</div>
    );
  }
  if (empty) {
    return (
      <div className="flex h-[230px] items-center justify-center text-sm text-slate-400">
        Sin mediciones para este filtro.
      </div>
    );
  }
  return <>{children}</>;
}
