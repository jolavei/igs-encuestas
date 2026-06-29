import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeNps } from "@/lib/metrics";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-3xl font-bold text-brand-700">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

export default async function AdminHome() {
  const [companies, questionnaires, responses, pendingSync, npsAnswers] =
    await Promise.all([
      prisma.company.count(),
      prisma.questionnaire.count(),
      prisma.responseSet.count(),
      prisma.responseSet.count({ where: { syncedAt: null } }),
      prisma.answer.findMany({
        where: { question: { type: "NPS" }, valueNumber: { not: null } },
        select: { valueNumber: true },
      }),
    ]);

  const { nps, n } = computeNps(npsAnswers.map((a) => a.valueNumber!));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Panel de administración</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Empresas" value={companies} />
        <Stat label="Cuestionarios" value={questionnaires} />
        <Stat label="Respuestas" value={responses} />
        <Stat label={`NPS global (n=${n})`} value={nps ?? "—"} />
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">Sincronización a BigQuery</h2>
        <p className="text-sm text-slate-600">
          {pendingSync} respuesta(s) pendiente(s) de sync. El movimiento de datos a
          BigQuery se hace por batch (Datastream / Airbyte), no en tiempo real.
        </p>
      </div>

      <div className="flex gap-3">
        <Link href="/admin/cuestionarios" className="btn">Gestionar cuestionarios</Link>
        <Link href="/admin/asignaciones" className="btn-secondary">Asignar encuestadores</Link>
      </div>
    </div>
  );
}
