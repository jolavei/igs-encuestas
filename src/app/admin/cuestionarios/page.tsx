import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewQuestionnaireForm from "@/components/NewQuestionnaireForm";
import QuestionnaireActions from "@/components/QuestionnaireActions";
import Fab from "@/components/Fab";

export default async function CuestionariosPage() {
  const questionnaires = await prisma.questionnaire.findMany({
    include: {
      // Empresas derivadas de los planes de trabajo (ya no hay asignación manual).
      workPlans: { select: { company: { select: { id: true, name: true } } } },
      versions: { orderBy: { versionNumber: "desc" } },
      _count: { select: { versions: true } },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });

  const vigentes = questionnaires.filter((q) => q.active);
  const noVigentes = questionnaires.filter((q) => !q.active);

  // Tarjeta de cuestionario (misma pieza para vigentes y no vigentes).
  function questionnaireCard(q: (typeof questionnaires)[number]) {
    const active = q.versions.find((v) => v.status === "ACTIVE");
    const companies = Array.from(
      new Map(q.workPlans.map((wp) => [wp.company.id, wp.company])).values()
    );
    return (
      <div key={q.id} className={`card ${!q.active ? "bg-slate-50 opacity-75" : ""}`}>
        <div className="flex items-start justify-between gap-4">
          <Link
            href={`/admin/cuestionarios/${q.id}`}
            className="group min-w-0 flex-1"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold group-hover:text-brand-700">{q.title}</h3>
              {!q.active && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  No vigente
                </span>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap gap-1 text-sm text-slate-500">
              {companies.length === 0 ? (
                <span className="text-slate-400">Sin planes de trabajo aún</span>
              ) : (
                companies.map((c) => (
                  <span
                    key={c.id}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                  >
                    {c.name}
                  </span>
                ))
              )}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {q._count.versions} versión(es) ·{" "}
              {active ? `Activa: v${active.versionNumber}` : "Sin versión activa"}
            </p>
          </Link>
          <QuestionnaireActions id={q.id} active={q.active} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      <h1 className="text-2xl font-bold">Cuestionarios</h1>

      {questionnaires.length === 0 ? (
        <p className="text-slate-400">
          Aún no hay cuestionarios. Usa el botón + para crear el primero.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Vigentes
            </h2>
            {vigentes.length === 0 ? (
              <p className="text-sm text-slate-400">Sin cuestionarios vigentes.</p>
            ) : (
              <div className="space-y-3">{vigentes.map(questionnaireCard)}</div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              No vigentes
            </h2>
            {noVigentes.length === 0 ? (
              <p className="text-sm text-slate-400">Sin cuestionarios no vigentes.</p>
            ) : (
              <div className="space-y-3">{noVigentes.map(questionnaireCard)}</div>
            )}
          </section>
        </>
      )}

      <Fab title="Nuevo cuestionario">
        <NewQuestionnaireForm />
      </Fab>
    </div>
  );
}
