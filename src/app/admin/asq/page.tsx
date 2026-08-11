import { prisma } from "@/lib/prisma";
import { ASQ_TABLE, ASQ_DATASET } from "@/lib/asq/ingestDepartures";
import AsqIngestPanel from "@/components/asq/AsqIngestPanel";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("es-CL");
const dateFmt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

export default async function AsqIngestaPage() {
  const imports = await prisma.asqDepartureImport.findMany({
    include: { createdBy: { select: { firstName: true, lastName: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ingesta ASQ Departures</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sube el Excel «Data EXCEL Tablet» del semestre. Se valida contra el formato definitivo,
          se normaliza y se carga a BigQuery (<code>{ASQ_DATASET}.{ASQ_TABLE}</code>). Cada carga
          reemplaza su temporada (idempotente), así puedes re-subir un archivo corregido sin duplicar.
        </p>
      </div>

      <AsqIngestPanel />

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800">Historial de cargas</h2>
        {imports.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Aún no se ha ingestado ningún archivo.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Archivo</th>
                  <th className="px-4 py-2.5 font-medium">Temporada</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cargadas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reemplazadas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Propias</th>
                  <th className="px-4 py-2.5 font-medium">Por</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => {
                  const who =
                    [imp.createdBy?.firstName, imp.createdBy?.lastName].filter(Boolean).join(" ") ||
                    imp.createdBy?.name ||
                    imp.createdBy?.email ||
                    "—";
                  return (
                    <tr key={imp.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                        {dateFmt.format(imp.createdAt)}
                      </td>
                      <td className="max-w-[16rem] truncate px-4 py-2.5 text-slate-700" title={imp.fileName}>
                        {imp.fileName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                        {imp.seasonLabel || imp.quarters || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {imp.status === "LOADED" ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Cargado
                          </span>
                        ) : (
                          <span
                            className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                            title={imp.error || undefined}
                          >
                            Falló
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {imp.status === "LOADED" ? fmt(imp.loadedRows) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {imp.status === "LOADED" ? fmt(imp.replacedRows) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {imp.status === "LOADED" ? fmt(imp.ownRowCount) : "—"}
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-2.5 text-slate-500" title={who}>
                        {who}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
