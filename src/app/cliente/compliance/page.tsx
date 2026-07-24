import { getSessionUser } from "@/lib/rbac";
import { getUserScope } from "@/lib/userScope";
import { getScopedAsq } from "@/lib/asqScope";
import AsqComplianceView from "@/components/AsqComplianceView";
import SyncBubble from "@/components/SyncBubble";

export default async function ClienteCompliancePage() {
  const user = await getSessionUser();
  const scope = await getUserScope(user!.id);
  const { airports, season, mapped, lastScraped } = await getScopedAsq(
    scope.locationIds,
    scope.companyIds
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Encuestas ASQ</h1>
          <SyncBubble syncedAt={lastScraped} />
        </div>
        {season && <p className="text-sm text-slate-500">Temporada: {season}</p>}
      </div>

      {airports.length === 0 ? (
        <p className="max-w-2xl text-slate-500">
          {scope.locations.length === 0
            ? "Tu usuario aún no tiene sedes asignadas."
            : mapped
            ? "Aún no hay datos ASQ para tus aeropuertos en esta temporada."
            : "Tus sedes aún no están asociadas a un aeropuerto ASQ."}
        </p>
      ) : (
        <AsqComplianceView airports={airports} />
      )}
    </div>
  );
}
