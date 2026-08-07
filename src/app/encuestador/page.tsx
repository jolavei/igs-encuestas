import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { getPlanProgress } from "@/lib/planProgress";
import { PlanAvanceCard } from "@/components/planCards";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium" }).format(d);
}

export default async function EncuestadorHome() {
  const user = await getSessionUser();
  const firstName = user?.name?.split(" ")[0] ?? user?.email ?? "";

  const plans = await prisma.workPlan.findMany({
    where: { status: "ACTIVE", surveyors: { some: { id: user!.id } } },
    include: { company: true, questionnaire: true, location: true, segments: true },
    orderBy: { createdAt: "desc" },
  });

  const progress = await Promise.all(
    plans.map((p) => getPlanProgress(p.id, { totalTarget: p.totalTarget, segments: p.segments }))
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">¡Bienvenido {firstName}! 👋</h1>

      {/* Planes de trabajo activos con avance */}
      <section className="space-y-3">
        <h2 className="font-semibold">Mis planes de trabajo</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-slate-400">No tienes planes activos.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p, i) => (
              <PlanAvanceCard
                key={p.id}
                href={`/encuestador/levantar/${p.id}`}
                title={p.questionnaire.title}
                subtitle={`${p.company.name}${p.location ? ` · ${p.location.name}` : ""} · hasta ${fmtDate(p.windowEnd)}`}
                done={progress[i].done}
                total={p.totalTarget}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
