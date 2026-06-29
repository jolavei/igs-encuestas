import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/questionTypes";
import QuestionnaireBuilder from "@/components/QuestionnaireBuilder";
import QrManager from "@/components/QrManager";
import DataformPanel from "@/components/DataformPanel";
import QuestionnaireCompanies from "@/components/QuestionnaireCompanies";

export default async function QuestionnaireDetail({
  params,
}: {
  params: { id: string };
}) {
  const [q, allCompanies] = await Promise.all([
    prisma.questionnaire.findUnique({
      where: { id: params.id },
      include: {
        companies: { include: { locations: true }, orderBy: { name: "asc" } },
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            questions: { orderBy: { order: "asc" } },
            _count: { select: { responses: true } },
          },
        },
        qrTokens: {
          include: { location: { include: { company: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.company.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!q) notFound();

  const nextVersion = (q.versions[0]?.versionNumber ?? 0) + 1;

  // Sedes de todas las empresas asignadas, etiquetadas con la empresa.
  const qrLocations = q.companies.flatMap((c) =>
    c.locations.map((l) => ({ id: l.id, name: `${c.name} · ${l.name}` }))
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/cuestionarios" className="text-sm text-brand-600">
          ← Cuestionarios
        </Link>
        <h1 className="text-2xl font-bold">{q.title}</h1>
        <p className="flex flex-wrap gap-1 text-slate-500">
          {q.companies.length === 0 ? (
            <span className="text-amber-600">Sin empresas asignadas</span>
          ) : (
            q.companies.map((c) => (
              <span key={c.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {c.name}
              </span>
            ))
          )}
        </p>
      </div>

      <QuestionnaireCompanies
        questionnaireId={q.id}
        companies={allCompanies.map((c) => ({ id: c.id, name: c.name }))}
        assigned={q.companies.map((c) => c.id)}
      />

      <QuestionnaireBuilder questionnaireId={q.id} nextVersion={nextVersion} />

      <div className="space-y-3">
        <h2 className="font-semibold">Versiones</h2>
        {q.versions.map((v) => (
          <div key={v.id} className="card">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                v{v.versionNumber}{" "}
                <span
                  className={`ml-2 rounded px-2 py-0.5 text-xs ${
                    v.status === "ACTIVE"
                      ? "bg-green-100 text-green-700"
                      : v.status === "DRAFT"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {v.status}
                </span>
              </h3>
              <span className="text-sm text-slate-500">
                {v.questions.length} preguntas · {v._count.responses} respuestas
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {v.questions.map((qq) => (
                <li key={qq.id}>
                  {qq.order}. {qq.text}{" "}
                  <span className="text-slate-400">
                    ({QUESTION_TYPE_LABELS[qq.type as QuestionType]})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <QrManager
        questionnaireId={q.id}
        locations={qrLocations}
        tokens={q.qrTokens.map((t) => ({
          id: t.id,
          token: t.token,
          locationName: `${t.location.company.name} · ${t.location.name}`,
          active: t.active,
        }))}
      />

      <DataformPanel questionnaireId={q.id} />
    </div>
  );
}
