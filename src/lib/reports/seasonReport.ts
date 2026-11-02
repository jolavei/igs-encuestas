// Capa de datos de los informes semestral y anual por aeropuerto.
//
// Devuelve la misma forma que el informe mensual (MonthlyReport), así el deck HTML y el
// PPTX reutilizan sus diapositivas: lo que en el mensual es "el mes" aquí es la
// temporada de detalle. No se compara contra una temporada puntual: la evolución se
// muestra con todo el histórico (por temporada) y la serie mensual de la ventana.
// Además trae lo propio del semestral: histórico por temporada, franjas horarias y
// evolución de las Encuestas AGA.
//
// Fuentes con corte al 1-oct-2026: tiempos (Sheets antes, web después) y AGA (histórico
// importado de Sheets antes, web después). ACI ASQ: microdata de la temporada de detalle
// (Ingesta ASQ → BigQuery) con benchmark contra los aeropuertos chilenos y toda la base.
//
// Server-only.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BigQueryCredentialsError } from "@/lib/bigquery";
import { computeNps } from "@/lib/metrics";
import { AIRPORTS, PROCESOS, hasAirline, metaFor, ymLabel, type Fase, type Proceso } from "@/lib/dashboardTiempos";
import {
  REPORT_SOURCE_CUTOFF,
  queryTiempos,
  queryTiemposByAirline,
  queryTiemposBySeason,
  queryTiemposHotspot,
  hasServiceColumns,
  type CheckinMode,
  type HotspotData,
  type SeasonAggRow,
} from "@/lib/reports/tiemposQuery";
import {
  aggregateAga,
  audienceOf,
  cleanLabel,
  isAgaQuestionnaire,
  isValidAgaSource,
  type AgaAnswerRow,
  type AgaAudience,
  type AgaQuote,
  type AgaSurvey,
} from "@/lib/reports/agaSurvey";
import { SURVEY_VIEWS } from "@/lib/surveys/views";
import { shortAirline } from "@/lib/reports/design";
import { loadAsqProgress, type MonthlyReport, type ReportAirlineBreakdown, type ReportProcess } from "@/lib/reports/monthlyReport";
import { seasonFromCode, seasonOrder, type PeriodContext, type Season } from "@/lib/reports/period";
import type { ModuleKey } from "@/lib/reports/modules";
import { getAsqResults, type AsqResults } from "@/lib/asq/results";
import { attachService, periodHasService } from "@/lib/reports/serviceTimes";
import { agaCategoryOf } from "@/lib/reports/seasonSlides";

export type SeasonExtras = {
  focusLabel: string; // "Summer 2026"
  focusCode: string; // "SU26"
  tiemposHistory: {
    seasons: { code: string; label: string }[];
    series: { label: string; meta: number | null; values: (number | null)[] }[];
  };
  // Mapa de hotspots (día × hora) por proceso en la temporada de detalle. Check in se abre
  // en tradicional y quiosco porque cada modalidad tiene su propio Estándar IATA.
  tiemposHot: { label: string; meta: number | null; data: HotspotData }[];
  // Resultados ACI ASQ de la temporada de detalle (null: base no cargada o sin encuestas).
  asq: AsqResults | null;
  asqError: string | null;
  // Mismo orden que `aga` del informe.
  agaHistory: {
    seasons: { code: string; label: string; n: number; ratingAvg: number | null; nps: number | null }[];
    months: { ym: string; label: string; n: number; ratingAvg: number | null }[];
    // Nota por categoría en cada temporada (alineada con `seasons`).
    categories: { label: string; values: (number | null)[] }[];
  }[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const chileDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const seasonCodeOfDay = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return m >= 4 && m <= 9 ? `SU${pad(y % 100)}` : `WI${pad((m >= 10 ? y : y - 1) % 100)}`;
};
const inRange = (day: string, s: { from: string; to: string }) => day >= s.from && day <= s.to;

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${pad(m)}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

export async function getSeasonReport(
  code: string,
  ctx: PeriodContext,
  opts: { modules?: ModuleKey[] } = {}
): Promise<(MonthlyReport & { seasonal: SeasonExtras }) | null> {
  const wants = (k: ModuleKey) => !opts.modules || opts.modules.includes(k);
  const mapping = await prisma.asqAirportMapping.findUnique({
    where: { airport: code },
    include: { company: true, location: true },
  });
  if (!mapping?.companyId || !mapping.company) return null;
  const ap = AIRPORTS.find((a) => a.code === code) ?? null;

  const label = ctx.kind === "ANUAL" ? `${ctx.label} · detalle ${ctx.season.label}` : ctx.label;
  const seasonal: SeasonExtras = {
    focusLabel: ctx.season.label,
    focusCode: ctx.season.code,
    tiemposHistory: { seasons: [], series: [] },
    tiemposHot: [],
    asq: null,
    asqError: null,
    agaHistory: [],
  };

  const [tiempos, aga, asq, asqResults] = await Promise.all([
    ap && wants("tiempos") ? loadTiempos(ap.name, ctx, seasonal) : Promise.resolve({ processes: [], bqError: null }),
    wants("aga-pasajeros") || wants("aga-acompanantes")
      ? loadAga(mapping.companyId, ctx, seasonal)
      : Promise.resolve([] as AgaSurvey[]),
    // Avance ASQ: cumplimiento de la temporada de detalle al cierre (o el último disponible).
    wants("asq-avance")
      ? loadAsqProgress(code, ctx.season.to.slice(0, 7), new Date(`${ctx.season.to}T23:59:59Z`))
      : Promise.resolve(null),
    wants("asq-resultados")
      ? getAsqResults(code, ctx.season.code).catch((e: unknown) => {
          seasonal.asqError =
            e instanceof BigQueryCredentialsError ? e.message : e instanceof Error ? e.message : "Error consultando BigQuery.";
          return null;
        })
      : Promise.resolve(null),
  ]);
  seasonal.asq = asqResults;

  return {
    kind: ctx.kind,
    airport: {
      code,
      name: ap?.name ?? mapping.company.name,
      short: ap?.short ?? null,
      companyName: mapping.company.name,
      sedeLabel: `${mapping.company.name}${mapping.location ? ` · ${mapping.location.name}` : ""}`,
    },
    month: ctx.key,
    monthLabel: label,
    season: { label: ctx.season.label, from: ctx.window.from, to: ctx.window.to },
    plans: [],
    asq,
    processes: tiempos.processes,
    bqError: tiempos.bqError,
    aga,
    seasonal,
  };
}

// ---------------------------------------------------------------------------
// Mediciones de tiempos
// ---------------------------------------------------------------------------

async function loadTiempos(
  airport: string,
  ctx: PeriodContext,
  seasonal: SeasonExtras
): Promise<{ processes: ReportProcess[]; bqError: string | null }> {
  const jobs: { proceso: Proceso; fase: Fase | null; faseLabel: string | null }[] = [];
  for (const proceso of PROCESOS) {
    if (proceso === "Retiro de equipajes") {
      jobs.push({ proceso, fase: "espera", faseLabel: "Espera 1ª maleta" });
      jobs.push({ proceso, fase: "descarga", faseLabel: "Última maleta" });
    } else jobs.push({ proceso, fase: null, faseLabel: null });
  }
  const months = monthsBetween(ctx.window.from, ctx.window.to);
  const focusMonths = new Set(monthsBetween(ctx.season.from, ctx.season.to));
  // Atención (t3 − t2): solo si la temporada de detalle empieza desde el 1-oct-2026.
  const withService = periodHasService(ctx.season.from) && (await hasServiceColumns().catch(() => false));

  try {
    const results = await Promise.all(
      jobs.map(async (job) => {
        const fase = job.fase ?? undefined;
        const [bySeason, main, airlineRows] = await Promise.all([
          queryTiemposBySeason({ proceso: job.proceso, fase, airport, hasta: ctx.window.to }),
          queryTiempos({
            proceso: job.proceso,
            airport,
            desde: ctx.window.from,
            hasta: ctx.window.to,
            fase,
            seriesOnly: true,
            reportSource: true,
          }),
          hasAirline(job.proceso)
            ? queryTiemposByAirline({
                proceso: job.proceso,
                airport,
                desde: ctx.window.from,
                hasta: ctx.window.to,
                fase,
                reportSource: true,
              })
            : Promise.resolve([]),
        ]);
        return { job, bySeason, main, airlineRows };
      })
    );

    // Hotspots de la temporada de detalle.
    type HotJob = { label: string; proceso: Proceso; fase?: Fase; mode?: CheckinMode; meta: number | null };
    const hotJobs = jobs.flatMap((j): HotJob[] => {
      if (j.proceso === "Check in")
        return [
          { label: "Check in tradicional", proceso: j.proceso, mode: "counter" as const, meta: metaFor(j.proceso, "Todas") },
          { label: "Check in quiosco", proceso: j.proceso, mode: "quiosco" as const, meta: metaFor(j.proceso, "LATAM Airlines - Quiosco") },
        ];
      return [
        {
          label: `${j.proceso}${j.faseLabel ? ` — ${j.faseLabel}` : ""}`,
          proceso: j.proceso,
          fase: j.fase ?? undefined,
          meta: metaFor(j.proceso, "Todas"),
        },
      ];
    });
    const hot = await Promise.all(
      hotJobs.map(async (h) => ({
        label: h.label,
        meta: h.meta,
        data: await queryTiemposHotspot({ proceso: h.proceso, fase: h.fase, mode: h.mode, airport, desde: ctx.season.from, hasta: ctx.season.to }),
      }))
    );
    seasonal.tiemposHot = hot
      .filter((h) => h.data.total)
      .map((h) => ({
        ...h,
        data: {
          ...h.data,
          airlines: h.data.airlines.map((a) => ({ ...a, airline: a.airline.includes(" - ") ? a.airline : shortAirline(a.airline) })),
        },
      }));

    // Temporadas con datos (de cualquier proceso) hasta el fin de la ventana: eje del histórico.
    const codes = new Set<string>();
    for (const r of results) for (const s of r.bySeason) if (s.n > 0) codes.add(s.code);
    const histSeasons = [...codes]
      .map((c) => seasonFromCode(c))
      .filter((s): s is Season => !!s)
      .sort((a, b) => seasonOrder(a) - seasonOrder(b));
    seasonal.tiemposHistory.seasons = histSeasons.map((s) => ({ code: s.code, label: s.label }));

    const processes: ReportProcess[] = [];
    for (const { job, bySeason, main, airlineRows } of results) {
      const agg = new Map<string, SeasonAggRow>(bySeason.map((s) => [s.code, s]));
      const focus = agg.get(ctx.season.code);
      if (!focus || focus.n === 0) continue; // sin mediciones en la temporada de detalle
      const meta = metaFor(job.proceso, "Todas");
      const procLabel = `${job.proceso}${job.faseLabel ? ` — ${job.faseLabel}` : ""}`;

      const byYm = new Map(main.series.map((s) => [s.ym, s]));
      const series = months.map((ym) => {
        const s = byYm.get(ym);
        return { ym, label: ymLabel(ym), prom: s?.prom ?? null, med: s?.med ?? null, p90: s?.p90 ?? null };
      });

      // Por aerolínea: promedio de la temporada de detalle (ponderado por n) + serie mensual.
      const air = new Map<string, Map<string, { n: number; prom: number }>>();
      for (const r of airlineRows) {
        if (!air.has(r.airline)) air.set(r.airline, new Map());
        air.get(r.airline)!.set(r.ym, { n: r.n, prom: r.prom });
      }
      const byAirline: ReportAirlineBreakdown[] = [...air.entries()]
        .map(([airline, m]) => {
          let n = 0;
          let sum = 0;
          for (const [ym, v] of m) {
            if (!focusMonths.has(ym)) continue;
            n += v.n;
            sum += v.prom * v.n;
          }
          return {
            airline,
            label: job.proceso === "Check in" ? shortAirline(airline) : airline,
            meta: metaFor(job.proceso, airline),
            monthProm: n > 0 ? sum / n : null,
            monthN: n,
            series: months.map((ym) => ({ ym, label: ymLabel(ym), prom: m.get(ym)?.prom ?? null })),
          };
        })
        .filter((x) => x.monthN > 0)
        .sort((a, b) => b.monthN - a.monthN);

      processes.push({
        proceso: job.proceso,
        fase: job.fase,
        faseLabel: job.faseLabel,
        meta,
        monthHasData: true,
        kpi: { n: focus.n, prom: focus.prom, med: focus.med, p90: focus.p90 },
        kpiSeason: { n: focus.n, prom: focus.prom, med: focus.med, p90: focus.p90 },
        margin: meta != null ? meta - focus.prom : null,
        series,
        byAirline,
      });

      seasonal.tiemposHistory.series.push({
        label: procLabel,
        meta,
        values: histSeasons.map((s) => agg.get(s.code)?.prom ?? null),
      });
    }
    if (withService) await attachService(processes, { airport, desde: ctx.season.from, hasta: ctx.season.to, month: null });
    return { processes, bqError: null };
  } catch (e) {
    const msg =
      e instanceof BigQueryCredentialsError ? e.message : e instanceof Error ? e.message : "Error consultando BigQuery.";
    return { processes: [], bqError: msg };
  }
}

// ---------------------------------------------------------------------------
// Encuestas AGA
// ---------------------------------------------------------------------------

type HistRow = { id: string; createdAt: Date; source: string; sum: number | null; cnt: bigint | number; nps: number | null };
type HistItemRow = { ym: string; source: string; section: string | null; text: string; sum: number | null; cnt: bigint | number };

async function loadAga(
  companyId: string,
  ctx: PeriodContext,
  seasonal: SeasonExtras
): Promise<AgaSurvey[]> {
  const plans = await prisma.workPlan.findMany({
    where: { companyId },
    select: { id: true, questionnaire: { select: { title: true } } },
  });
  const byAudience = new Map<AgaAudience, string[]>();
  for (const p of plans) {
    if (!isAgaQuestionnaire(p.questionnaire.title)) continue;
    const a = audienceOf(p.questionnaire.title);
    byAudience.set(a, [...(byAudience.get(a) ?? []), p.id]);
  }

  const from = ctx.window.from;
  const out: AgaSurvey[] = [];
  for (const audience of ["Pasajeros", "Acompañantes"] as AgaAudience[]) {
    const ids = byAudience.get(audience);
    if (!ids?.length) continue;
    const cfg = SURVEY_VIEWS[audience === "Pasajeros" ? "aga-pasajeros" : "aga-acompanantes"];

    const [sets, hist, histItems] = await Promise.all([
      prisma.responseSet.findMany({
        where: {
          workPlanId: { in: ids },
          createdAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${ctx.window.to}T23:59:59Z`) },
        },
        select: {
          createdAt: true,
          source: true,
          answers: {
            select: {
              valueNumber: true,
              valueText: true,
              highlight: { select: { id: true } },
              question: { select: { type: true, text: true, section: { select: { title: true } } } },
            },
          },
        },
      }),
      // Histórico por temporada (todas las temporadas): una fila por encuesta, con la
      // suma y cantidad de notas (sin la satisfacción general) y su NPS.
      prisma.$queryRaw<HistRow[]>(Prisma.sql`
        SELECT r.id, r."createdAt", r.source,
          SUM(a."valueNumber") FILTER (WHERE q.type = 'RATING' AND q.text !~* 'satisfacci[oó]n general') AS sum,
          COUNT(a."valueNumber") FILTER (WHERE q.type = 'RATING' AND q.text !~* 'satisfacci[oó]n general') AS cnt,
          MAX(a."valueNumber") FILTER (WHERE q.type = 'NPS') AS nps
        FROM "ResponseSet" r
        JOIN "Answer" a ON a."responseSetId" = r.id
        JOIN "Question" q ON q.id = a."questionId"
        WHERE r."workPlanId" IN (${Prisma.join(ids)})
          AND r."createdAt" <= ${new Date(`${ctx.window.to}T23:59:59Z`)}
        GROUP BY r.id`),
      // Notas por ítem y mes (todas las temporadas), para el mapa de categorías por temporada.
      prisma.$queryRaw<HistItemRow[]>(Prisma.sql`
        SELECT to_char(r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago', 'YYYY-MM') AS ym, r.source, s.title AS section, q.text,
          SUM(a."valueNumber") AS sum, COUNT(a."valueNumber") AS cnt
        FROM "ResponseSet" r
        JOIN "Answer" a ON a."responseSetId" = r.id
        JOIN "Question" q ON q.id = a."questionId"
        LEFT JOIN "QuestionSection" s ON s.id = q."sectionId"
        WHERE r."workPlanId" IN (${Prisma.join(ids)})
          AND r."createdAt" <= ${new Date(`${ctx.window.to}T23:59:59Z`)}
          AND q.type = 'RATING' AND q.text !~* 'satisfacci[oó]n general'
        GROUP BY 1, 2, 3, 4`),
    ]);

    const valid = sets
      .map((s) => ({ ...s, day: chileDay(s.createdAt) }))
      .filter((s) => s.answers.length > 0 && isValidAgaSource(s.day, s.source, REPORT_SOURCE_CUTOFF));
    const rowsOf = (s: (typeof valid)[number]): AgaAnswerRow[] =>
      s.answers.map((a) => ({
        type: a.question.type,
        text: a.question.text,
        section: a.question.section?.title ?? null,
        num: a.valueNumber,
        txt: a.valueText,
      }));

    const focusSets = valid.filter((s) => inRange(s.day, ctx.season));

    const quotes: AgaQuote[] = [];
    for (const s of focusSets) {
      const nps = s.answers.find((a) => a.question.type === "NPS" && a.valueNumber != null)?.valueNumber ?? null;
      for (const a of s.answers) {
        if (!a.highlight || a.question.type !== "TEXT" || !a.valueText?.trim()) continue;
        const lbl = cfg.openLabels.find((o) => o.match.test(a.question.text))?.label ?? cleanLabel(a.question.text);
        quotes.push({ label: lbl, text: a.valueText.trim(), nps });
      }
    }

    out.push({
      audience,
      planTitle: ctx.season.label,
      target: 0,
      month: aggregateAga(focusSets.map(rowsOf)),
      period: aggregateAga(valid.map(rowsOf)), // toda la ventana (en el anual, el año); no se muestra
      voice: { appraisal: null, quotes },
    });

    // Evolución mensual en la ventana.
    const months = monthsBetween(ctx.window.from, ctx.window.to).map((ym) => {
      const st = aggregateAga(valid.filter((s) => s.day.startsWith(ym)).map(rowsOf));
      return { ym, label: ymLabel(ym), n: st.n, ratingAvg: st.ratingAvg };
    });

    // Histórico por temporada.
    const bySeason = new Map<string, { n: number; sum: number; cnt: number; nps: number[] }>();
    for (const h of hist) {
      const day = chileDay(new Date(h.createdAt));
      if (!isValidAgaSource(day, h.source, REPORT_SOURCE_CUTOFF)) continue;
      const code = seasonCodeOfDay(day);
      const acc = bySeason.get(code) ?? { n: 0, sum: 0, cnt: 0, nps: [] };
      acc.n++;
      acc.sum += Number(h.sum ?? 0);
      acc.cnt += Number(h.cnt ?? 0);
      if (h.nps != null) acc.nps.push(Number(h.nps));
      bySeason.set(code, acc);
    }
    const seasons = [...bySeason.entries()]
      .map(([c, v]) => ({ s: seasonFromCode(c)!, v }))
      .filter((x) => x.s && seasonOrder(x.s) <= seasonOrder(seasonFromCode(seasonCodeOfDay(ctx.window.to))!))
      .sort((a, b) => seasonOrder(a.s) - seasonOrder(b.s))
      .map(({ s, v }) => ({
        code: s.code,
        label: s.label,
        n: v.n,
        ratingAvg: v.cnt > 0 ? Math.round((v.sum / v.cnt) * 10) / 10 : null,
        nps: computeNps(v.nps).nps,
      }));

    // Nota por categoría en cada temporada.
    const catSeason = new Map<string, Map<string, { sum: number; cnt: number }>>();
    for (const h of histItems) {
      if (!isValidAgaSource(`${h.ym}-01`, h.source, REPORT_SOURCE_CUTOFF)) continue;
      const cat = agaCategoryOf((h.section ?? "").replace(/\s*[—–-]\s*evaluaci[oó]n\s*$/i, ""), cleanLabel(h.text));
      const code = seasonCodeOfDay(`${h.ym}-01`);
      const m = catSeason.get(cat) ?? new Map<string, { sum: number; cnt: number }>();
      const acc = m.get(code) ?? { sum: 0, cnt: 0 };
      acc.sum += Number(h.sum ?? 0);
      acc.cnt += Number(h.cnt ?? 0);
      m.set(code, acc);
      catSeason.set(cat, m);
    }
    const categories = [...catSeason.entries()]
      .map(([label, m]) => ({
        label,
        values: seasons.map((x) => {
          const acc = m.get(x.code);
          return acc && acc.cnt > 0 ? Math.round((acc.sum / acc.cnt) * 100) / 100 : null;
        }),
      }))
      .filter((c) => c.values.some((v) => v != null))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));

    seasonal.agaHistory.push({ seasons, months, categories });
  }
  return out;
}
