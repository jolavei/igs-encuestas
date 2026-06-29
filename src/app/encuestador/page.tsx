import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";

export default async function EncuestadorHome() {
  const user = await getSessionUser();
  const assignments = await prisma.assignment.findMany({
    where: { surveyorId: user!.id, status: "ACTIVE" },
    include: {
      questionnaire: true,
      location: { include: { company: true } },
      _count: { select: { responses: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mi plan de trabajo</h1>

      {assignments.length === 0 && (
        <p className="text-slate-500">No tienes asignaciones activas.</p>
      )}

      <div className="space-y-3">
        {assignments.map((a) => {
          const done = a._count.responses;
          const pending = a.quota > 0 ? Math.max(0, a.quota - done) : null;
          return (
            <div key={a.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{a.questionnaire.title}</h3>
                  <p className="text-sm text-slate-500">
                    {a.location
                      ? `${a.location.company.name} · ${a.location.name}`
                      : "Sin sede asignada"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">
                    {done}
                    {a.quota > 0 && ` / ${a.quota}`}
                  </div>
                  {pending !== null && (
                    <div className="text-slate-500">{pending} pendientes</div>
                  )}
                </div>
              </div>
              {a.workPlanComment && (
                <p className="mt-2 text-sm text-slate-600">📋 {a.workPlanComment}</p>
              )}
              <Link href={`/encuestador/levantar/${a.id}`} className="btn mt-3">
                Levantar encuesta
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
