import { prisma } from "@/lib/prisma";
import { buildSegmentQuestions } from "@/lib/planSegments";
import { getPlanProgress } from "@/lib/planProgress";
import { PlanSegmentTable } from "@/components/planCards";
import Fab from "@/components/Fab";
import NewWorkPlanForm from "@/components/NewWorkPlanForm";
import PlanStatusToggle from "@/components/PlanStatusToggle";
import EditPlanButton from "@/components/EditPlanButton";
import { utcToChileDay } from "@/lib/dates";

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
          include: {
            questions: { orderBy: { order: "asc" } },
            sections: { orderBy: { order: "asc" } },
          },
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
        surveyors: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Solo cuestionarios con versión activa; extraer preguntas-segmento (selección única
  // + equivalenceKey), resolviendo el anidamiento por sección (ver buildSegmentQuestions).
  const questionnaires = questionnairesRaw
    .filter((q) => q.versions.length > 0)
    .map((q) => ({
      id: q.id,
      title: q.title,
      companyIds: q.companies.map((c) => c.id),
      segmentQuestions: buildSegmentQuestions(q.versions[0].questions, q.versions[0].sections),
    }));

  // Opciones para el formulario (crear y editar): se calculan una vez y se reusan.
  const companyOptions = companies.map((c) => ({
    id: c.id,
    name: c.name,
    locations: c.locations.map((l) => ({ id: l.id, name: l.name })),
  }));
  const surveyorOptions = surveyors.map((s) => ({ id: s.id, email: s.email }));

  const progress = await Promise.all(
    plans.map((p) => getPlanProgress(p.id, { totalTarget: p.totalTarget, segments: p.segments }))
  );

  // Emparejamos cada plan con su progreso (alineado por índice con `plans`) y separamos en
  // vigentes (ACTIVE) y no vigentes. `plans` ya viene ordenado por createdAt desc, así que
  // dentro de cada grupo se conserva ese orden.
  const paired = plans.map((p, i) => ({ p, prog: progress[i] }));
  const vigentes = paired.filter(({ p }) => p.status === "ACTIVE");
  const noVigentes = paired.filter(({ p }) => p.status !== "ACTIVE");

  // Misma tarjeta para vigentes y no vigentes.
  function planCard({ p, prog }: (typeof paired)[number]) {
    const active = p.status === "ACTIVE";
    // Valores actuales del plan para precargar el formulario de edición.
    const segTargets: Record<string, number> = {};
    const seg2Targets: Record<string, number> = {};
    for (const s of p.segments) {
      if (s.parentValue == null) segTargets[s.value] = s.target;
      else seg2Targets[`${s.parentValue}|${s.value}`] = s.target;
    }
    const initial = {
      id: p.id,
      companyId: p.companyId,
      questionnaireId: p.questionnaireId,
      locationId: p.locationId ?? "",
      windowStart: utcToChileDay(p.windowStart),
      windowEnd: utcToChileDay(p.windowEnd),
      totalTarget: p.totalTarget,
      segEqKey: p.segmentKey ?? "",
      seg2EqKey: p.segment2Key ?? "",
      segTargets,
      seg2Targets,
      surveyorIds: p.surveyors.map((s) => s.id),
      comment: p.comment ?? "",
    };
    return (
      <div
        key={p.id}
        id={`plan-${p.id}`}
        className={`card space-y-3 scroll-mt-20 ${active ? "" : "opacity-60"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex flex-wrap items-center gap-2 font-semibold">
              {p.questionnaire.title}
              {!active && (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                  Cancelado
                </span>
              )}
            </h3>
            <p className="text-sm text-slate-500">
              {p.company.name}
              {p.location && ` · ${p.location.name}`} · {fmtDate(p.windowStart)} –{" "}
              {fmtDate(p.windowEnd)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {p.surveyors.length} encuestador(es)
            </span>
            <div className="flex items-center gap-2">
              <EditPlanButton
                companies={companyOptions}
                questionnaires={questionnaires}
                surveyors={surveyorOptions}
                initial={initial}
              />
              <PlanStatusToggle planId={p.id} active={active} />
            </div>
          </div>
        </div>

        <Bar done={prog.done} target={prog.total} label="Total" />

        <PlanSegmentTable
          segmentLabel={p.segmentLabel}
          segment2Label={p.segment2Label}
          levels={prog.levels}
          otros={prog.otros}
        />

        {p.comment && <p className="text-sm text-slate-600">📋 {p.comment}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-2xl font-bold">Planes de trabajo</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Vigentes</h2>
        {vigentes.length === 0 ? (
          <p className="text-sm text-slate-400">Sin planes vigentes.</p>
        ) : (
          <div className="space-y-4">{vigentes.map(planCard)}</div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          No vigentes
        </h2>
        {noVigentes.length === 0 ? (
          <p className="text-sm text-slate-400">Sin planes no vigentes.</p>
        ) : (
          <div className="space-y-4">{noVigentes.map(planCard)}</div>
        )}
      </section>

      <Fab title="Nuevo plan de trabajo">
        <NewWorkPlanForm
          companies={companyOptions}
          questionnaires={questionnaires}
          surveyors={surveyorOptions}
        />
      </Fab>
    </div>
  );
}
