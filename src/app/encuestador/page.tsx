import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { getUserScope } from "@/lib/userScope";
import { getPlanProgress } from "@/lib/planProgress";
import { PlanAvanceCard } from "@/components/planCards";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium" }).format(d);
}

export default async function EncuestadorHome() {
  const user = await getSessionUser();
  const firstName = user?.name?.split(" ")[0] ?? user?.email ?? "";

  const [scope, plans] = await Promise.all([
    getUserScope(user!.id),
    prisma.workPlan.findMany({
      where: { status: "ACTIVE", surveyors: { some: { id: user!.id } } },
      include: { company: true, questionnaire: true, location: true, segments: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const progress = await Promise.all(
    plans.map((p) => getPlanProgress(p.id, { totalTarget: p.totalTarget, segments: p.segments }))
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">¡Bienvenido {firstName}! 👋</h1>

      {/* Empresas y sedes asignadas */}
      <section className="space-y-3">
        <h2 className="font-semibold">Tus empresas y sedes</h2>
        {scope.locations.length === 0 ? (
          <p className="text-sm text-slate-400">
            Aún no tienes sedes asignadas. Un administrador puede asignártelas en Usuarios.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {scope.locations.map((l) => (
              <span
                key={l.id}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                {l.company.name} · {l.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Planes de trabajo activos con avance */}
      <section className="space-y-3">
        <h2 className="font-semibold">Tus planes de trabajo</h2>
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

      {plans.length > 0 && (
        <Link href="/encuestador/levantar" className="btn inline-block">
          Ir a levantar encuesta
        </Link>
      )}
    </div>
  );
}
