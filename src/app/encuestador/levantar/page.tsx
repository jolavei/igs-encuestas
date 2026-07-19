import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { getPlanProgress } from "@/lib/planProgress";
import { PlanAvanceCard } from "@/components/planCards";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium" }).format(d);
}

export default async function EncuestadorLevantarPage() {
  const user = await getSessionUser();
  const plans = await prisma.workPlan.findMany({
    where: { status: "ACTIVE", surveyors: { some: { id: user!.id } } },
    include: { company: true, questionnaire: true, location: true, segments: true },
    orderBy: { createdAt: "desc" },
  });

  const progress = await Promise.all(
    plans.map((p) => getPlanProgress(p.id, { totalTarget: p.totalTarget, segments: p.segments }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Levantar encuesta</h1>
        <p className="text-slate-500">Elige un plan para registrar una encuesta.</p>
      </div>

      {plans.length === 0 && <p className="text-slate-400">No tienes planes activos.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p, i) => {
          const prog = progress[i];
          return (
            <PlanAvanceCard
              key={p.id}
              title={p.questionnaire.title}
              subtitle={`${p.company.name}${p.location ? ` · ${p.location.name}` : ""} · hasta ${fmtDate(p.windowEnd)}`}
              done={prog.done}
              total={p.totalTarget}
            >
              {prog.levels.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {prog.levels.map((s) => (
                    <span
                      key={s.value}
                      className={`rounded px-2 py-0.5 ${
                        s.target > 0 && s.done >= s.target
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {s.label}: {s.done}/{s.target}
                    </span>
                  ))}
                </div>
              )}

              {p.comment && <p className="text-sm text-slate-600">📋 {p.comment}</p>}

              <div>
                <Link href={`/encuestador/levantar/${p.id}`} className="btn">
                  Levantar encuesta
                </Link>
              </div>
            </PlanAvanceCard>
          );
        })}
      </div>
    </div>
  );
}
