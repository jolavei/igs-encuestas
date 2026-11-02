import ResponseBaseView from "@/components/bases/ResponseBaseView";
import { listBasePlans } from "@/lib/responseBase/data";

// La autorización (ADMIN) la aplica el layout de /admin.
export const dynamic = "force-dynamic";

export default async function BasesPage({ searchParams }: { searchParams: { plan?: string } }) {
  const plans = await listBasePlans();
  // Por defecto, el plan vigente más reciente (la lista ya viene con los vigentes primero).
  const initialPlanId = plans.some((p) => p.id === searchParams.plan)
    ? searchParams.plan!
    : (plans[0]?.id ?? null);
  return <ResponseBaseView plans={plans} initialPlanId={initialPlanId} />;
}
