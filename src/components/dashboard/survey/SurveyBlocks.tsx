"use client";

// Bloques de las vistas del Dashboard por cuestionario de experiencia (AGA Pasajeros,
// AGA Acompañantes, Hotel). Cada vista arma su propia página con estos bloques.

import { useMemo, useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { SurveyDashboardData, SurveyFilters } from "@/lib/surveys/data";
import type { ImportanceRow, OpenQuestion, ProfileQuestion, SectionScore, TrendPoint } from "@/lib/surveys/analyze";
import type { SurveyViewKey } from "@/lib/surveys/views";
import { fmtNps, fmtScore, npsColor, scoreColor } from "@/lib/reports/design";

const CARD = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const hx = (c: string) => `#${c}`;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function ymShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MESES[m - 1]} ${String(y).slice(2)}`;
}
function ymLong(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const s = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 15))
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short" }).format(new Date(iso));

export function Card({ title, note, children, className = "" }: { title?: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${CARD} ${className}`}>
      {title && (
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          {title} {note && <span className="font-normal text-slate-400">· {note}</span>}
        </h2>
      )}
      {children}
    </section>
  );
}

/* ---------------- Encabezado + filtros ---------------- */

export function SurveyHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function FiltersBar({
  data,
  update,
  onExport,
}: {
  data: SurveyDashboardData;
  update: (p: Partial<SurveyFilters>) => void;
  onExport: () => void;
}) {
  const f = data.filters;
  const segQ = f.segQ ?? "";
  const seg = data.segments.find((s) => s.question === segQ);
  const sel = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <label className="min-w-[220px] text-xs font-medium text-slate-500">
        Plan de trabajo
        <select className={sel} value={f.plan ?? "all"} onChange={(e) => update({ plan: e.target.value, mes: null })}>
          {data.plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.active ? "" : " (cerrado)"}
            </option>
          ))}
          <option value="all">Todas las respuestas</option>
        </select>
      </label>
      <label className="min-w-[160px] text-xs font-medium text-slate-500">
        Mes
        <select className={sel} value={f.mes ?? "all"} onChange={(e) => update({ mes: e.target.value })}>
          {[...data.months].reverse().map((m) => (
            <option key={m} value={m}>
              {ymLong(m)}
            </option>
          ))}
          <option value="all">Todo el periodo</option>
        </select>
      </label>
      <label className="min-w-[200px] text-xs font-medium text-slate-500">
        Segmentar por
        <select className={sel} value={segQ} onChange={(e) => update({ segQ: e.target.value || null, segV: null })}>
          <option value="">Sin segmentar</option>
          {data.segments.map((s) => (
            <option key={s.question} value={s.question}>
              {s.question}
            </option>
          ))}
        </select>
      </label>
      {seg && (
        <label className="min-w-[180px] text-xs font-medium text-slate-500">
          Valor
          <select className={sel} value={f.segV ?? ""} onChange={(e) => update({ segV: e.target.value || null })}>
            <option value="">Elegir…</option>
            {seg.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={onExport}
        className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Exportar comentarios (CSV)
      </button>
    </div>
  );
}

/* ---------------- KPIs ---------------- */

function Delta({ cur, prev, fmt, unit = "" }: { cur: number | null; prev: number | null | undefined; fmt: (n: number) => string; unit?: string }) {
  if (cur == null || prev == null) return <span className="text-slate-400">mes anterior —</span>;
  const d = Math.round((cur - prev) * 10) / 10;
  const cls = d > 0 ? "text-emerald-600" : d < 0 ? "text-red-600" : "text-slate-500";
  return (
    <span className={cls}>
      {d > 0 ? "▲" : d < 0 ? "▼" : "="} {fmt(Math.abs(d))}
      {unit} vs mes anterior
    </span>
  );
}

function Kpi({ label, value, color, children }: { label: string; value: string; color?: string; children?: React.ReactNode }) {
  return (
    <div className={`${CARD} flex min-h-[118px] flex-col justify-between`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-3xl font-bold" style={{ color: color ? hx(color) : undefined }}>
        {value}
      </div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

export function KpiCards({ data }: { data: SurveyDashboardData }) {
  const k = data.kpis;
  const p = data.prev;
  const monthly = !!data.filters.mes;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="NPS" value={fmtNps(k.nps)} color={npsColor(k.nps)}>
        {k.nps != null && (
          <div className="mb-1 flex h-1.5 overflow-hidden rounded bg-slate-100">
            <div style={{ width: `${k.promotersPct ?? 0}%` }} className="bg-emerald-500" />
            <div style={{ width: `${k.passivesPct ?? 0}%` }} className="bg-slate-300" />
            <div style={{ width: `${k.detractorsPct ?? 0}%` }} className="bg-red-500" />
          </div>
        )}
        <div className="text-slate-500">
          {k.nps != null ? `Prom. ${k.promotersPct}% · Pas. ${k.passivesPct}% · Det. ${k.detractorsPct}%` : "sin datos"}
        </div>
        {monthly && <Delta cur={k.nps} prev={p?.nps} fmt={(n) => String(n)} unit=" pts" />}
      </Kpi>
      <Kpi label="Satisfacción general" value={k.sat != null ? `${fmtScore(k.sat)} / 5` : "—"} color={scoreColor(k.sat)}>
        {monthly ? <Delta cur={k.sat} prev={p?.sat} fmt={(n) => fmtScore(n)} /> : <span className="text-slate-400">promedio 1–5</span>}
      </Kpi>
      <Kpi label="Satisfechos (nota 4–5)" value={k.satTop2 != null ? `${k.satTop2}%` : "—"}>
        {monthly ? (
          <Delta cur={k.satTop2} prev={p?.satTop2} fmt={(n) => String(n)} unit=" pts" />
        ) : (
          <span className="text-slate-400">top-2-box</span>
        )}
      </Kpi>
      <Kpi label={monthly ? "Encuestas del mes" : "Encuestas"} value={String(k.n)}>
        <span className="text-slate-500">
          {data.target
            ? `Periodo ${data.periodN} de ${data.target} (${Math.min(100, Math.round((data.periodN / data.target) * 100))}%)`
            : `Periodo ${data.periodN}`}
          {k.n > 0 && k.n < 30 ? " · referencial (n<30)" : ""}
        </span>
      </Kpi>
    </div>
  );
}

/* ---------------- Evolutivo ---------------- */

export function TrendCard({ trend }: { trend: TrendPoint[] }) {
  const rows = trend.map((t) => ({ label: ymShort(t.ym), nps: t.nps, sat: t.sat, n: t.n }));
  return (
    <Card title="Evolutivo mensual" note="NPS (izq.) y satisfacción general (der.)">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Sin encuestas.</p>
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#7C828A" }} tickLine={false} />
                <YAxis yAxisId="nps" domain={[-100, 100]} tick={{ fontSize: 11, fill: "#7C828A" }} width={36} tickLine={false} axisLine={false} />
                <YAxis yAxisId="sat" orientation="right" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "#7C828A" }} width={28} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number, name) => (name === "NPS" ? [fmtNps(v), name] : [fmtScore(v), name])}
                  labelFormatter={(l, p) => `${l} · n=${p?.[0]?.payload?.n ?? 0}`}
                />
                <Line yAxisId="nps" name="NPS" dataKey="nps" stroke="#003152" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                <Line yAxisId="sat" name="Satisfacción" dataKey="sat" stroke="#05B169" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {rows.length < 2 && <p className="mt-1 text-xs text-slate-400">Se completa a medida que avance la temporada.</p>}
        </>
      )}
    </Card>
  );
}

/* ---------------- Notas (barras con semáforo) ---------------- */

type ScoreRowT = { label: string; avg: number | null; n: number; usePct?: number | null };

function ScoreRow({ r, onClick }: { r: ScoreRowT; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`grid grid-cols-[minmax(0,1fr)_20%_36px_76px] items-center gap-2 border-t border-slate-100 py-1.5 text-sm ${
        onClick ? "cursor-pointer hover:bg-slate-50" : ""
      }`}
    >
      <span className="truncate text-slate-700" title={r.label}>
        {r.label}
      </span>
      <span className="h-2 overflow-hidden rounded bg-slate-100">
        <span className="block h-full" style={{ width: `${r.avg != null ? (r.avg / 5) * 100 : 0}%`, background: hx(scoreColor(r.avg)) }} />
      </span>
      <span className="text-right font-mono font-bold">{fmtScore(r.avg)}</span>
      <span className={`text-right text-xs ${r.n < 10 ? "text-amber-600" : "text-slate-400"}`} title={r.n < 10 ? "Pocas respuestas: referencial" : undefined}>
        {r.usePct !== undefined ? `${r.usePct != null ? `${r.usePct}%` : "—"} · ` : ""}n={r.n}
      </span>
    </div>
  );
}

export function ScoreLegend() {
  return (
    <p className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
      <span><span className="inline-block h-2 w-2 rounded-full bg-[#05B169]" /> ≥ 4,0</span>
      <span><span className="inline-block h-2 w-2 rounded-full bg-[#F4B000]" /> 3,5 – 3,9</span>
      <span><span className="inline-block h-2 w-2 rounded-full bg-[#CF202F]" /> &lt; 3,5</span>
      <span>· n en ámbar = menos de 10 respuestas · N/A no se considera</span>
    </p>
  );
}

export function ScoreList({ title, note, rows, empty = "Sin calificaciones." }: { title: string; note: string; rows: ScoreRowT[]; empty?: string }) {
  return (
    <Card title={title} note={note}>
      {rows.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : rows.map((r) => <ScoreRow key={r.label} r={r} />)}
      <ScoreLegend />
    </Card>
  );
}

/** Dimensiones = secciones del cuestionario; clic para ver sus ítems. */
export function SectionScores({ sections }: { sections: SectionScore[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = [...sections].sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  return (
    <Card title="Dimensiones de la estadía" note="nota 1–5 · clic para ver el detalle">
      {rows.length === 0 && <p className="text-sm text-slate-500">Sin calificaciones.</p>}
      {rows.map((s) => (
        <div key={s.label}>
          <ScoreRow r={{ label: `${open === s.label ? "▾" : "▸"} ${s.label}`, avg: s.avg, n: s.n }} onClick={() => setOpen(open === s.label ? null : s.label)} />
          {open === s.label && (
            <div className="mb-2 ml-5 border-l border-slate-200 pl-3">
              {s.items.map((it) => (
                <ScoreRow key={it.label} r={it} />
              ))}
            </div>
          )}
        </div>
      ))}
      <ScoreLegend />
    </Card>
  );
}

/* ---------------- Matriz importancia–desempeño ---------------- */

export function ImportanceMatrix({ rows }: { rows: ImportanceRow[] }) {
  const pts = rows
    .filter((r) => r.perf != null)
    .sort((a, b) => b.pct - a.pct)
    .map((r, i) => ({ ...r, idx: i + 1 }));
  const W = 440;
  const H = 280;
  const pad = { l: 40, r: 12, t: 12, b: 32 };
  const xMin = Math.floor(Math.min(3, ...pts.map((p) => p.perf!)) * 2) / 2;
  const xMax = 5;
  const yMax = Math.max(10, Math.ceil(Math.max(...pts.map((p) => p.pct), 0) / 10) * 10);
  const x = (v: number) => pad.l + ((v - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
  const pctSorted = pts.map((p) => p.pct).sort((a, b) => a - b);
  const midPct = pctSorted.length ? pctSorted[Math.floor(pctSorted.length / 2)] : 0;
  const cutX = x(4);
  const cutY = y(midPct);
  const quadrant = (p: ImportanceRow) =>
    p.pct >= midPct
      ? p.perf! < 4
        ? { label: "Mejorar con urgencia", cls: "bg-red-50 text-red-700" }
        : { label: "Fortaleza a mantener", cls: "bg-emerald-50 text-emerald-700" }
      : p.perf! < 4
        ? { label: "Prioridad secundaria", cls: "bg-slate-100 text-slate-600" }
        : { label: "Sobre-esfuerzo", cls: "bg-slate-100 text-slate-600" };
  return (
    <Card title="Importancia vs desempeño" note="% que lo elige entre sus 3 más importantes vs nota promedio">
      {pts.length === 0 ? (
        <p className="text-sm text-slate-500">Sin datos suficientes.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[440px]" role="img" aria-label="Matriz importancia desempeño">
            <rect x={pad.l} y={pad.t} width={cutX - pad.l} height={cutY - pad.t} fill="#FCEBEB" />
            <rect x={cutX} y={pad.t} width={W - pad.r - cutX} height={cutY - pad.t} fill="#EAF6EF" />
            <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#DEE1E6" />
            <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="#DEE1E6" />
            <line x1={cutX} y1={pad.t} x2={cutX} y2={H - pad.b} stroke="#A9B2BF" strokeDasharray="4 4" />
            <line x1={pad.l} y1={cutY} x2={W - pad.r} y2={cutY} stroke="#A9B2BF" strokeDasharray="4 4" />
            {[xMin, 4, 5].map((v) => (
              <text key={v} x={x(v)} y={H - pad.b + 14} fontSize="10" fill="#7C828A" textAnchor="middle">{fmtScore(v)}</text>
            ))}
            <text x={(W + pad.l) / 2} y={H - 3} fontSize="10" fill="#7C828A" textAnchor="middle">nota promedio →</text>
            {[0, yMax / 2, yMax].map((v) => (
              <text key={v} x={pad.l - 5} y={y(v) + 3} fontSize="10" fill="#7C828A" textAnchor="end">{v}%</text>
            ))}
            {pts.map((p) => (
              <g key={p.option}>
                <circle cx={x(p.perf!)} cy={y(p.pct)} r={8} fill={hx(scoreColor(p.perf))} stroke="#fff" strokeWidth={1.5} opacity={0.9} />
                <text x={x(p.perf!)} y={y(p.pct) + 3.5} fontSize="9.5" fontWeight="700" fill="#fff" textAnchor="middle">{p.idx}</text>
              </g>
            ))}
          </svg>
          <div className="min-w-0">
            {pts.map((p) => {
              const q = quadrant(p);
              return (
                <div key={p.option} className="grid grid-cols-[22px_minmax(0,1fr)_44px_36px_150px] items-center gap-2 border-t border-slate-100 py-1 text-sm">
                  <span className="font-mono text-xs text-slate-400">{p.idx}</span>
                  <span className="truncate text-slate-700">{p.option}</span>
                  <span className="text-right text-xs text-slate-500">{p.pct}%</span>
                  <span className="text-right font-mono font-bold">{fmtScore(p.perf)}</span>
                  <span className={`truncate rounded px-2 py-0.5 text-center text-xs ${q.cls}`}>{q.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Zona roja: aspectos muy elegidos como importantes y con nota bajo 4,0. Corte de importancia en la mediana ({midPct}%).
        {rows.some((r) => r.perf == null) &&
          ` Sin nota: ${rows.filter((r) => r.perf == null).map((r) => r.option).join(", ")}.`}
      </p>
    </Card>
  );
}

/* ---------------- Perfil ---------------- */

export function ProfilePanel({ profile, respondent }: { profile: ProfileQuestion[]; respondent: string }) {
  const [q, setQ] = useState(0);
  const cur = profile[Math.min(q, profile.length - 1)];
  return (
    <Card title={`Perfil del ${respondent}`} note="% de la muestra y NPS de cada grupo">
      {!cur ? (
        <p className="text-sm text-slate-500">Sin datos.</p>
      ) : (
        <>
          <select className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={q} onChange={(e) => setQ(Number(e.target.value))}>
            {profile.map((p, i) => (
              <option key={p.question} value={i}>
                {p.question}
                {p.multi ? " (múltiple)" : ""}
              </option>
            ))}
          </select>
          {cur.rows.map((r) => (
            <div key={r.value} className="grid grid-cols-[minmax(0,1fr)_30%_44px_48px] items-center gap-2 border-t border-slate-100 py-1.5 text-sm">
              <span className="truncate text-slate-700" title={r.value}>{r.value}</span>
              <span className="h-2 overflow-hidden rounded bg-slate-100">
                <span className="block h-full bg-[#2A6D84]" style={{ width: `${r.pct}%` }} />
              </span>
              <span className="text-right text-xs text-slate-500">{r.pct}%</span>
              <span className="text-right font-mono text-xs font-bold" style={{ color: hx(npsColor(r.nps)) }} title={`n=${r.n}`}>
                {fmtNps(r.nps)}
              </span>
            </div>
          ))}
          <p className="mt-2 text-xs text-slate-400">
            {cur.answered} respuestas{cur.multi ? " · selección múltiple: los % pueden sumar más de 100" : ""} · NPS de grupos chicos es referencial.
          </p>
        </>
      )}
    </Card>
  );
}

/* ---------------- Respuestas abiertas ---------------- */

type NpsGroup = "all" | "prom" | "pas" | "det" | "star";
const npsGroupOf = (n: number | null) => (n == null ? null : n >= 9 ? "prom" : n >= 7 ? "pas" : "det");

function NpsTag({ nps }: { nps: number | null }) {
  const g = npsGroupOf(nps);
  const cls =
    g === "prom" ? "bg-emerald-50 text-emerald-700" : g === "det" ? "bg-red-50 text-red-700" : g === "pas" ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-400";
  return <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs ${cls}`}>NPS {nps ?? "—"}</span>;
}

export function OpenAnswers({
  open,
  onToggle,
}: {
  open: OpenQuestion[];
  onToggle: (answerId: string, on: boolean) => Promise<void>;
}) {
  const [tab, setTab] = useState(0);
  const [group, setGroup] = useState<NpsGroup>("all");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const cur = open[Math.min(tab, open.length - 1)];

  const list = useMemo(() => {
    if (!cur) return [];
    const t = term.trim().toLowerCase();
    return cur.answers.filter(
      (a) =>
        (group === "all" || (group === "star" ? a.highlighted : npsGroupOf(a.nps) === group)) &&
        (!t || a.text.toLowerCase().includes(t) || a.context.some((c) => c.toLowerCase().includes(t)))
    );
  }, [cur, group, term]);

  const chip = (on: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs font-medium ${on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <Card title="Respuestas abiertas" note="★ marca las citas para la diapositiva «Voz del pasajero» del informe">
      {open.length === 0 ? (
        <p className="text-sm text-slate-500">Sin respuestas abiertas en este filtro.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
            {open.map((q, i) => (
              <button key={q.label} type="button" title={q.question} className={chip(i === tab)} onClick={() => setTab(i)}>
                {q.label} <span className="text-slate-400">{q.answers.length}</span>
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "Todas"],
                ["prom", "Promotores"],
                ["pas", "Pasivos"],
                ["det", "Detractores"],
                ["star", "★ Destacadas"],
              ] as [NpsGroup, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" className={chip(group === k)} onClick={() => setGroup(k)}>
                {l}
              </button>
            ))}
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar palabra"
              className="ml-auto w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <p className="mb-2 text-xs text-slate-400">{list.length} respuestas</p>
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {list.map((a) => (
              <div key={a.answerId} className="flex gap-3 rounded-md border border-slate-200 px-3 py-2">
                <NpsTag nps={a.nps} />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{a.text}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {[fmtDate(a.date), ...a.context, a.sat != null ? `satisfacción ${a.sat}/5` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === a.answerId}
                  onClick={async () => {
                    setBusy(a.answerId);
                    try {
                      await onToggle(a.answerId, !a.highlighted);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  aria-label={a.highlighted ? "Quitar de destacadas" : "Destacar para el informe"}
                  title={a.highlighted ? "Quitar de destacadas" : "Destacar para el informe"}
                  className={`h-fit shrink-0 text-lg leading-none ${a.highlighted ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
                >
                  {a.highlighted ? "★" : "☆"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------------- Apreciación general ---------------- */

export function AppraisalBox({
  view,
  data,
  onSaved,
}: {
  view: SurveyViewKey;
  data: SurveyDashboardData;
  onSaved: (a: SurveyDashboardData["appraisal"]) => void;
}) {
  const mes = data.filters.mes;
  const scope = data.filters.plan ?? "all";
  const [text, setText] = useState(data.appraisal?.text ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [key, setKey] = useState(`${scope}|${mes}`);
  // Al cambiar de plan/mes se carga la apreciación correspondiente.
  if (key !== `${scope}|${mes}`) {
    setKey(`${scope}|${mes}`);
    setText(data.appraisal?.text ?? "");
    setState("idle");
  }
  const stars = data.open.reduce((a, q) => a + q.answers.filter((x) => x.highlighted).length, 0);
  const dirty = text.trim() !== (data.appraisal?.text ?? "");

  async function save() {
    if (!mes) return;
    setState("saving");
    try {
      const res = await fetch("/api/dashboard/encuestas/appraisal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view, scope, mes, text }),
      });
      if (!res.ok) throw new Error();
      onSaved((await res.json()).appraisal);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Card title="Apreciación general de los comentarios" note="se muestra en el informe mensual">
      {!mes ? (
        <p className="text-sm text-slate-500">Elige un mes para escribir la apreciación de ese informe.</p>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setState("idle");
            }}
            rows={5}
            maxLength={3000}
            placeholder={`Resume los temas que más se repiten en los comentarios de ${ymLong(mes).toLowerCase()}…`}
            className="w-full rounded-md border border-slate-300 p-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <button
              type="button"
              onClick={save}
              disabled={state === "saving" || !dirty}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {state === "saving" ? "Guardando…" : "Guardar apreciación"}
            </button>
            {state === "saved" && <span className="text-emerald-600">Guardada</span>}
            {state === "error" && <span className="text-red-600">No se pudo guardar. Intenta de nuevo.</span>}
            <span>
              {stars} cita{stars === 1 ? "" : "s"} destacada{stars === 1 ? "" : "s"} este mes
              {data.filters.plan ? "" : " · elige un plan para que aparezca en el informe"}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------------- Utilidades ---------------- */

/** Descarga las respuestas abiertas del filtro actual como CSV (Excel-friendly). */
export function exportOpenCsv(data: SurveyDashboardData, filename: string) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [["Pregunta", "Fecha", "Respuesta", "NPS", "Satisfacción", "Contexto", "Destacada"].join(";")];
  for (const q of data.open)
    for (const a of q.answers)
      lines.push(
        [esc(q.label), a.date.slice(0, 10), esc(a.text), a.nps ?? "", a.sat ?? "", esc(a.context.join(" · ")), a.highlighted ? "sí" : ""].join(";")
      );
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = filename;
  el.click();
  URL.revokeObjectURL(url);
}

export async function toggleHighlight(answerId: string, on: boolean) {
  const res = await fetch("/api/dashboard/encuestas/highlights", {
    method: on ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answerId }),
  });
  if (!res.ok) throw new Error("No se pudo actualizar la destacada.");
}

export function SurveyState({ loading, error, found }: { loading: boolean; error: string | null; found: boolean | undefined }) {
  if (error) return <div className={`${CARD} text-sm text-red-600`}>{error}</div>;
  if (loading && found === undefined) return <div className={`${CARD} text-sm text-slate-500`}>Cargando…</div>;
  if (found === false) return <div className={`${CARD} text-sm text-slate-500`}>No se encontró el cuestionario en la base.</div>;
  return null;
}
