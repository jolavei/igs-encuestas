import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { computeNps, computeCsat } from "@/lib/metrics";
import { fromJson } from "@/lib/enums";
import type { QuestionConfig } from "@/lib/questionTypes";

async function locationMetrics(locationId: string) {
  const [nps, likert, total] = await Promise.all([
    prisma.answer.findMany({
      where: {
        valueNumber: { not: null },
        question: { type: "NPS" },
        responseSet: { locationId },
      },
      select: { valueNumber: true },
    }),
    prisma.answer.findMany({
      where: {
        valueNumber: { not: null },
        question: { type: "LIKERT" },
        responseSet: { locationId },
      },
      select: { valueNumber: true, question: { select: { config: true } } },
    }),
    prisma.responseSet.count({ where: { locationId } }),
  ]);

  const npsRes = computeNps(nps.map((a) => a.valueNumber!));
  // CSAT: usa el max de config de cada pregunta (fallback 5).
  const max = Math.max(
    5,
    ...likert.map((a) => fromJson<QuestionConfig>(a.question.config)?.max ?? 5)
  );
  const csatRes = computeCsat(likert.map((a) => a.valueNumber!), max);
  return { nps: npsRes.nps, csat: csatRes.csat, total };
}

export default async function ClienteHome() {
  const user = await getSessionUser();

  if (!user!.companyId) {
    return (
      <div className="card">
        <h1 className="text-xl font-bold">Dashboard de cliente</h1>
        <p className="mt-2 text-slate-600">
          Tu usuario no está vinculado a una empresa. Pide a un administrador que asocie
          tu cuenta a una empresa para ver sus resultados.
        </p>
      </div>
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: user!.companyId },
    include: { locations: true },
  });

  const rows = await Promise.all(
    (company?.locations ?? []).map(async (l) => ({
      location: l,
      ...(await locationMetrics(l.id)),
    }))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{company?.name}</h1>
      <p className="text-slate-500">Resultados por sede</p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Sede</th>
              <th className="px-4 py-2">Respuestas</th>
              <th className="px-4 py-2">NPS</th>
              <th className="px-4 py-2">CSAT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.location.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{r.location.name}</td>
                <td className="px-4 py-2">{r.total}</td>
                <td className="px-4 py-2">{r.nps ?? "—"}</td>
                <td className="px-4 py-2">{r.csat != null ? `${r.csat}%` : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={4}>
                  Sin sedes registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
