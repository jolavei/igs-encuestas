// Capa de datos del informe mensual por aeropuerto: une el cumplimiento de
// Encuestas ASQ (Postgres) con las mediciones de tiempos (BigQuery) para los
// aeropuertos que tienen un plan de trabajo vigente en el mes.
//
// Server-only. Lo consumen la ruta HTML imprimible y el generador de PPTX.

import { prisma } from "@/lib/prisma";
import { BigQueryCredentialsError } from "@/lib/bigquery";
import {
  AIRPORTS,
  PROCESOS,
  metaFor,
  hasAirline,
  seasonOf,
  ymLabel,
  type Periodo,
  type Proceso,
  type Fase,
} from "@/lib/dashboardTiempos";
import { queryTiempos, queryTiemposByAirline, type AirlineSerieRow } from "@/lib/reports/tiemposQuery";
import { planDisplayTitle } from "@/lib/planTitle";
import { shortAirline } from "@/lib/reports/design";
import { getAgaSurveys, type AgaSurvey } from "@/lib/reports/agaSurvey";
import { isValidMonth, currentMonth, monthLabel } from "@/lib/reports/period";
import type { ModuleKey } from "@/lib/reports/modules";
import type { ReportKind } from "@/lib/reports/period";
import type { SeasonExtras } from "@/lib/reports/seasonReport";
import { attachService, periodHasService, type ReportService } from "@/lib/reports/serviceTimes";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Temporada ASQ (como se guarda en AsqComplianceRun) para un mes 1-12:
 * abr–sep = SUMMER del mismo año; oct–mar = WINTER del año de inicio
 * (oct-2026 y mar-2027 → WINTER 2026, etiqueta "Winter-2026-27").
 */
export function asqSeasonOf(y: number, m: number): { season: "SUMMER" | "WINTER"; year: number } {
  if (m >= 4 && m <= 9) return { season: "SUMMER", year: y };
  return { season: "WINTER", year: m >= 10 ? y : y - 1 };
}

// Helpers de mes: viven en period.ts; se re-exportan para los importadores existentes.
export { isValidMonth, currentMonth, monthLabel };

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59)); // último día del mes
  return { start, end, y, m };
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium" }).format(d);
}

const airportByCode = (code: string) => AIRPORTS.find((a) => a.code === code) ?? null;

// ---------------------------------------------------------------------------
// Listado: aeropuertos con plan vigente en el mes
// ---------------------------------------------------------------------------

export type ReportAirportListItem = {
  code: string;
  companyId: string;
  name: string; // nombre del aeropuerto (canónico) o de la empresa
  short: string | null;
  companyName: string;
  sedeLabel: string | null;
  plans: number; // cantidad de planes vigentes de la empresa en el mes
};

/**
 * Aeropuertos que se deben informar: los mapeados en AsqAirportMapping cuya
 * empresa tiene al menos un WorkPlan ACTIVE cuya ventana solapa el mes.
 */
export async function listReportAirports(month: string): Promise<ReportAirportListItem[]> {
  const { start, end } = monthBounds(month);
  return listReportAirportsBetween(start, end);
}

/** Igual que listReportAirports, para una ventana cualquiera (semestre, año ASQ). */
export async function listReportAirportsBetween(start: Date, end: Date): Promise<ReportAirportListItem[]> {
  const [activePlans, mappings] = await Promise.all([
    prisma.workPlan.findMany({
      where: { status: "ACTIVE", windowStart: { lte: end }, windowEnd: { gte: start } },
      select: { companyId: true },
    }),
    prisma.asqAirportMapping.findMany({ include: { company: true, location: true } }),
  ]);

  const planCountByCompany = new Map<string, number>();
  for (const p of activePlans) planCountByCompany.set(p.companyId, (planCountByCompany.get(p.companyId) ?? 0) + 1);

  const items: ReportAirportListItem[] = [];
  for (const m of mappings) {
    if (!m.companyId) continue;
    const plans = planCountByCompany.get(m.companyId);
    if (!plans) continue;
    const ap = airportByCode(m.airport);
    items.push({
      code: m.airport,
      companyId: m.companyId,
      name: ap?.name ?? m.company?.name ?? m.airport,
      short: ap?.short ?? null,
      companyName: m.company?.name ?? "—",
      sedeLabel: m.company ? `${m.company.name}${m.location ? ` · ${m.location.name}` : ""}` : null,
      plans,
    });
  }
  items.sort((a, b) => a.code.localeCompare(b.code));
  return items;
}

/**
 * Todos los aeropuertos asociados a una empresa en Encuestas ASQ (AsqAirportMapping), con
 * cuántos planes (de cualquier estado salvo cancelado) solapan la ventana. Semestral/anual
 * parten de esta lista y dejan los que tienen datos en la temporada.
 */
export async function listMappedAirports(start: Date, end: Date): Promise<ReportAirportListItem[]> {
  const [plans, mappings] = await Promise.all([
    prisma.workPlan.findMany({
      where: { status: { not: "CANCELLED" }, windowStart: { lte: end }, windowEnd: { gte: start } },
      select: { companyId: true },
    }),
    prisma.asqAirportMapping.findMany({ include: { company: true, location: true } }),
  ]);
  const items: ReportAirportListItem[] = [];
  for (const m of mappings) {
    if (!m.companyId || !m.company) continue;
    const ap = airportByCode(m.airport);
    items.push({
      code: m.airport,
      companyId: m.companyId,
      name: ap?.name ?? m.company.name,
      short: ap?.short ?? null,
      companyName: m.company.name,
      sedeLabel: `${m.company.name}${m.location ? ` · ${m.location.name}` : ""}`,
      plans: plans.filter((p) => p.companyId === m.companyId).length,
    });
  }
  return items.sort((a, b) => a.code.localeCompare(b.code));
}

/** Identidad de un aeropuerto para el editor (aunque no tenga plan vigente en el mes). */
export async function getReportAirportItem(code: string, month: string): Promise<ReportAirportListItem | null> {
  const listed = (await listReportAirports(month)).find((a) => a.code === code);
  if (listed) return listed;
  const m = await prisma.asqAirportMapping.findUnique({
    where: { airport: code },
    include: { company: true, location: true },
  });
  if (!m?.companyId || !m.company) return null;
  const ap = airportByCode(code);
  return {
    code,
    companyId: m.companyId,
    name: ap?.name ?? m.company.name,
    short: ap?.short ?? null,
    companyName: m.company.name,
    sedeLabel: `${m.company.name}${m.location ? ` · ${m.location.name}` : ""}`,
    plans: 0,
  };
}

// ---------------------------------------------------------------------------
// Informe completo de un aeropuerto
// ---------------------------------------------------------------------------

export type AsqRouteRow = { airlineDestination: string; target: number; collected: number };

export type ReportAirlineBreakdown = {
  airline: string;
  label: string; // etiqueta a mostrar (Check in: nombre corto; Retiro: nombre completo)
  meta: number | null; // Estándar IATA de esa aerolínea (Check in: quiosco 5 / counter 20)
  monthProm: number | null; // promedio del mes
  monthN: number; // mediciones del mes
  series: { ym: string; label: string; prom: number | null }[]; // evolutivo del promedio
};

export type TiempoAgg = { n: number; prom: number; med: number; p90: number };

export type ReportProcess = {
  proceso: Proceso;
  fase: Fase | null;
  faseLabel: string | null; // "Espera 1ª maleta" / "Última maleta" (solo Retiro)
  meta: number | null; // Estándar IATA (min)
  monthHasData: boolean; // ¿hubo mediciones este mes? (si no, la diapositiva se muestra igual por la temporada)
  kpi: TiempoAgg | null; // del mes; null si el mes no tuvo mediciones
  kpiSeason: TiempoAgg; // del periodo completo (temporada)
  margin: number | null; // meta - prom del mes (min); null si el proceso no tiene estándar o el mes no tuvo mediciones
  series: { ym: string; label: string; prom: number | null; med: number | null; p90: number | null }[];
  byAirline: ReportAirlineBreakdown[]; // vacío si el proceso no distingue aerolínea
  // Tiempo de atención (t3 − t2): solo en informes desde oct-2026 y procesos con fila + atención.
  service?: ReportService | null;
};

export type MonthlyReport = {
  // Semestral/anual (getSeasonReport): "month"/"monthLabel" = el periodo del informe.
  kind?: ReportKind;
  seasonal?: SeasonExtras;
  airport: {
    code: string;
    name: string;
    short: string | null;
    companyName: string;
    sedeLabel: string | null;
  };
  month: string;
  monthLabel: string;
  season: Periodo;
  plans: { questionnaire: string; location: string | null; windowStart: string; windowEnd: string }[];
  asq: {
    seasonLabel: string;
    scrapedAt: Date | null;
    // Fecha del avance mostrado (día de Chile, "YYYY-MM-DD") y si es posterior al cierre
    // del mes (mes cerrado sin foto diaria de ese mes: se muestra la más reciente).
    asOf: string;
    afterMonthEnd: boolean;
    rows: AsqRouteRow[];
    target: number;
    collected: number;
    pct: number;
  } | null;
  processes: ReportProcess[];
  bqError: string | null; // mensaje si no se pudieron leer los tiempos (ASQ sí puede venir)
  aga: AgaSurvey[]; // Encuestas AGA (Módulo 03); vacío si el aeropuerto no tiene plan AGA vigente
};

export type MonthlyReportOptions = {
  // Módulos encendidos en la edición. Si se entrega, se omiten las consultas de los
  // módulos apagados (p. ej. sin "tiempos" no se consulta BigQuery).
  modules?: ModuleKey[];
};

const chileDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Devuelve null si el aeropuerto no está mapeado (no hay identidad de aeropuerto). */
export async function getMonthlyReport(
  code: string,
  month: string,
  opts: MonthlyReportOptions = {}
): Promise<MonthlyReport | null> {
  const wants = (k: ModuleKey) => !opts.modules || opts.modules.includes(k);
  const mapping = await prisma.asqAirportMapping.findUnique({
    where: { airport: code },
    include: { company: true, location: true },
  });
  if (!mapping || !mapping.company) return null;

  const { start, end, y, m } = monthBounds(month);
  const season = seasonOf(new Date(y, m - 1, 15));
  const ap = airportByCode(code);

  // Planes vigentes de la empresa en el mes (contexto).
  const plansRaw = await prisma.workPlan.findMany({
    where: {
      companyId: mapping.companyId!,
      status: "ACTIVE",
      windowStart: { lte: end },
      windowEnd: { gte: start },
    },
    include: { questionnaire: { select: { title: true } }, location: { select: { name: true } } },
    orderBy: { windowEnd: "asc" },
  });
  const plans = plansRaw.map((p) => ({
    questionnaire: planDisplayTitle(p.questionnaire.title, p.name),
    location: p.location?.name ?? null,
    windowStart: fmtDate(p.windowStart),
    windowEnd: fmtDate(p.windowEnd),
  }));

  // Encuestas AGA (Postgres): de los planes vigentes cuyo cuestionario es AGA.
  const aga = wants("aga-pasajeros") || wants("aga-acompanantes") ? await getAgaSurveys(plansRaw, month) : [];

  // ASQ: la temporada que corresponde al mes del informe (no la más reciente). Mes en
  // curso = corrida vigente; mes cerrado = foto diaria del último día del mes (o la
  // última anterior). Si no hay foto de ese mes, se usa la vigente y se avisa.
  const asq = wants("asq-avance") ? await loadAsqProgress(code, month, end) : null;

  // Tiempos: sólo si el aeropuerto tiene equivalente en AIRPORTS (dato en BigQuery).
  // Se consultan todos los procesos/fases en paralelo; el informe usa la serie mensual
  // + (Check in / Retiro) el desglose por aerolínea.
  const seasonMonths = monthsOfSeason(season);
  // Retiro se informa en 2 fases: espera 1ª maleta y última maleta (descarga de correa).
  const jobs: { proceso: Proceso; fase: Fase | null; faseLabel: string | null }[] = [];
  for (const proceso of PROCESOS) {
    if (proceso === "Retiro de equipajes") {
      jobs.push({ proceso, fase: "espera", faseLabel: "Espera 1ª maleta" });
      jobs.push({ proceso, fase: "descarga", faseLabel: "Última maleta" });
    } else {
      jobs.push({ proceso, fase: null, faseLabel: null });
    }
  }

  let processes: ReportProcess[] = [];
  let bqError: string | null = null;
  if (ap && wants("tiempos")) {
    try {
      const results = await Promise.all(
        jobs.map(async ({ proceso, fase, faseLabel }) => {
          const [main, airlineRows] = await Promise.all([
            // scopeAirports acota byAirport (= agregado del periodo) a este aeropuerto.
            queryTiempos({
              proceso,
              airport: ap.name,
              desde: season.from,
              hasta: season.to,
              fase: fase ?? undefined,
              scopeAirports: [ap.name],
              skipSeasons: true,
              reportSource: true,
            }),
            hasAirline(proceso)
              ? queryTiemposByAirline({
                  proceso,
                  airport: ap.name,
                  desde: season.from,
                  hasta: season.to,
                  fase: fase ?? undefined,
                  reportSource: true,
                })
              : Promise.resolve([] as AirlineSerieRow[]),
          ]);
          const monthEntry = main.series.find((s) => s.ym === month);
          const agg = main.byAirport.find((r) => r.name === ap.name);
          // La diapositiva aparece si el proceso tuvo alguna medición en la TEMPORADA,
          // aunque este mes puntual todavía no registre ninguna (p. ej. Check in en agosto
          // cuando ya se midió antes en la misma temporada).
          const monthHasData = !!monthEntry && monthEntry.n > 0;
          const seasonHasData = !!agg && agg.n > 0;
          if (!monthHasData && !seasonHasData) return null;

          const kpiSeason: TiempoAgg = agg
            ? { n: agg.n, prom: agg.prom, med: agg.med, p90: agg.p90 }
            : { n: 0, prom: 0, med: 0, p90: 0 };

          const meta = metaFor(proceso, "Todas");
          const byYm = new Map(main.series.map((s) => [s.ym, s]));
          const evol = seasonMonths.map((ym) => {
            const s = byYm.get(ym);
            return {
              ym,
              label: ymLabel(ym),
              prom: s ? s.prom : null,
              med: s ? s.med : null,
              p90: s ? s.p90 : null,
            };
          });

          // Desglose por aerolínea (promedio mensual), sólo aerolíneas con datos en el mes.
          const byAirlineMap = new Map<string, Map<string, number>>();
          for (const r of airlineRows) {
            if (!byAirlineMap.has(r.airline)) byAirlineMap.set(r.airline, new Map());
            byAirlineMap.get(r.airline)!.set(r.ym, r.prom);
          }
          const airlineMonthN = new Map<string, number>();
          for (const r of airlineRows) if (r.ym === month) airlineMonthN.set(r.airline, r.n);
          const byAirline: ReportAirlineBreakdown[] = [...byAirlineMap.entries()]
            .map(([airline, m]) => ({
              airline,
              // Check in muestra el nombre corto (con modalidad); Retiro el nombre completo.
              label: proceso === "Check in" ? shortAirline(airline) : airline,
              meta: metaFor(proceso, airline),
              monthProm: m.get(month) ?? null,
              monthN: airlineMonthN.get(airline) ?? 0,
              series: seasonMonths.map((ym) => ({ ym, label: ymLabel(ym), prom: m.get(ym) ?? null })),
            }))
            .filter((x) => x.monthN > 0)
            .sort((a, b) => b.monthN - a.monthN);

          const rp: ReportProcess = {
            proceso,
            fase,
            faseLabel,
            meta,
            monthHasData,
            kpi: monthHasData
              ? { n: monthEntry!.n, prom: monthEntry!.prom, med: monthEntry!.med, p90: monthEntry!.p90 }
              : null,
            kpiSeason,
            margin: monthHasData && meta != null ? meta - monthEntry!.prom : null,
            series: evol,
            byAirline,
          };
          return rp;
        })
      );
      processes = results.filter((r): r is ReportProcess => r !== null);
      // Atención: solo desde octubre de 2026 (antes no se agrega el indicador).
      if (periodHasService(`${month}-01`)) {
        await attachService(processes, { airport: ap.name, desde: season.from, hasta: season.to, month });
      }
    } catch (e) {
      if (e instanceof BigQueryCredentialsError) bqError = e.message;
      else bqError = e instanceof Error ? e.message : "Error consultando BigQuery.";
    }
  }

  return {
    airport: {
      code,
      name: ap?.name ?? mapping.company.name,
      short: ap?.short ?? null,
      companyName: mapping.company.name,
      sedeLabel: `${mapping.company.name}${mapping.location ? ` · ${mapping.location.name}` : ""}`,
    },
    month,
    monthLabel: monthLabel(month),
    season,
    plans,
    asq,
    processes,
    bqError,
    aga,
  };
}

export async function loadAsqProgress(code: string, month: string, monthEnd: Date): Promise<MonthlyReport["asq"]> {
  const [y, m] = month.split("-").map(Number);
  const season = asqSeasonOf(y, m);
  const closed = month < currentMonth();
  const monthEndDay = chileDay(monthEnd);

  const pack = (
    base: { seasonLabel: string; scrapedAt: Date | null; asOf: string },
    rows: AsqRouteRow[]
  ): NonNullable<MonthlyReport["asq"]> => {
    const target = rows.reduce((a, b) => a + b.target, 0);
    const collected = rows.reduce((a, b) => a + b.collected, 0);
    return {
      ...base,
      afterMonthEnd: base.asOf > monthEndDay,
      rows,
      target,
      collected,
      pct: target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0,
    };
  };

  if (closed) {
    const snap = await prisma.asqComplianceSnapshot.findFirst({
      where: { airport: code, ...season, snapshotDate: { lte: new Date(`${monthEndDay}T00:00:00Z`) } },
      orderBy: { snapshotDate: "desc" },
    });
    if (snap) {
      const rows = (Array.isArray(snap.rows) ? snap.rows : [])
        .map((r) => r as Partial<AsqRouteRow>)
        .filter((r): r is AsqRouteRow => typeof r.airlineDestination === "string")
        .map((r) => ({ airlineDestination: r.airlineDestination, target: Number(r.target) || 0, collected: Number(r.collected) || 0 }))
        .sort((a, b) => a.airlineDestination.localeCompare(b.airlineDestination));
      return pack({ seasonLabel: snap.seasonLabel, scrapedAt: null, asOf: snap.snapshotDate.toISOString().slice(0, 10) }, rows);
    }
  }

  const run = await prisma.asqComplianceRun.findFirst({
    where: { airport: code, ...season },
    orderBy: { scrapedAt: "desc" },
    include: { rows: { orderBy: { airlineDestination: "asc" } } },
  });
  if (!run) return null;
  return pack(
    { seasonLabel: run.seasonLabel, scrapedAt: run.scrapedAt, asOf: chileDay(run.scrapedAt) },
    run.rows.map((r) => ({ airlineDestination: r.airlineDestination, target: r.target, collected: r.collected }))
  );
}

/** "2026-09-30" -> "30-09-2026". */
export const fmtDay = (iso: string) => iso.split("-").reverse().join("-");

/** Lista de meses "YYYY-MM" de una temporada (from..to inclusive). */
function monthsOfSeason(s: Periodo): string[] {
  const out: string[] = [];
  const d = new Date(s.from + "T00:00:00");
  const end = new Date(s.to + "T00:00:00");
  while (d <= end) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}
