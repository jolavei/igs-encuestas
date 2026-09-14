import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanSurvey } from "@/lib/planSurvey";
import { planDisplayTitle } from "@/lib/planTitle";
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
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/levantar" className="text-sm text-brand-600">
        ← Planes
      </Link>
      {/* El levantamiento vive en un contenedor blanco redondeado con margen vertical. */}
      <FieldSurvey
        workPlanId={data.plan.id}
        title={planDisplayTitle(data.plan.questionnaire.title, data.plan.name)}
        subtitle={data.plan.location?.name}
        sections={data.sections}
        locations={data.locations ?? undefined}
      />
    </div>
  );
}
