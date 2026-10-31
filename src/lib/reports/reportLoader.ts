// Resolución de parámetros, carga de datos y URLs de un informe de cualquier tipo
// (mensual, semestral, anual). Lo comparten la vista imprimible, la descarga PPTX y el editor.
//
// Server-only.

import { getMonthlyReport, type MonthlyReport } from "@/lib/reports/monthlyReport";
import { getSeasonReport } from "@/lib/reports/seasonReport";
import {
  KIND_SLUG,
  currentMonth,
  isValidMonth,
  kindFromSlug,
  resolvePeriod,
  type PeriodContext,
} from "@/lib/reports/period";
import type { ModuleKey } from "@/lib/reports/modules";

export type ReportParams = { tipo?: string | null; periodo?: string | null; mes?: string | null; foco?: string | null };

/**
 * Periodo pedido. Sin `tipo` es el mensual de siempre (`?mes=`, por defecto el mes en
 * curso). En el anual, `foco` es la temporada de detalle (si no viene, la de la edición).
 */
export function resolveReportParams(p: ReportParams, savedFocus?: string | null): PeriodContext | null {
  const kind = p.tipo ? kindFromSlug(p.tipo) : "MENSUAL";
  if (!kind) return null;
  if (kind === "MENSUAL") {
    const key = p.periodo ?? p.mes ?? currentMonth();
    return isValidMonth(key) ? resolvePeriod("MENSUAL", key) : null;
  }
  if (!p.periodo) return null;
  return resolvePeriod(kind, p.periodo, p.foco ?? savedFocus ?? null);
}

/** Datos del informe (mismo formato para los tres tipos). null si el aeropuerto no está mapeado. */
export async function loadReport(
  code: string,
  ctx: PeriodContext,
  opts: { modules?: ModuleKey[] } = {}
): Promise<MonthlyReport | null> {
  return ctx.kind === "MENSUAL" ? getMonthlyReport(code, ctx.key, opts) : getSeasonReport(code, ctx, opts);
}

function query(ctx: PeriodContext): string {
  if (ctx.kind === "MENSUAL") return `mes=${ctx.key}`;
  const q = new URLSearchParams({ tipo: KIND_SLUG[ctx.kind], periodo: ctx.key });
  if (ctx.kind === "ANUAL") q.set("foco", ctx.season.code);
  return q.toString();
}

export function reportUrls(code: string, ctx: PeriodContext) {
  const a = encodeURIComponent(code);
  return {
    view: `/informe/${a}?${query(ctx)}`,
    pptx: `/api/reports/pptx?airport=${a}&${query(ctx)}`,
    edit: `/admin/informes/${KIND_SLUG[ctx.kind]}/${a}/${ctx.key}${ctx.kind === "ANUAL" ? `?foco=${ctx.season.code}` : ""}`,
  };
}

const FILE_KIND = { MENSUAL: "Informe Mensual", SEMESTRAL: "Informe Semestral", ANUAL: "Informe Anual" } as const;

/** "202610 PMC Informe Mensual.pptx" / "SU26 PMC Informe Semestral.pptx" / "2025 PMC Informe Anual.pptx". */
export function reportFileName(code: string, ctx: PeriodContext): string {
  const key = ctx.kind === "MENSUAL" ? ctx.key.replace("-", "") : ctx.key;
  return `${key} ${code} ${FILE_KIND[ctx.kind]}.pptx`;
}
