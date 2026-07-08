import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/rbac";
import { getPlanSurvey } from "@/lib/planSurvey";
import FieldSurvey from "@/components/FieldSurvey";

export default async function Levantar({ params }: { params: { planId: string } }) {
  const user = await getSessionUser();
  const data = await getPlanSurvey(params.planId);
  if (!data) notFound();

  // El encuestador debe estar asignado al plan.
  const assigned = data.plan.surveyors.some((s) => s.id === user!.id);
  if (!assigned && user!.role !== "ADMIN") notFound();

  if (!data.hasVersion) {
    return (
      <div className="card">
        <p>El cuestionario de este plan no tiene versión activa.</p>
        <Link href="/encuestador" className="btn mt-3">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/encuestador" className="text-sm text-brand-600">
        ← Mi plan de trabajo
      </Link>
      <FieldSurvey
        workPlanId={data.plan.id}
        title={data.plan.questionnaire.title}
        subtitle={data.plan.location?.name}
        sections={data.sections}
        locations={data.locations ?? undefined}
      />
    </div>
  );
}
