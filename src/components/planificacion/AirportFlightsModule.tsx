"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  PieChart,
  Pie,
} from "recharts";
import RangeCalendar from "./RangeCalendar";
import { airportLabel, AIRPORTS } from "@/lib/flights/airports";
import type { FlightDirection, ScheduledFlight } from "@/lib/flights/types";

const MAX_WINDOW_DAYS = 31;

const SELECT_CLS =
  "w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
const INPUT_CLS =
  "w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// Etiqueta legible de la fuente de datos que reporta la API.
const PROVIDER_LABEL: Record<string, string> = {
  db: "base de datos (guardado)",
  aerodatabox: "AeroDataBox (en vivo)",
  mock: "datos de demostración (mock)",
};

// Color por aerolínea (conocidas + fallback determinístico para el resto).
const AIRLINE_COLOR: Record<string, string> = { LA: "#003152", H2: "#2f7d92", JA: "#D9B300" };
const PALETTE = ["#6f9cb6", "#a9772f", "#4b6b57", "#7d4b6b", "#b0553a", "#3d7593", "#8a8f57"];
function airlineColor(code: string) {
  if (AIRLINE_COLOR[code]) return AIRLINE_COLOR[code];
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// --- helpers de fecha (trabajan en fecha local, sin husos) -------------------
function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayISO() {
  return isoOf(new Date());
}
function addDaysISO(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return isoOf(dt);
}
function spanDays(from: string, to: string) {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000) + 1; // inclusivo
}
function fmtDayLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "2-digit", month: "short" }).format(
    new Date(y, m - 1, d),
  );
}
function fmtDayShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "2-digit", month: "short" }).format(
    new Date(y, m - 1, d),
  );
}
function hourOf(time: string) {
  return Number(time.slice(0, 2));
}

type ApiResponse = {
  provider: string;
  origin: string;
  from: string;
  to: string;
  count: number;
  flights: ScheduledFlight[];
  generatedAt: string;
};

type AirportOption = { iata: string; name: string };

export default function AirportFlightsModule({
  airports,
  defaultIata,
  contextLabel,
  isDemo = false,
}: {
  airports: AirportOption[];
  defaultIata: string;
  contextLabel?: string;
  isDemo?: boolean;
}) {
  const initFrom = todayISO();
  const initTo = addDaysISO(initFrom, 6);

  // "draft" = lo que se está editando; "applied" = lo consultado (dispara fetch).
  const [draftIata, setDraftIata] = useState(defaultIata);
  const [draftFrom, setDraftFrom] = useState(initFrom);
  const [draftTo, setDraftTo] = useState(initTo);
  const [applied, setApplied] = useState({ iata: defaultIata, from: initFrom, to: initTo });
  const [showCalendar, setShowCalendar] = useState(false);

  // Filtros instantáneos (client-side).
  const [direction, setDirection] = useState<FlightDirection>("salida");
  const [airline, setAirline] = useState("todas");
  const [cell, setCell] = useState<{ day: string; hour: number } | null>(null);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const span = spanDays(applied.from, applied.to);
  const draftSpan = spanDays(draftFrom, draftTo);
  const draftValid = draftTo >= draftFrom && draftSpan <= MAX_WINDOW_DAYS && draftSpan >= 1;
  const dirty = draftIata !== applied.iata || draftFrom !== applied.from || draftTo !== applied.to;

  // Fetch al cambiar lo aplicado (incluye el montaje inicial).
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ origin: applied.iata, from: applied.from, to: applied.to });
    fetch(`/api/planificacion/flights?${qs}`, { signal: ac.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
        return body as ApiResponse;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Error al consultar vuelos.");
        setLoading(false);
      });
    return () => ac.abort();
  }, [applied]);

  // Al cambiar sentido/ventana, reinicia la aerolínea y la celda seleccionada.
  useEffect(() => {
    setAirline("todas");
    setCell(null);
  }, [direction, applied]);

  function consultar() {
    if (!draftValid) return;
    setApplied({ iata: draftIata, from: draftFrom, to: draftTo });
  }

  const dirLabel = direction === "salida" ? "salidas" : "llegadas";
  const counterLabel = direction === "salida" ? "Destino" : "Origen";

  // --- Derivados -------------------------------------------------------------
  const all = data?.flights ?? [];
  const directional = useMemo(() => all.filter((f) => f.direction === direction), [all, direction]);

  // Opciones de aerolínea presentes en el sentido actual (para el filtro dinámico).
  const airlineOptions = useMemo(() => {
    const m = new Map<string, { code: string; name: string; n: number }>();
    for (const f of directional) {
      const cur = m.get(f.airlineCode) ?? { code: f.airlineCode, name: f.airlineName || f.airlineCode, n: 0 };
      cur.n += 1;
      m.set(f.airlineCode, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [directional]);

  const flights = useMemo(
    () => (airline === "todas" ? directional : directional.filter((f) => f.airlineCode === airline)),
    [directional, airline],
  );

  const hourHist = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: String(i).padStart(2, "0"), n: 0 }));
    for (const f of flights) {
      const hr = hourOf(f.time);
      if (hr >= 0 && hr < 24) h[hr].n += 1;
    }
    return h;
  }, [flights]);

  const peakHour = useMemo(() => {
    let best = 0;
    for (let i = 1; i < hourHist.length; i++) if (hourHist[i].n > hourHist[best].n) best = i;
    return hourHist[best].n > 0 ? best : null;
  }, [hourHist]);

  const airlineBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flights) m.set(f.airlineCode, (m.get(f.airlineCode) ?? 0) + 1);
    return [...m.entries()]
      .map(([code, n]) => ({ code, name: airlineOptions.find((a) => a.code === code)?.name ?? code, value: n }))
      .sort((a, b) => b.value - a.value);
  }, [flights, airlineOptions]);

  const rows = useMemo(
    () =>
      [...flights].sort((a, b) =>
        a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.time < b.time ? -1 : a.time > b.time ? 1 : 0,
      ),
    [flights],
  );

  const days = useMemo(() => {
    const s = new Set(flights.map((f) => f.date));
    return [...s].sort();
  }, [flights]);

  const avgPerDay = span > 0 ? flights.length / span : 0;

  const cellFlights = useMemo(() => {
    if (!cell) return [];
    return flights
      .filter((f) => f.date === cell.day && hourOf(f.time) === cell.hour)
      .sort((a, b) => (a.time < b.time ? -1 : 1));
  }, [flights, cell]);

  return (
    <div className="space-y-5">
      {/* ---- Controles ---- */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Vuelos planificados</h2>
          {contextLabel && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{contextLabel}</span>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Filtros */}
          <div className="space-y-4">
            {/* Sentido */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sentido</label>
              <div className="inline-flex rounded-md border border-slate-300 p-0.5">
                {(["salida", "llegada"] as FlightDirection[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
                      direction === d ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {d === "salida" ? "Salidas" : "Llegadas"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Aeropuerto
                </label>
                <select className={SELECT_CLS} value={draftIata} onChange={(e) => setDraftIata(e.target.value)}>
                  {mergeAirportOptions(airports, draftIata).map((a) => (
                    <option key={a.iata} value={a.iata}>
                      {airportLabel(a.iata) === a.iata ? `${a.name} (${a.iata})` : airportLabel(a.iata)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Aerolínea
                </label>
                <select className={SELECT_CLS} value={airline} onChange={(e) => setAirline(e.target.value)}>
                  <option value="todas">Todas</option>
                  {airlineOptions.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.name} {a.code ? `(${a.code})` : ""} · {a.n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Fechas: compacto por defecto, calendario grande opcional */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ventana de tiempo
              </label>
              <button
                onClick={() => setShowCalendar((v) => !v)}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                {showCalendar ? "Usar campos" : "📅 Calendario"}
              </button>
            </div>

            {showCalendar ? (
              <RangeCalendar
                from={draftFrom}
                to={draftTo}
                onChange={(f, t) => {
                  setDraftFrom(f);
                  setDraftTo(t);
                }}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="mb-1 block text-[11px] text-slate-400">Desde</span>
                  <input
                    type="date"
                    className={INPUT_CLS}
                    value={draftFrom}
                    max={draftTo}
                    onChange={(e) => setDraftFrom(e.target.value)}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-slate-400">Hasta</span>
                  <input
                    type="date"
                    className={INPUT_CLS}
                    value={draftTo}
                    min={draftFrom}
                    onChange={(e) => setDraftTo(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="mt-2 text-xs text-slate-500">
              {fmtDayShort(draftFrom)} → {fmtDayShort(draftTo)}{" "}
              <span className="text-slate-400">
                ({draftSpan} {draftSpan === 1 ? "día" : "días"})
              </span>
            </div>
            {!draftValid && (
              <p className="mt-1 text-xs font-medium text-red-600">
                La ventana debe ser válida y no superar {MAX_WINDOW_DAYS} días.
              </p>
            )}
            <button
              onClick={consultar}
              disabled={!draftValid || loading}
              className="mt-3 w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Consultando…" : dirty ? "Consultar" : "Actualizar"}
            </button>
            {dirty && !loading && <p className="mt-1 text-center text-xs text-amber-600">Hay cambios sin consultar.</p>}
          </div>
        </div>
      </div>

      {/* ---- Fuente ---- */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {data && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
              data.provider === "mock"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${data.provider === "mock" ? "bg-amber-500" : "bg-green-500"}`} />
            Fuente: {PROVIDER_LABEL[data.provider] ?? data.provider}
          </span>
        )}
        {isDemo && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500">
            Sin empresa asociada
          </span>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading && !data && <SkeletonResults />}

      {data && !error && (
        <>
          {flights.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
              No hay {dirLabel} guardadas para este aeropuerto en la ventana seleccionada.
            </div>
          ) : (
            <>
              {/* KPIs + torta de aerolíneas */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label={`${cap(dirLabel)} en la ventana`} value={String(flights.length)} />
                <Kpi label="Promedio por día" value={avgPerDay.toFixed(1)} />
                <Kpi
                  label="Hora punta"
                  value={peakHour != null ? `${String(peakHour).padStart(2, "0")}:00` : "—"}
                  sub={peakHour != null ? `${hourHist[peakHour].n} ${dirLabel}` : undefined}
                />
                <AirlinePie data={airlineBreakdown} total={flights.length} />
              </div>

              {/* Distribución por hora */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h3 className="mb-1 text-sm font-semibold text-slate-800">{cap(dirLabel)} por hora del día</h3>
                <p className="mb-3 text-xs text-slate-500">Suma de toda la ventana. La barra ámbar marca la hora punta.</p>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourHist} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(0,49,82,0.06)" }}
                        formatter={(v: number) => [`${v} ${dirLabel}`, ""]}
                        labelFormatter={(l) => `${l}:00 – ${l}:59`}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Bar dataKey="n" radius={[3, 3, 0, 0]}>
                        {hourHist.map((h) => (
                          <Cell key={h.hour} fill={h.hour === peakHour ? "#D9B300" : "#3d7593"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Mapa de calor con detalle por celda (día × hora) */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h3 className="mb-1 text-sm font-semibold text-slate-800">Mapa de calor por día y hora</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Cuántas {dirLabel} hay en cada franja. Haz clic en una celda para ver aerolínea y {counterLabel.toLowerCase()}.
                </p>
                <Heatmap days={days} flights={flights} selected={cell} onSelect={setCell} />

                {cell && cellFlights.length > 0 && (
                  <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">
                        {cap(fmtDayLong(cell.day))} · {String(cell.hour).padStart(2, "0")}:00 —{" "}
                        {cellFlights.length} {cellFlights.length === 1 ? "vuelo" : "vuelos"}
                      </span>
                      <button onClick={() => setCell(null)} className="text-xs text-slate-400 hover:text-slate-600">
                        ✕ cerrar
                      </button>
                    </div>
                    <div className="space-y-1">
                      {cellFlights.map((f, i) => {
                        const c = counterOf(f);
                        return (
                          <div key={`${f.flightNumber}-${f.time}-${i}`} className="flex items-center gap-2 text-sm">
                            <span className="w-11 shrink-0 font-semibold tabular-nums text-slate-800">{f.time}</span>
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: airlineColor(f.airlineCode) }} />
                            <span className="w-16 shrink-0 font-medium text-slate-700">{f.flightNumber}</span>
                            <span className="min-w-0 flex-1 truncate text-slate-500">{f.airlineName}</span>
                            <span className="shrink-0 text-slate-600">
                              {direction === "salida" ? "→" : "←"} {c.name ?? c.code} <span className="text-slate-400">({c.code})</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Detalle en tabla */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">
                  Detalle de {dirLabel} <span className="font-normal text-slate-400">({rows.length})</span>
                </h3>
                <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-100">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Fecha</th>
                        <th className="px-3 py-2 font-semibold">Hora</th>
                        <th className="px-3 py-2 font-semibold">N° vuelo</th>
                        <th className="px-3 py-2 font-semibold">Aerolínea</th>
                        <th className="px-3 py-2 font-semibold">Origen → Destino</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((f, i) => (
                        <tr key={`${f.flightNumber}-${f.date}-${f.time}-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-1.5 capitalize text-slate-600">{fmtDayShort(f.date)}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-medium tabular-nums text-slate-800">{f.time}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">{f.flightNumber}</td>
                          <td className="px-3 py-1.5 text-slate-600">
                            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: airlineColor(f.airlineCode) }} />
                            {f.airlineName || f.airlineCode}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">
                            <span className="font-medium">{f.origin}</span>
                            <span className="mx-1 text-slate-400">→</span>
                            <span className="font-medium">{f.destination}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  function counterOf(f: ScheduledFlight) {
    return f.direction === "salida"
      ? { code: f.destination, name: f.destinationName }
      : { code: f.origin, name: f.originName };
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Combina las opciones de aeropuerto con el seleccionado y evita duplicados.
function mergeAirportOptions(airports: AirportOption[], selected: string): AirportOption[] {
  const seen = new Set<string>();
  const out: AirportOption[] = [];
  for (const a of airports) {
    if (seen.has(a.iata)) continue;
    seen.add(a.iata);
    out.push(a);
  }
  if (!seen.has(selected)) out.unshift({ iata: selected, name: AIRPORTS[selected]?.name ?? selected });
  return out;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// Torta de reparto por aerolínea, como una tarjeta más de la fila de KPIs.
function AirlinePie({ data, total }: { data: { code: string; name: string; value: number }[]; total: number }) {
  const top = data.slice(0, 5);
  const rest = data.slice(5);
  const restN = rest.reduce((a, b) => a + b.value, 0);
  const legend = restN > 0 ? [...top, { code: "otras", name: "Otras", value: restN }] : top;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 lg:col-span-1">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Reparto por aerolínea</p>
      <div className="flex items-center gap-3">
        <div className="h-24 w-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={22} outerRadius={44} paddingAngle={1}>
                {data.map((d) => (
                  <Cell key={d.code} fill={airlineColor(d.code)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, n) => [`${v} vuelos`, n]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          {legend.map((d) => (
            <div key={d.code} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: airlineColor(d.code) }} />
              <span className="min-w-0 flex-1 truncate text-slate-600">{d.name}</span>
              <span className="shrink-0 tabular-nums text-slate-400">
                {total > 0 ? Math.round((d.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Mapa de calor día (filas) × hora (columnas 5–23), celdas clickeables.
function Heatmap({
  days,
  flights,
  selected,
  onSelect,
}: {
  days: string[];
  flights: ScheduledFlight[];
  selected: { day: string; hour: number } | null;
  onSelect: (c: { day: string; hour: number } | null) => void;
}) {
  const START_H = 5;
  const END_H = 23;
  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => i + START_H);
  const counts = useMemo(() => {
    const m = new Map<string, number>(); // `${day}|${hour}` -> n
    for (const f of flights) {
      const k = `${f.date}|${hourOf(f.time)}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [flights]);
  const max = Math.max(1, ...days.flatMap((d) => hours.map((h) => counts.get(`${d}|${h}`) ?? 0)));

  function cellStyle(n: number) {
    if (n === 0) return { background: "#f8fafc", color: "#cbd5e1" };
    const alpha = 0.15 + 0.75 * (n / max);
    return { background: `rgba(0,49,82,${alpha.toFixed(2)})`, color: alpha > 0.55 ? "#fff" : "#0f2b3d" };
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white pr-2" />
            {hours.map((h) => (
              <th key={h} className="w-7 text-center text-[10px] font-medium text-slate-400">
                {String(h).padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day}>
              <td className="sticky left-0 z-10 whitespace-nowrap bg-white pr-2 text-right text-[11px] capitalize text-slate-500">
                {fmtDayShort(day)}
              </td>
              {hours.map((h) => {
                const n = counts.get(`${day}|${h}`) ?? 0;
                const isSel = selected?.day === day && selected?.hour === h;
                return (
                  <td key={h} className="p-0">
                    <button
                      disabled={n === 0}
                      onClick={() => onSelect(isSel ? null : { day, hour: h })}
                      title={`${fmtDayShort(day)} · ${String(h).padStart(2, "0")}:00 — ${n}`}
                      className={`flex h-7 w-7 items-center justify-center rounded text-[10px] font-medium tabular-nums transition-shadow ${
                        n > 0 ? "cursor-pointer hover:ring-1 hover:ring-brand-400" : "cursor-default"
                      } ${isSel ? "ring-2 ring-brand-500" : ""}`}
                      style={cellStyle(n)}
                    >
                      {n || ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonResults() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-52 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}
