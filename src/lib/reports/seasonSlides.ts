// Contenido de las diapositivas propias del semestral/anual (resumen ejecutivo, resumen de
// tiempos, deltas AGA), calculado una sola vez para el deck HTML y el PPTX.
//
// Puro: recibe el informe ya armado (MonthlyReport con kind/seasonal).

import { AIGS, fmtInt, fmtMMSS, fmtScore, scoreColor } from "@/lib/reports/design";
import type { ReportKind } from "@/lib/reports/period";

type Agg = { n: number; prom: number; med: number; p90: number };
type Proc = {
  proceso: string;
  faseLabel: string | null;
  meta: number | null;
  kpi: Agg | null;
};
type Score = { label: string; avg: number | null; n: number };
type Stats = {
  n: number;
  ratingAvg?: number | null;
  ratingTop2?: number | null;
  attributes: Score[];
  services: (Score & { usePct: number | null })[];
};
type Survey = { audience: string; month: Stats };
type Report = {
  kind?: ReportKind;
  processes: Proc[];
  aga: Survey[];
  asq: { pct: number; collected: number; target: number } | null;
};

export const KIND_BADGE: Record<ReportKind, string> = {
  MENSUAL: "Informe mensual",
  SEMESTRAL: "Informe semestral",
  ANUAL: "Informe anual",
};

/** Línea de la portada que dice qué cubre el informe. */
export function coverScope(r: Report): string {
  if ((r.kind ?? "MENSUAL") === "MENSUAL") {
    return r.aga.length > 0
      ? "Cumplimiento de Encuestas ASQ, mediciones de tiempos y Encuestas AGA"
      : "Cumplimiento de Encuestas ASQ y mediciones de tiempos";
  }
  const parts = [r.processes.length > 0 ? "mediciones de tiempos" : null, r.aga.length > 0 ? "Encuestas AGA" : null]
    .filter(Boolean)
    .join(" y ");
  return parts ? parts.charAt(0).toUpperCase() + parts.slice(1) : "Resultados de la temporada";
}

export const procLabel = (p: Proc) => `${p.proceso}${p.faseLabel ? ` — ${p.faseLabel}` : ""}`;

export type TiemposSummaryRow = {
  label: string;
  prom: number;
  p90: number;
  med: number;
  n: number;
  meta: number | null;
  margin: number | null; // meta − prom (min); positivo = dentro del estándar
};

export function tiemposSummaryRows(r: Report): TiemposSummaryRow[] {
  return r.processes
    .filter((p) => p.kpi)
    .map((p) => ({
      label: procLabel(p),
      prom: p.kpi!.prom,
      p90: p.kpi!.p90,
      med: p.kpi!.med,
      n: p.kpi!.n,
      meta: p.meta,
      margin: p.meta != null ? p.meta - p.kpi!.prom : null,
    }));
}

export type SummaryCard = { label: string; value: string; sub: string; valueColor: string };

/** Tarjetas del resumen ejecutivo (cifras clave de cada módulo con datos). */
export function execSummaryCards(r: Report): SummaryCard[] {
  const cards: SummaryCard[] = [];
  const rows = tiemposSummaryRows(r);
  const withMeta = rows.filter((x) => x.meta != null);
  if (withMeta.length) {
    const ok = withMeta.filter((x) => (x.margin ?? 0) >= 0);
    const out = withMeta.filter((x) => (x.margin ?? 0) < 0).map((x) => `${x.label} (+${fmtMMSS(-(x.margin ?? 0))})`);
    cards.push({
      label: "Tiempos dentro del Estándar IATA",
      value: `${ok.length} de ${withMeta.length}`,
      sub: out.length ? `Sobre el estándar: ${out.join(", ")}` : "Todos los procesos medidos cumplen",
      valueColor: ok.length === withMeta.length ? AIGS.up : AIGS.down,
    });
  }
  for (const s of r.aga) {
    if (s.month.n === 0) continue;
    const cur = s.month.ratingAvg ?? null;
    cards.push({
      label: `AGA ${s.audience} · nota promedio`,
      value: `${fmtScore(cur)} / 5`,
      sub: `${fmtInt(s.month.n)} encuestas${s.month.ratingTop2 != null ? ` · ${s.month.ratingTop2}% notas 4–5` : ""}`,
      valueColor: scoreColor(cur),
    });
  }
  if (r.asq) {
    cards.push({
      label: "Cumplimiento ACI ASQ",
      value: `${r.asq.pct}%`,
      sub: `${fmtInt(r.asq.collected)} de ${fmtInt(r.asq.target)} encuestas`,
      valueColor: r.asq.pct >= 100 ? AIGS.up : AIGS.blue,
    });
  }
  return cards;
}

/** Mejores 5 y peores 5 de la temporada (o todos si son ≤ 10). */
export function agaTopRows(s: Survey, which: "attributes" | "services", limit = 10): (Score & { usePct?: number | null })[] {
  const rows = s.month[which] as (Score & { usePct?: number | null })[];
  if (rows.length <= limit) return rows;
  const half = Math.floor(limit / 2);
  return [...rows.slice(0, half), ...rows.slice(-half)];
}

/** Colores de las series del histórico por temporada (uno por proceso). */
export const HISTORY_COLORS = [AIGS.blue, "3D7593", "D9B300", "8DB0BB", AIGS.down, AIGS.blueDisabled];
