import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewQuestionnaireForm from "@/components/NewQuestionnaireForm";
import Fab from "@/components/Fab";

export default async function CuestionariosPage() {
  const [companies, questionnaires] = await Promise.all([
    prisma.company.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.questionnaire.findMany({
      include: {
        companies: { select: { id: true, name: true } },
        versions: { orderBy: { versionNumber: "desc" } },
        _count: { select: { versions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-2xl font-bold">Cuestionarios</h1>

      <div className="space-y-3">
        {questionnaires.map((q) => {
          const active = q.versions.find((v) => v.status === "ACTIVE");
          return (
            <Link
              key={q.id}
              href={`/admin/cuestionarios/${q.id}`}
              className="card block hover:border-brand-300"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold">{q.title}</h3>
                  <p className="mt-0.5 flex flex-wrap gap-1 text-sm text-slate-500">
                    {q.companies.length === 0 ? (
                      <span className="text-amber-600">Sin empresas asignadas</span>
                    ) : (
                      q.companies.map((c) => (
                        <span
                          key={c.id}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                        >
                          {c.name}
                        </span>
                      ))
                    )}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div>{q._count.versions} versión(es)</div>
                  <div className="text-slate-500">
                    {active ? `Activa: v${active.versionNumber}` : "Sin versión activa"}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
        {questionnaires.length === 0 && (
          <p className="text-slate-400">
            Aún no hay cuestionarios. Usa el botón + para crear el primero.
          </p>
        )}
      </div>

      <Fab title="Nuevo cuestionario">
        {companies.length === 0 ? (
          <p className="text-sm text-slate-500">
            Crea primero una empresa en{" "}
            <Link href="/admin/empresas" className="text-brand-600 underline">
              Empresas
            </Link>
            .
          </p>
        ) : (
          <NewQuestionnaireForm companies={companies} />
        )}
      </Fab>
    </div>
  );
}
