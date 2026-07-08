import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { computeNps, computeCsat } from "@/lib/metrics";
import { fromJson } from "@/lib/enums";
import type { QuestionConfig } from "@/lib/questionTypes";
import { getPlanProgress } from "@/lib/planProgress";
import { PlanAvanceCard } from "@/components/planCards";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "medium",
  }).format(d);
}

async function locationMetrics(locationId: string) {
  const [nps, rating, total] = await Promise.all([
    prisma.answer.findMany({
      where: {
        valueNumber: { not: null },
        question: { type: "NPS" }, // solo datos históricos
        responseSet: { locationId },
      },
      select: { valueNumber: true },
    }),
    prisma.answer.findMany({
      where: {
        valueNumber: { not: null },
        // CSAT desde "Calificación" (RATING, estrellas) + Likert histórico.
        question: { type: { in: ["RATING", "LIKERT"] } },
        responseSet: { locationId },
      },
      select: { valueNumber: true, question: { select: { config: true } } },
    }),
    prisma.responseSet.count({ where: { locationId } }),
  ]);

  const npsRes = computeNps(nps.map((a) => a.valueNumber!));
  // CSAT top-box: usa el tope de cada pregunta (maxStars para RATING, max para Likert).
  const max = Math.max(
    5,
    ...rating.map((a) => {
      const c = fromJson<QuestionConfig>(a.question.config);
      return c?.maxStars ?? c?.max ?? 5;
    })
  );
  const csatRes = computeCsat(rating.map((a) => a.valueNumber!), max);
  return { nps: npsRes.nps, csat: csatRes.csat, total };
}

export default async function ClienteHome() {
  const user = await getSessionUser();

  if (!user!.companyId) {
    return (
      <div className="card">
        <h1 className="text-xl font-bold">Dashboard de cliente</h1>
        <p className="mt-2 text-slate-600">
          Tu usuario no está vinculado a una empresa. Pide a un administrador que asocie
          tu cuenta a una empresa para ver sus resultados.
        </p>
      </div>
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: user!.companyId },
    include: { locations: true },
  });

  const rows = await Promise.all(
    (company?.locations ?? []).map(async (l) => ({
      location: l,
      ...(await locationMetrics(l.id)),
    }))
  );

  // Planes vigentes (hoy dentro de la ventana) de la empresa. Si el usuario
  // está acotado a una sede, solo esa sede + planes sin sede fija.
  const now = new Date();
  const planWhere: {
    companyId: string;
    windowStart: { lte: Date };
    windowEnd: { gte: Date };
    OR?: { locationId: string | null }[];
  } = {
    companyId: user!.companyId,
    windowStart: { lte: now },
    windowEnd: { gte: now },
  };
  if (user!.locationId) {
    planWhere.OR = [{ locationId: user!.locationId }, { locationId: null }];
  }
  const plans = await prisma.workPlan.findMany({
    where: planWhere,
    include: { questionnaire: true, location: true, segments: true },
    orderBy: { windowEnd: "asc" },
  });
  const planProg = await Promise.all(
    plans.map((p) =>
      getPlanProgress(p.id, { totalTarget: p.totalTarget, segments: p.segments })
    )
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{company?.name}</h1>

      <section className="space-y-3">
        <h2 className="font-semibold">Avance de planes vigentes</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-slate-400">
            No hay planes de trabajo vigentes en este momento.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p, i) => (
              <PlanAvanceCard
                key={p.id}
                title={p.questionnaire.title}
                subtitle={`${p.location ? p.location.name : "Todas las sedes"} · vence ${fmtDate(p.windowEnd)}`}
                done={planProg[i].done}
                total={planProg[i].total}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-slate-500">Resultados por sede</p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Sede</th>
              <th className="px-4 py-2">Respuestas</th>
              <th className="px-4 py-2">NPS</th>
              <th className="px-4 py-2">CSAT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.location.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{r.location.name}</td>
                <td className="px-4 py-2">{r.total}</td>
                <td className="px-4 py-2">{r.nps ?? "—"}</td>
                <td className="px-4 py-2">{r.csat != null ? `${r.csat}%` : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={4}>
                  Sin sedes registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
