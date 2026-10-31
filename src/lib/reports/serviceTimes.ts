// Tiempo de atención (t3 − t2) para los informes, junto al tiempo en fila de siempre.
//
// Solo para informes cuyo periodo empieza el 1-oct-2026 o después (mensual desde octubre
// de 2026; semestral/anual con temporada de detalle desde Winter 2026-27). En informes
// anteriores no se agrega nada: ni el indicador ni su espacio. Tampoco si BigQuery aún no
// tiene los terceros hitos (nueva definición de Dataform sin desplegar).
//
// Server-only.

import {
  SERVICE_FROM,
  hasService,
  hasServiceColumns,
  queryServiceStats,
  type ServiceAgg,
} from "@/lib/reports/tiemposQuery";
import type { Proceso } from "@/lib/dashboardTiempos";

export type ReportService = {
  kpi: ServiceAgg | null; // mes (mensual) o temporada de detalle (semestral/anual)
  period: ServiceAgg | null; // mensual: temporada a la fecha (desde oct-2026); semestral/anual: = kpi
  series: (number | null)[]; // atención promedio por mes, alineada con la serie del proceso
  byAirline: Record<string, number | null>; // atención promedio por aerolínea (mes o temporada)
};

/** ¿Este periodo informa atención? (empieza en o después del 1-oct-2026). */
export const periodHasService = (periodStart: string) => periodStart >= SERVICE_FROM;

type Proc = { proceso: Proceso; series: { ym: string }[]; service?: ReportService | null };

/**
 * Agrega `service` a cada proceso con tramo de atención (no a Retiro de equipajes).
 * `month` = mes del informe mensual; null en semestral/anual (se usa toda la ventana).
 */
export async function attachService(
  processes: Proc[],
  o: { airport: string; desde: string; hasta: string; month: string | null }
): Promise<void> {
  if (!processes.some((p) => hasService(p.proceso)) || !(await hasServiceColumns())) return;
  await Promise.all(
    processes.map(async (p) => {
      if (!hasService(p.proceso)) return;
      // Si la consulta de atención falla, el proceso queda solo con la fila (no rompe el informe).
      const st = await queryServiceStats({ proceso: p.proceso, airport: o.airport, desde: o.desde, hasta: o.hasta }).catch(
        (e: unknown) => {
          console.error("[informes] atención no disponible:", p.proceso, e instanceof Error ? e.message : e);
          return null;
        }
      );
      if (!st?.all) return;
      const byYm = new Map(st.months.map((m) => [m.ym, m]));
      const kpi = o.month ? (byYm.get(o.month) ?? null) : st.all;
      const airlines = new Map<string, { n: number; sum: number }>();
      for (const a of st.airlines) {
        if (o.month && a.ym !== o.month) continue;
        const acc = airlines.get(a.airline) ?? { n: 0, sum: 0 };
        acc.n += a.n;
        acc.sum += a.prom * a.n;
        airlines.set(a.airline, acc);
      }
      p.service = {
        kpi,
        period: st.all,
        series: p.series.map((s) => byYm.get(s.ym)?.prom ?? null),
        byAirline: Object.fromEntries([...airlines].map(([k, v]) => [k, v.n > 0 ? v.sum / v.n : null])),
      };
    })
  );
}
