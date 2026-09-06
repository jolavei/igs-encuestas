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
import { shortAirline } from "@/lib/reports/design";

const pad = (n: number) => String(n).padStart(2, "0");

/** true si el string tiene forma "YYYY-MM". */
export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/** Mes actual en hora de Chile, como "YYYY-MM". */
export function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return parts.slice(0, 7); // "YYYY-MM"
}

/** "YYYY-MM" -> "agosto 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthBounds(month: string) {
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
};

export type MonthlyReport = {
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
    rows: AsqRouteRow[];
    target: number;
    collected: number;
    pct: number;
  } | null;
  processes: ReportProcess[];
  bqError: string | null; // mensaje si no se pudieron leer los tiempos (ASQ sí puede venir)
};

/** Devuelve null si el aeropuerto no está mapeado (no hay identidad de aeropuerto). */
export async function getMonthlyReport(code: string, month: string): Promise<MonthlyReport | null> {
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
    questionnaire: p.questionnaire.title,
    location: p.location?.name ?? null,
    windowStart: fmtDate(p.windowStart),
    windowEnd: fmtDate(p.windowEnd),
  }));

  // ASQ: temporada más reciente disponible para el aeropuerto.
  const run = await prisma.asqComplianceRun.findFirst({
    where: { airport: code },
    orderBy: [{ year: "desc" }, { season: "desc" }],
    include: { rows: { orderBy: { airlineDestination: "asc" } } },
  });
  let asq: MonthlyReport["asq"] = null;
  if (run) {
    const rows = run.rows.map((r) => ({
      airlineDestination: r.airlineDestination,
      target: r.target,
      collected: r.collected,
    }));
    const target = rows.reduce((a, b) => a + b.target, 0);
    const collected = rows.reduce((a, b) => a + b.collected, 0);
    asq = {
      seasonLabel: run.seasonLabel,
      scrapedAt: run.scrapedAt,
      rows,
      target,
      collected,
      pct: target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0,
    };
  }

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
  if (ap) {
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
            }),
            hasAirline(proceso)
              ? queryTiemposByAirline({ proceso, airport: ap.name, desde: season.from, hasta: season.to, fase: fase ?? undefined })
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
  };
}

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
