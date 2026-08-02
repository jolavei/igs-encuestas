import { requireUser } from "@/lib/rbac";
import { getMonthlyReport, isValidMonth, currentMonth } from "@/lib/reports/monthlyReport";
import ReportDeck from "@/components/reports/ReportDeck";

// Vista imprimible del informe mensual (sin el shell del panel), solo ADMIN.
export const dynamic = "force-dynamic";

export default async function InformePage({
  params,
  searchParams,
}: {
  params: { airport: string };
  searchParams: { mes?: string };
}) {
  await requireUser(["ADMIN"]);

  const code = decodeURIComponent(params.airport).trim().toUpperCase();
  const mes = searchParams.mes && isValidMonth(searchParams.mes) ? searchParams.mes : currentMonth();

  const report = await getMonthlyReport(code, mes);

  if (!report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center">
        <p className="text-lg font-medium text-slate-700">No se pudo generar el informe.</p>
        <p className="max-w-md text-sm text-slate-500">
          El aeropuerto “{code}” no está mapeado a una empresa (Encuestas ASQ → Empresa · sede) o no existe.
        </p>
        <a href="/admin/informes" className="text-sm text-brand-700 hover:underline">
          ← Volver a Informes
        </a>
      </div>
    );
  }

  return <ReportDeck data={report} />;
}
