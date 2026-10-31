// Contenido de las diapositivas propias del semestral/anual (resumen ejecutivo, resumen de
// tiempos, deltas AGA), calculado una sola vez para el deck HTML y el PPTX.
//
// Puro: recibe el informe ya armado (MonthlyReport con kind/seasonal).

import { AIGS, fmtInt, fmtMMSS, fmtScore, fmtScore2, scoreColor } from "@/lib/reports/design";
import type { ReportKind } from "@/lib/reports/period";

type Agg = { n: number; prom: number; med: number; p90: number };
type Proc = {
  proceso: string;
  faseLabel: string | null;
  meta: number | null;
  kpi: Agg | null;
  service?: { kpi: { n: number; prom: number; totProm: number } | null } | null;
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
  seasonal?: {
    asq: {
      overall: {
        airport: number | null;
        top2: number | null;
        rankChile: number | null;
        totalChile: number;
        rankAll: number | null;
        totalAll: number;
      };
      n: number;
    } | null;
  };
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
  atencion?: number | null; // desde oct-2026 (si no, no existe)
  total?: number | null;
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
      ...(p.service?.kpi ? { atencion: p.service.kpi.prom, total: p.service.kpi.totProm } : {}),
    }));
}

export type SplitRow = { label: string; fila: number; atencion: number; total: number; n: number };

/** Fila vs atención por proceso (solo procesos con tiempo de atención en el periodo). */
export function serviceSplitRows(r: Report): SplitRow[] {
  return r.processes
    .filter((p) => p.kpi && p.service?.kpi)
    .map((p) => ({
      label: procLabel(p),
      fila: p.kpi!.prom,
      atencion: p.service!.kpi!.prom,
      total: p.service!.kpi!.totProm,
      n: p.service!.kpi!.n,
    }));
}

export type SummaryCard = { label: string; value: string; sub: string; valueColor: string };

/** Tarjetas del resumen ejecutivo (cifras clave de cada módulo con datos). */
export function execSummaryCards(r: Report): SummaryCard[] {
  const cards: SummaryCard[] = [];
  const asq = r.seasonal?.asq;
  if (asq) {
    const o = asq.overall;
    cards.push({
      label: "Satisfacción general ACI ASQ",
      value: `${fmtScore2(o.airport)} / 5`,
      sub: [
        o.rankChile ? `${o.rankChile}° de ${o.totalChile} en Chile` : null,
        o.rankAll ? `${o.rankAll}° de ${o.totalAll} en la base` : null,
        `${fmtInt(asq.n)} encuestas`,
      ]
        .filter(Boolean)
        .join(" · "),
      valueColor: scoreColor(o.airport),
    });
  }
  const rows = tiemposSummaryRows(r);
  const withMeta = rows.filter((x) => x.meta != null);
  if (withMeta.length) {
    const ok = withMeta.filter((x) => (x.margin ?? 0) >= 0);
    const out = withMeta.filter((x) => (x.margin ?? 0) < 0).map((x) => `${x.label} (+${fmtMMSS(-(x.margin ?? 0))})`);
    const split = serviceSplitRows(r).sort((a, b) => b.atencion - a.atencion)[0];
    cards.push({
      label: "Tiempos dentro del Estándar IATA",
      value: `${ok.length} de ${withMeta.length}`,
      sub:
        (out.length ? `Sobre el estándar (fila): ${out.join(", ")}` : "Todos los procesos medidos cumplen (fila)") +
        (split ? ` · Mayor atención: ${split.label} (${fmtMMSS(split.atencion)})` : ""),
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

/** "4°" / "—". */
export const ordinal = (n: number | null) => (n == null ? "—" : `${n}°`);

/** Mejores y peores atributos ACI ASQ del aeropuerto, con su diferencia vs el promedio chileno. */
export function asqBestWorst<T extends { airport: number | null; chile: number | null }>(attrs: T[], k = 5) {
  const rows = attrs
    .filter((a) => a.airport != null)
    .map((a) => ({ ...a, diff: a.chile != null ? Math.round((a.airport! - a.chile) * 100) / 100 : null }))
    .sort((a, b) => b.airport! - a.airport!);
  return { best: rows.slice(0, k), worst: rows.slice(-k).reverse() };
}

/**
 * Matriz importancia–desempeño: cuadrante de cada atributo según si su importancia
 * declarada (% que lo eligió entre sus 3 más importantes) supera la mediana y si su nota
 * supera el promedio de notas del aeropuerto.
 */
export function asqMatrix<T extends { label: string; airport: number | null; importance: number | null }>(attrs: T[]) {
  const pts = attrs.filter((a) => a.airport != null && a.importance != null) as (T & { airport: number; importance: number })[];
  const imps = pts.map((p) => p.importance).sort((a, b) => a - b);
  const mid = Math.floor(imps.length / 2);
  const midImp = imps.length === 0 ? 0 : imps.length % 2 ? imps[mid] : (imps[mid - 1] + imps[mid]) / 2;
  const midScore = pts.length ? pts.reduce((a, p) => a + p.airport, 0) / pts.length : 0;
  const quadrant = (p: { importance: number; airport: number }) =>
    p.importance > midImp
      ? p.airport >= midScore
        ? "Fortaleza clave"
        : "Mejorar con prioridad"
      : p.airport >= midScore
        ? "Mantener"
        : "Menor prioridad";
  // Puntos destacados (6 de mayor importancia en "Mejorar con prioridad" y en "Fortaleza
  // clave"), numerados para identificarlos en el gráfico sin etiquetas que se solapen.
  const pick = (q: string) => pts.filter((p) => quadrant(p) === q).sort((p, r) => r.importance - p.importance).slice(0, 6);
  const priority = pick("Mejorar con prioridad");
  const strengths = pick("Fortaleza clave");
  const number = new Map<T & { airport: number; importance: number }, number>();
  [...priority, ...strengths].forEach((p, i) => number.set(p, i + 1));
  return { pts, midImp, midScore, quadrant, priority, strengths, number };
}

export const ASQ_NOTE =
  "Promedios simples (sin el factor de ponderación de ACI). Chile y base = promedio de los aeropuertos de la temporada.";

/** Colores de las series del histórico por temporada (uno por proceso). */
export const HISTORY_COLORS = [AIGS.blue, "3D7593", "D9B300", "8DB0BB", AIGS.down, AIGS.blueDisabled];
