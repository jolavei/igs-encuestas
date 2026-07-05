import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlanProgress } from "@/lib/planProgress";

export default async function AdminLevantarPage() {
  const plans = await prisma.workPlan.findMany({
    where: { status: "ACTIVE" },
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

      {plans.length === 0 && <p className="text-slate-400">No hay planes activos.</p>}

      <div className="space-y-3">
        {plans.map((p, i) => (
          <Link
            key={p.id}
            href={`/admin/levantar/${p.id}`}
            className="card block hover:border-brand-300"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{p.questionnaire.title}</h3>
                <p className="text-sm text-slate-500">
                  {p.company.name}
                  {p.location && ` · ${p.location.name}`}
                </p>
              </div>
              <div className="text-right text-sm text-slate-500">
                {progress[i].done} / {p.totalTarget || "∞"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
