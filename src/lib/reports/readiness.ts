// Estado de datos de cada módulo, para las tarjetas de la página de Informes: dice
// antes de abrir el informe qué va a salir con datos, qué va a salir vacío y por qué.
//
// Server-only. Consultas livianas (conteos), no el informe completo.

import { prisma } from "@/lib/prisma";
import { AIRPORTS } from "@/lib/dashboardTiempos";
import { audienceOf, isAgaQuestionnaire, isValidAgaSource, ymOf } from "@/lib/reports/agaSurvey";
import { REPORT_SOURCE_CUTOFF, countTiemposByAirport } from "@/lib/reports/tiemposQuery";
import {
  fmtDay,
  listMappedAirports,
  loadAsqProgress,
  monthBounds,
  type ReportAirportListItem,
} from "@/lib/reports/monthlyReport";
import { bqQuery } from "@/lib/bigquery";
import { asqTableRef } from "@/lib/asq/ingestDepartures";
import { moduleDef, type ModuleKey } from "@/lib/reports/modules";
import { loadEditions, type EditionState } from "@/lib/reports/editions";
import { seasonsOfAsqYear, type PeriodContext } from "@/lib/reports/period";

// ok = listo · warn = sale, con una salvedad · bad = falta un dato · off = vacío u
// opcional · na = no aplica a este aeropuerto (no se muestra).
export type ReadinessState = "ok" | "warn" | "bad" | "off" | "na";
export type Readiness = { state: ReadinessState; text: string };
export type ModuleReadiness = Partial<Record<ModuleKey, Readiness>>;

const fmt = (n: number) => n.toLocaleString("es-CL");

/** Estado por módulo de cada aeropuerto para un informe mensual. */
export async function monthlyReadiness(
  airports: ReportAirportListItem[],
  ctx: PeriodContext,
  editions: Map<string, EditionState>
): Promise<Map<string, ModuleReadiness>> {
  const month = ctx.month!;
  const { start, end } = monthBounds(month);
  const codes = airports.map((a) => a.code);

  const canonical = (code: string): string | null => AIRPORTS.find((a) => a.code === code)?.name ?? null;
  const bqAirports = codes.map(canonical).filter((n): n is string => !!n);

  const [asq, tiempos, plans, photos] = await Promise.all([
    Promise.all(codes.map((c) => loadAsqProgress(c, month, end))),
    bqAirports.length
      ? countTiemposByAirport({ airports: bqAirports, desde: ctx.window.from, hasta: ctx.window.to, month }).catch(
          () => null
        )
      : Promise.resolve([]),
    prisma.workPlan.findMany({
      where: {
        companyId: { in: airports.map((a) => a.companyId) },
        status: "ACTIVE",
        windowStart: { lte: end },
        windowEnd: { gte: start },
      },
      select: { id: true, companyId: true, totalTarget: true, questionnaire: { select: { title: true } } },
    }),
    prisma.reportPhoto.groupBy({ by: ["airport"], where: { airport: { in: codes }, mes: month }, _count: true }),
  ]);

  const agaPlans = plans.filter((p) => isAgaQuestionnaire(p.questionnaire.title));
  const sets = agaPlans.length
    ? await prisma.responseSet.findMany({
        where: { workPlanId: { in: agaPlans.map((p) => p.id) }, answers: { some: {} } },
        select: { workPlanId: true, createdAt: true },
      })
    : [];

  const out = new Map<string, ModuleReadiness>();
  airports.forEach((ap, i) => {
    const r: ModuleReadiness = {};
    const ed = editions.get(ap.code);

    const a = asq[i];
    r["asq-avance"] = !a
      ? { state: "off", text: "Sin datos de la temporada" }
      : a.afterMonthEnd
        ? { state: "warn", text: `Avance al ${fmtDay(a.asOf)} (sin foto del mes)` }
        : { state: "ok", text: `${fmt(a.collected)} de ${fmt(a.target)} · ${a.pct}%` };

    const name = canonical(ap.code);
    if (!name) r.tiempos = { state: "na", text: "Sin mediciones para este aeropuerto" };
    else if (tiempos === null) r.tiempos = { state: "warn", text: "BigQuery no disponible" };
    else {
      const t = tiempos.find((x) => x.airport === name);
      if (!t || t.window === 0) r.tiempos = { state: "off", text: "Sin mediciones en la temporada" };
      else if (t.month === 0) r.tiempos = { state: "warn", text: `0 este mes · ${fmt(t.window)} en la temporada` };
      else r.tiempos = { state: "ok", text: `${fmt(t.month)} este mes · ${fmt(t.window)} en la temporada` };
    }

    for (const key of ["aga-pasajeros", "aga-acompanantes"] as const) {
      const audience = moduleDef(key)!.survey!.audience;
      const mine = agaPlans.filter((p) => p.companyId === ap.companyId && audienceOf(p.questionnaire.title) === audience);
      if (mine.length === 0) {
        r[key] = { state: "na", text: "Sin plan vigente" };
        continue;
      }
      const ids = new Set(mine.map((p) => p.id));
      let inMonth = 0;
      let toDate = 0;
      for (const s of sets) {
        if (!s.workPlanId || !ids.has(s.workPlanId)) continue;
        const ym = ymOf(s.createdAt);
        if (ym > month) continue;
        toDate++;
        if (ym === month) inMonth++;
      }
      const target = mine.reduce((acc, p) => acc + p.totalTarget, 0);
      r[key] = {
        state: inMonth > 0 ? "ok" : "warn",
        text: `${fmt(inMonth)} este mes · ${fmt(toDate)}${target > 0 ? ` de ${fmt(target)}` : ""}`,
      };
    }

    const nPhotos = photos.find((p) => p.airport === ap.code)?._count ?? 0;
    const hasComment = !!ed?.comentarios.trim();
    r["fotos-comentarios"] =
      nPhotos === 0 && !hasComment
        ? { state: "off", text: "Sin fotos ni comentario" }
        : {
            state: "ok",
            text: [nPhotos > 0 ? `${nPhotos} foto${nPhotos === 1 ? "" : "s"}` : null, hasComment ? "con comentario" : null]
              .filter(Boolean)
              .join(" · "),
          };

    r.analisis = ed?.notes.analisis ? { state: "ok", text: "Redactado" } : { state: "off", text: "Sin redactar" };

    out.set(ap.code, r);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Semestral / anual
// ---------------------------------------------------------------------------

/** Encuestas ACI ASQ (microdata) por aeropuerto y temporada ("SU26"). null si BigQuery falla. */
async function countAsqMicrodata(codes: string[], quarters: string[]): Promise<Map<string, number> | null> {
  try {
    const rows = await bqQuery<Record<string, unknown>>(
      `SELECT Airport AS airport, Quarter AS quarter, COUNT(*) AS n FROM \`${asqTableRef()}\`
       WHERE Airport IN UNNEST(@codes) AND Quarter IN UNNEST(@quarters) GROUP BY airport, quarter`,
      { codes, quarters }
    );
    const out = new Map<string, number>();
    for (const r of rows) out.set(`${r.airport}|${r.quarter}`, Number((r.n as { value?: unknown })?.value ?? r.n) || 0);
    return out;
  } catch {
    return null;
  }
}

const chileDayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export type SeasonOverview = {
  airports: ReportAirportListItem[];
  editions: Map<string, EditionState>;
  readiness: Map<string, ModuleReadiness>;
};

/**
 * Aeropuertos y estado por módulo de un informe semestral o anual. Parte de todos los
 * aeropuertos asociados a una empresa (Encuestas ASQ) y deja los que tienen datos válidos
 * en la ventana en alguna fuente, sin mirar planes de trabajo:
 *  - ACI ASQ: microdata de la temporada (Ingesta ASQ).
 *  - Tiempos: antes del 1-oct-2026 solo el histórico de Sheets; desde ahí, solo la web.
 *  - AGA: antes del corte solo el histórico importado de Sheets; desde ahí, solo la web.
 */
export async function seasonOverview(ctx: PeriodContext): Promise<SeasonOverview> {
  const start = new Date(`${ctx.window.from}T00:00:00Z`);
  const end = new Date(`${ctx.window.to}T23:59:59Z`);
  const candidates = await listMappedAirports(start, end);
  const codes = candidates.map((a) => a.code);
  const quarters = ctx.kind === "ANUAL" ? seasonsOfAsqYear(Number(ctx.key)).map((s) => s.code) : [ctx.season.code];

  const canonical = (code: string): string | null => AIRPORTS.find((a) => a.code === code)?.name ?? null;
  const bqAirports = codes.map(canonical).filter((n): n is string => !!n);

  const [asq, tiempos, plans, runs] = await Promise.all([
    codes.length ? countAsqMicrodata(codes, quarters) : Promise.resolve(new Map<string, number>()),
    bqAirports.length
      ? countTiemposByAirport({ airports: bqAirports, desde: ctx.window.from, hasta: ctx.window.to, month: "" }).catch(
          () => null
        )
      : Promise.resolve([]),
    // Planes AGA de cualquier estado y época (incluido el del histórico importado):
    // dicen si el aeropuerto aplica al módulo y agrupan sus respuestas.
    prisma.workPlan.findMany({
      where: { companyId: { in: candidates.map((a) => a.companyId) } },
      select: { id: true, companyId: true, questionnaire: { select: { title: true } } },
    }),
    prisma.asqComplianceRun.findMany({
      where: { airport: { in: codes }, season: ctx.season.type, year: ctx.season.year },
      select: { airport: true, rows: { select: { target: true, collected: true } } },
    }),
  ]);
  const aga = plans.filter((p) => isAgaQuestionnaire(p.questionnaire.title));
  const sets = aga.length
    ? await prisma.responseSet.findMany({
        where: {
          workPlanId: { in: aga.map((p) => p.id) },
          answers: { some: {} },
          createdAt: { gte: new Date(start.getTime() - 86400000), lte: new Date(end.getTime() + 86400000) },
        },
        select: { workPlanId: true, createdAt: true, source: true },
      })
    : [];
  const valid = sets.filter((s) => {
    const day = chileDayOf(s.createdAt);
    return day >= ctx.window.from && day <= ctx.window.to && isValidAgaSource(day, s.source, REPORT_SOURCE_CUTOFF);
  });

  const readiness = new Map<string, ModuleReadiness>();
  const airports: ReportAirportListItem[] = [];
  // En el anual los conteos son del año ASQ completo (las dos temporadas).
  const inYear = ctx.kind === "ANUAL" ? " en el año" : "";

  for (const ap of candidates) {
    const r: ModuleReadiness = {};
    let hasData = false;

    // ACI ASQ · Resultados: microdata de la temporada de detalle (en el anual, ambas).
    if (asq === null) r["asq-resultados"] = { state: "warn", text: "BigQuery no disponible" };
    else {
      const parts = quarters.map((q) => ({ q, n: asq.get(`${ap.code}|${q}`) ?? 0 }));
      const focus = parts.find((x) => x.q === ctx.season.code)!;
      if (parts.some((x) => x.n > 0)) hasData = true;
      r["asq-resultados"] =
        focus.n === 0
          ? { state: "bad", text: `${ctx.season.code} sin cargar en Ingesta ASQ` }
          : { state: "ok", text: parts.filter((x) => x.n > 0).map((x) => `${x.q}: ${fmt(x.n)} encuestas`).join(" · ") };
    }

    // ACI ASQ · Avance: cumplimiento del levantamiento de la temporada.
    const run = runs.find((x) => x.airport === ap.code);
    if (run) {
      const target = run.rows.reduce((a, b) => a + b.target, 0);
      const collected = run.rows.reduce((a, b) => a + b.collected, 0);
      const pctDone = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
      r["asq-avance"] = { state: "ok", text: `${fmt(collected)} de ${fmt(target)} · ${pctDone}%` };
    } else r["asq-avance"] = { state: "off", text: "Sin avance registrado" };

    // Mediciones de tiempos (el corte de fuente lo aplica la consulta).
    const name = canonical(ap.code);
    if (!name) r.tiempos = { state: "na", text: "Sin mediciones para este aeropuerto" };
    else if (tiempos === null) r.tiempos = { state: "warn", text: "BigQuery no disponible" };
    else {
      const n = tiempos.find((x) => x.airport === name)?.window ?? 0;
      if (n > 0) hasData = true;
      r.tiempos =
        n === 0
          ? { state: "off", text: "Sin mediciones en la temporada" }
          : ctx.window.to < REPORT_SOURCE_CUTOFF
            ? { state: "ok", text: `${fmt(n)} mediciones${inYear} · solo tiempo de fila` }
            : { state: "ok", text: `${fmt(n)} mediciones${inYear}` };
    }

    // Encuestas AGA.
    for (const key of ["aga-pasajeros", "aga-acompanantes"] as const) {
      const audience = moduleDef(key)!.survey!.audience;
      const mine = aga.filter((p) => p.companyId === ap.companyId && audienceOf(p.questionnaire.title) === audience);
      if (mine.length === 0) {
        r[key] = { state: "na", text: "Sin encuesta AGA" };
        continue;
      }
      const ids = new Set(mine.map((p) => p.id));
      const n = valid.filter((s) => s.workPlanId && ids.has(s.workPlanId)).length;
      if (n > 0) hasData = true;
      r[key] =
        n > 0
          ? { state: "ok", text: `${fmt(n)} encuestas${inYear}` }
          : ctx.window.from < REPORT_SOURCE_CUTOFF
            ? { state: "bad", text: "Sin histórico importado de Sheets" }
            : { state: "off", text: "Sin encuestas en la temporada" };
    }

    if (hasData) {
      airports.push(ap);
      readiness.set(ap.code, r);
    }
  }

  const editions = await loadEditions(
    airports.map((a) => a.code),
    ctx.kind,
    ctx.key
  );
  for (const ap of airports) {
    const r = readiness.get(ap.code)!;
    r.analisis = editions.get(ap.code)?.notes.analisis
      ? { state: "ok", text: "Redactado" }
      : { state: "off", text: "Sin redactar" };
    r["fotos-comentarios"] = { state: "off", text: "Opcional" };
  }
  return { airports, editions, readiness };
}
