import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { getUserScope } from "@/lib/userScope";
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
        question: { type: "NPS" },
        responseSet: { locationId },
      },
      select: { valueNumber: true },
    }),
    prisma.answer.findMany({
      where: {
        valueNumber: { not: null },
        question: { type: { in: ["RATING", "LIKERT"] } },
        responseSet: { locationId },
      },
      select: { valueNumber: true, question: { select: { config: true } } },
    }),
    prisma.responseSet.count({ where: { locationId } }),
  ]);

  const npsRes = computeNps(nps.map((a) => a.valueNumber!));
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
  const firstName = user?.name?.split(" ")[0] ?? user?.email ?? "";
  const scope = await getUserScope(user!.id);

  if (scope.locations.length === 0) {
    return (
      <div className="card">
        <h1 className="text-xl font-bold">¡Bienvenido {firstName}! 👋</h1>
        <p className="mt-2 text-slate-600">
          Tu usuario aún no está vinculado a ninguna sede. Pide a un administrador que asocie
          tu cuenta a una o más sedes para ver sus resultados.
        </p>
      </div>
    );
  }

  const rows = await Promise.all(
    scope.locations.map(async (l) => ({ location: l, ...(await locationMetrics(l.id)) }))
  );

  // Planes vigentes de sus sedes (incluye planes sin sede fija de sus empresas).
  const now = new Date();
  const plans = await prisma.workPlan.findMany({
    where: {
      status: "ACTIVE",
      windowStart: { lte: now },
      windowEnd: { gte: now },
      OR: [
        { locationId: { in: scope.locationIds } },
        { locationId: null, companyId: { in: scope.companyIds } },
      ],
    },
    include: { questionnaire: true, location: true, company: true, segments: true },
    orderBy: { windowEnd: "asc" },
  });
  const planProg = await Promise.all(
    plans.map((p) => getPlanProgress(p.id, { totalTarget: p.totalTarget, segments: p.segments }))
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">¡Bienvenido {firstName}! 👋</h1>

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
                subtitle={`${p.company.name}${
                  p.location ? ` · ${p.location.name}` : " · Todas las sedes"
                } · vence ${fmtDate(p.windowEnd)}`}
                done={planProg[i].done}
                total={planProg[i].total}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Resultados por sede</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Empresa · Sede</th>
                <th className="px-4 py-2 text-right">Respuestas</th>
                <th className="px-4 py-2 text-right">NPS</th>
                <th className="px-4 py-2 text-right">CSAT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.location.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">
                    {r.location.company.name} · {r.location.name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.total}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.nps ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.csat != null ? `${r.csat}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
