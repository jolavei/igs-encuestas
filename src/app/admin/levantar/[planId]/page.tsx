import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanSurvey } from "@/lib/planSurvey";
import FieldSurvey from "@/components/FieldSurvey";

export default async function AdminLevantar({ params }: { params: { planId: string } }) {
  const data = await getPlanSurvey(params.planId);
  if (!data) notFound();

  if (!data.hasVersion) {
    return (
      <div className="card">
        <p>El cuestionario de este plan no tiene versión activa.</p>
        <Link href="/admin/levantar" className="btn mt-3">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/admin/levantar" className="text-sm text-brand-600">
        ← Planes
      </Link>
      <FieldSurvey
        workPlanId={data.plan.id}
        title={data.plan.questionnaire.title}
        subtitle={data.plan.location?.name}
        questions={data.questions}
        locations={data.locations ?? undefined}
      />
    </div>
  );
}
