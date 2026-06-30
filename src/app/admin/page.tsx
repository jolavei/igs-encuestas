import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-3xl font-bold text-brand-700">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

const SOURCE_LABEL: Record<string, string> = {
  QR_PUBLIC: "QR público",
  FIELD: "Encuestador",
};

export default async function AdminHome() {
  const [user, companies, questionnaires, responses, lastSync, latest] =
    await Promise.all([
      getSessionUser(),
      prisma.company.count(),
      prisma.questionnaire.count(),
      prisma.responseSet.count(),
      prisma.syncLog.findFirst({ orderBy: { syncedAt: "desc" } }),
      prisma.responseSet.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          version: { include: { questionnaire: true } },
          location: { include: { company: true } },
        },
      }),
    ]);

  const firstName = user?.name?.split(" ")[0] ?? user?.email ?? "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">¡Bienvenido {firstName}! 👋</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Empresas" value={companies} />
        <Stat label="Cuestionarios" value={questionnaires} />
        <Stat label="Respuestas" value={responses} />
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Datos en BigQuery</h2>
        {lastSync ? (
          <p className="text-sm text-slate-600">
            Última actualización:{" "}
            <span className="font-medium text-slate-900">{fmt(lastSync.syncedAt)}</span>{" "}
            <span className="text-slate-400">
              ({lastSync.tables} tablas, {lastSync.rows} filas)
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Aún no se ha sincronizado a BigQuery.
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          La sincronización corre automáticamente cada 6 horas.
        </p>
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Últimas respuestas</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Cuestionario</th>
                <th className="px-4 py-2">Empresa · Sede</th>
                <th className="px-4 py-2">Origen</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                    {fmt(r.createdAt)}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {r.version.questionnaire.title}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.location
                      ? `${r.location.company.name} · ${r.location.name}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </span>
                  </td>
                </tr>
              ))}
              {latest.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-400" colSpan={4}>
                    Aún no hay respuestas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/admin/cuestionarios" className="btn">
          Gestionar cuestionarios
        </Link>
        <Link href="/admin/asignaciones" className="btn-secondary">
          Asignar encuestadores
        </Link>
      </div>
    </div>
  );
}
