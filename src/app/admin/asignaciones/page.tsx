import { prisma } from "@/lib/prisma";
import PostForm from "@/components/PostForm";
import Fab from "@/components/Fab";

export default async function AsignacionesPage() {
  const [surveyors, questionnaires, locations, assignments] = await Promise.all([
    prisma.user.findMany({ where: { role: "SURVEYOR" }, orderBy: { email: "asc" } }),
    prisma.questionnaire.findMany({
      where: { companies: { some: { active: true } } },
      include: { companies: { select: { name: true } } },
      orderBy: { title: "asc" },
    }),
    prisma.location.findMany({
      where: { company: { active: true } },
      include: { company: true },
      orderBy: { name: "asc" },
    }),
    prisma.assignment.findMany({
      include: {
        surveyor: true,
        questionnaire: true,
        location: true,
        _count: { select: { responses: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-2xl font-bold">Asignaciones / Plan de trabajo</h1>

      <div className="space-y-3">
        {assignments.map((a) => {
          const done = a._count.responses;
          const pct = a.quota > 0 ? Math.min(100, Math.round((done / a.quota) * 100)) : 0;
          return (
            <div key={a.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{a.questionnaire.title}</h3>
                  <p className="text-sm text-slate-500">
                    {a.surveyor.email}
                    {a.location && ` · ${a.location.name}`}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">
                    {done} / {a.quota || "∞"}
                  </div>
                  <div className="text-slate-500">{a.status}</div>
                </div>
              </div>
              {a.quota > 0 && (
                <div className="mt-2 h-2 w-full rounded bg-slate-100">
                  <div className="h-2 rounded bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              )}
              {a.workPlanComment && (
                <p className="mt-2 text-sm text-slate-600">📋 {a.workPlanComment}</p>
              )}
            </div>
          );
        })}
        {assignments.length === 0 && (
          <p className="text-slate-400">
            Aún no hay asignaciones. Usa el botón + para crear una.
          </p>
        )}
      </div>

      <Fab title="Nueva asignación">
        {surveyors.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay encuestadores aún. Pídeles iniciar sesión una vez (o agrégalos en
            Usuarios y roles); aparecerán con rol SURVEYOR.
          </p>
        ) : (
          <PostForm
            endpoint="/api/assignments"
            submitLabel="Asignar"
            fields={[
              {
                name: "surveyorId",
                label: "Encuestador",
                type: "select",
                required: true,
                options: surveyors.map((s) => ({ value: s.id, label: s.email })),
              },
              {
                name: "questionnaireId",
                label: "Cuestionario",
                type: "select",
                required: true,
                options: questionnaires.map((q) => ({
                  value: q.id,
                  label: `${q.title}${
                    q.companies.length ? ` (${q.companies.map((c) => c.name).join(", ")})` : ""
                  }`,
                })),
              },
              {
                name: "locationId",
                label: "Sede",
                type: "select",
                options: locations.map((l) => ({
                  value: l.id,
                  label: `${l.name} (${l.company.name})`,
                })),
              },
              { name: "quota", label: "Cuota (cantidad de encuestas)", type: "number" },
              {
                name: "workPlanComment",
                label: "Comentario del plan de trabajo",
                type: "textarea",
                placeholder: "Ej: completar 50 encuestas a pasajeros business…",
              },
            ]}
          />
        )}
      </Fab>
    </div>
  );
}
