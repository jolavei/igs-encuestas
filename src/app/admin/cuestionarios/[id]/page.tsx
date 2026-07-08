import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  QUESTION_TYPE_LABELS,
  type QuestionType,
  type QuestionConfig,
} from "@/lib/questionTypes";
import { fromJson } from "@/lib/enums";
import { type BqType } from "@/lib/dataform";
import QuestionnaireBuilder, {
  type Draft,
  type SectionDraft,
} from "@/components/QuestionnaireBuilder";
import QrManager from "@/components/QrManager";
import DataformPanel from "@/components/DataformPanel";

type VersionQuestion = {
  sectionId: string | null;
  order: number;
  type: string;
  text: string;
  required: boolean;
  config: string | null;
  bqColumnName: string | null;
  bqType: string | null;
  bqDescription: string | null;
};
type VersionSection = { id: string; order: number; title: string; description: string | null; routing: string };

// Reconstruye las secciones (con sus preguntas) para pre-cargar el builder.
function toSections(questions: VersionQuestion[], sections: VersionSection[]): SectionDraft[] {
  const qKeys = new Map<number, string>(questions.map((q) => [q.order, randomUUID()]));
  const sKeys = new Map<number, string>(sections.map((s) => [s.order, randomUUID()]));
  // Convierte un ruteo guardado (order) al key interno de sección.
  const convBack = (r: string) => {
    if (r === "SUBMIT") return "SUBMIT";
    if (r.startsWith("GOTO:")) {
      const k = sKeys.get(parseInt(r.slice(5), 10));
      return k ? `GOTO:${k}` : "NEXT";
    }
    return "NEXT";
  };
  const toDraft = (q: VersionQuestion): Draft => {
    const cfg = fromJson<QuestionConfig>(q.config) ?? {};
    return {
      key: qKeys.get(q.order)!,
      type: q.type as QuestionType,
      text: q.text,
      required: q.required,
      options: cfg.options?.map((o) => ({ label: o.label, goto: o.goto ? convBack(o.goto) : "NEXT" })),
      maxStars: cfg.maxStars,
      maxLength: cfg.maxLength,
      min: cfg.min,
      max: cfg.max,
      afterKey: cfg.afterQuestionOrder ? qKeys.get(cfg.afterQuestionOrder) : undefined,
      bqColumnName: q.bqColumnName ?? undefined,
      bqType: (q.bqType as BqType) ?? undefined,
      bqDescription: q.bqDescription ?? undefined,
    };
  };

  if (sections.length === 0) {
    // Versión antigua: una sola sección con todo, y enviar al final.
    return [{ key: randomUUID(), title: "", routing: "SUBMIT", questions: questions.map(toDraft) }];
  }

  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      key: sKeys.get(s.order)!,
      title: s.title,
      description: s.description ?? undefined,
      routing: convBack(s.routing),
      questions: questions.filter((q) => q.sectionId === s.id).map(toDraft),
    }));
}

export default async function QuestionnaireDetail({ params }: { params: { id: string } }) {
  const q = await prisma.questionnaire.findUnique({
    where: { id: params.id },
    include: {
      workPlans: { include: { company: { include: { locations: true } } } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          questions: { orderBy: { order: "asc" } },
          sections: { orderBy: { order: "asc" } },
          _count: { select: { responses: true } },
        },
      },
      qrTokens: {
        include: { location: { include: { company: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!q) notFound();

  const nextVersion = (q.versions[0]?.versionNumber ?? 0) + 1;
  const initialSections = q.versions[0]
    ? toSections(q.versions[0].questions, q.versions[0].sections)
    : [];

  const companies = Array.from(
    new Map(q.workPlans.map((wp) => [wp.company.id, wp.company])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const qrLocations = companies.flatMap((c) =>
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
          {companies.length === 0 ? (
            <span className="text-slate-400">
              Sin empresas todavía (se asignan al crear un plan de trabajo).
            </span>
          ) : (
            companies.map((c) => (
              <span key={c.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {c.name}
              </span>
            ))
          )}
        </p>
      </div>

      <QuestionnaireBuilder
        questionnaireId={q.id}
        nextVersion={nextVersion}
        initialSections={initialSections}
      />

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
                {v.questions.length} preguntas · {v.sections.length} sección(es) ·{" "}
                {v._count.responses} respuestas
              </span>
            </div>
            {v.note && (
              <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-sm text-slate-600">📝 {v.note}</p>
            )}
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {v.questions.map((qq) => (
                <li key={qq.id}>
                  {qq.order}. {qq.text}{" "}
                  <span className="text-slate-400">
                    ({QUESTION_TYPE_LABELS[qq.type as QuestionType] ?? qq.type})
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
