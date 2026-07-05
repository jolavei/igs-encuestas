import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { getPlanProgress } from "@/lib/planProgress";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium" }).format(d);
}

export default async function EncuestadorHome() {
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
      <h1 className="text-2xl font-bold">Mi plan de trabajo</h1>

      {plans.length === 0 && <p className="text-slate-500">No tienes planes activos.</p>}

      <div className="space-y-3">
        {plans.map((p, i) => {
          const prog = progress[i];
          const pending = p.totalTarget > 0 ? Math.max(0, p.totalTarget - prog.done) : null;
          return (
            <div key={p.id} className="card space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{p.questionnaire.title}</h3>
                  <p className="text-sm text-slate-500">
                    {p.company.name}
                    {p.location && ` · ${p.location.name}`} · hasta {fmtDate(p.windowEnd)}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">
                    {prog.done}
                    {p.totalTarget > 0 && ` / ${p.totalTarget}`}
                  </div>
                  {pending !== null && <div className="text-slate-500">{pending} pendientes</div>}
                </div>
              </div>

              {prog.segments.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {prog.segments.map((s) => (
                    <span
                      key={s.value}
                      className={`rounded px-2 py-0.5 ${
                        s.done >= s.target
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

              <Link href={`/encuestador/levantar/${p.id}`} className="btn">
                Levantar encuesta
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
