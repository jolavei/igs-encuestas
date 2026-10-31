// Estado de datos de cada módulo, para las tarjetas de la página de Informes: dice
// antes de abrir el informe qué va a salir con datos, qué va a salir vacío y por qué.
//
// Server-only. Consultas livianas (conteos), no el informe completo.

import { prisma } from "@/lib/prisma";
import { AIRPORTS } from "@/lib/dashboardTiempos";
import { audienceOf, isAgaQuestionnaire, ymOf } from "@/lib/reports/agaSurvey";
import { countTiemposByAirport } from "@/lib/reports/tiemposQuery";
import { fmtDay, loadAsqProgress, monthBounds, type ReportAirportListItem } from "@/lib/reports/monthlyReport";
import { moduleDef, type ModuleKey } from "@/lib/reports/modules";
import type { EditionState } from "@/lib/reports/editions";
import type { PeriodContext } from "@/lib/reports/period";

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
