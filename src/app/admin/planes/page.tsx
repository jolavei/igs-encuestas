import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { fromJson } from "@/lib/enums";
import type { QuestionConfig } from "@/lib/questionTypes";
import { getPlanProgress } from "@/lib/planProgress";
import Fab from "@/components/Fab";
import NewWorkPlanForm from "@/components/NewWorkPlanForm";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium" }).format(d);
}

function Bar({ done, target, label }: { done: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const reached = target > 0 && done >= target;
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className={reached ? "font-medium text-green-600" : "text-slate-500"}>
          {done} / {target || "∞"} {reached && "✓"}
        </span>
      </div>
      <div className="h-2 w-full rounded bg-slate-100">
        <div
          className={`h-2 rounded ${reached ? "bg-green-500" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Estado({ done, target }: { done: number; target: number }) {
  if (target > 0 && done >= target) return <span className="font-medium text-green-600">✓</span>;
  return <span className="text-slate-400">faltan {Math.max(0, target - done)}</span>;
}

export default async function PlanesPage() {
  const [companies, questionnairesRaw, surveyors, plans] = await Promise.all([
    prisma.company.findMany({
      where: { active: true },
      include: { locations: true },
      orderBy: { name: "asc" },
    }),
    prisma.questionnaire.findMany({
      include: {
        companies: { select: { id: true } },
        versions: {
          where: { status: "ACTIVE" },
          include: { questions: { orderBy: { order: "asc" } } },
        },
      },
      orderBy: { title: "asc" },
    }),
    prisma.user.findMany({ where: { role: "SURVEYOR", active: true }, orderBy: { email: "asc" } }),
    prisma.workPlan.findMany({
      include: {
        company: true,
        questionnaire: true,
        location: true,
        segments: true,
        surveyors: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Solo cuestionarios con versión activa; extraer preguntas-segmento (selección única + equivalenceKey).
  const questionnaires = questionnairesRaw
    .filter((q) => q.versions.length > 0)
    .map((q) => ({
      id: q.id,
      title: q.title,
      companyIds: q.companies.map((c) => c.id),
      segmentQuestions: q.versions[0].questions
        .filter((qq) => qq.type === "SINGLE_CHOICE" && qq.equivalenceKey)
        .map((qq) => ({
          equivalenceKey: qq.equivalenceKey as string,
          text: qq.text,
          options: fromJson<QuestionConfig>(qq.config)?.options ?? [],
        })),
    }));

  const progress = await Promise.all(
    plans.map((p) => getPlanProgress(p.id, { totalTarget: p.totalTarget, segments: p.segments }))
  );

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-2xl font-bold">Planes de trabajo</h1>

      <div className="space-y-4">
        {plans.map((p, i) => {
          const prog = progress[i];
          return (
            <div key={p.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{p.questionnaire.title}</h3>
                  <p className="text-sm text-slate-500">
                    {p.company.name}
                    {p.location && ` · ${p.location.name}`} · {fmtDate(p.windowStart)} –{" "}
                    {fmtDate(p.windowEnd)}
                  </p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {p.surveyors.length} encuestador(es)
                </span>
              </div>

              <Bar done={prog.done} target={prog.total} label="Total" />

              {prog.levels.length > 0 && (
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">
                          {p.segmentLabel || "Segmento"}
                          {p.segment2Label && ` / ${p.segment2Label}`}
                        </th>
                        <th className="px-3 py-2 text-right">Realizadas</th>
                        <th className="px-3 py-2 text-right">Meta</th>
                        <th className="px-3 py-2 text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prog.levels.map((l1) => (
                        <Fragment key={l1.value}>
                          <tr className="border-t border-slate-200 bg-slate-50/60 font-medium">
                            <td className="px-3 py-2">{l1.label}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l1.done}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l1.target}</td>
                            <td className="px-3 py-2 text-right">
                              <Estado done={l1.done} target={l1.target} />
                            </td>
                          </tr>
                          {l1.children.map((c) => (
                            <tr key={c.value} className="border-t border-slate-100 text-slate-600">
                              <td className="px-3 py-2 pl-7">↳ {c.label}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{c.done}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{c.target}</td>
                              <td className="px-3 py-2 text-right">
                                <Estado done={c.done} target={c.target} />
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                      {prog.otros > 0 && (
                        <tr className="border-t border-slate-100 text-slate-500">
                          <td className="px-3 py-2 italic">Otros (fuera de segmentos)</td>
                          <td className="px-3 py-2 text-right tabular-nums">{prog.otros}</td>
                          <td className="px-3 py-2 text-right">—</td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {p.comment && <p className="text-sm text-slate-600">📋 {p.comment}</p>}
            </div>
          );
        })}
        {plans.length === 0 && (
          <p className="text-slate-400">Aún no hay planes. Usa el botón + para crear uno.</p>
        )}
      </div>

      <Fab title="Nuevo plan de trabajo">
        <NewWorkPlanForm
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            locations: c.locations.map((l) => ({ id: l.id, name: l.name })),
          }))}
          questionnaires={questionnaires}
          surveyors={surveyors.map((s) => ({ id: s.id, email: s.email }))}
        />
      </Fab>
    </div>
  );
}
