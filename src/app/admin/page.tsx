import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { getPlanProgress } from "@/lib/planProgress";
import LatestResponses, { type ResponseRow } from "@/components/LatestResponses";
import { PlanAvanceCard } from "@/components/planCards";

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

// Cuadro-resumen clicable que lleva a su sección/página.
function StatCard({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string | number;
}) {
  return (
    <Link
      href={href}
      className="card flex flex-col justify-between transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="text-3xl font-bold text-brand-700">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </Link>
  );
}

export default async function AdminHome() {
  const now = new Date();
  const [user, companies, questionnaires, responses, activePlans, lastSync, latest] =
    await Promise.all([
      getSessionUser(),
      prisma.company.count(),
      prisma.questionnaire.count(),
      prisma.responseSet.count(),
      // Planes vigentes: la fecha de hoy cae dentro de su ventana.
      prisma.workPlan.findMany({
        where: { windowStart: { lte: now }, windowEnd: { gte: now } },
        include: { company: true, questionnaire: true, segments: true },
        orderBy: { windowEnd: "asc" },
      }),
      prisma.syncLog.findFirst({ orderBy: { syncedAt: "desc" } }),
      prisma.responseSet.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          version: { include: { questionnaire: true } },
          location: { include: { company: true } },
        },
      }),
    ]);

  const firstName = user?.name?.split(" ")[0] ?? user?.email ?? "";

  // Avance de cada plan vigente.
  const plansProgress = await Promise.all(
    activePlans.map(async (p) => {
      const prog = await getPlanProgress(p.id, {
        totalTarget: p.totalTarget,
        segments: p.segments,
      });
      return {
        id: p.id,
        title: p.questionnaire.title,
        company: p.company.name,
        windowEnd: p.windowEnd,
        done: prog.done,
        total: prog.total,
      };
    })
  );

  const responseRows: ResponseRow[] = latest.map((r) => ({
    id: r.id,
    date: fmt(r.createdAt),
    questionnaire: r.version.questionnaire.title,
    place: r.location ? `${r.location.company.name} · ${r.location.name}` : "—",
    source: SOURCE_LABEL[r.source] ?? r.source,
  }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">¡Bienvenido {firstName}! 👋</h1>

      {/* Cuadros-resumen clicables */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard href="/admin/empresas" label="Empresas" value={companies} />
        <StatCard href="/admin/cuestionarios" label="Cuestionarios" value={questionnaires} />
        <StatCard href="#ultimas-respuestas" label="Respuestas" value={responses} />
        <StatCard
          href="/admin/planes"
          label="Planes de trabajo vigentes"
          value={activePlans.length}
        />
      </div>

      {/* Avance de planes de trabajo vigentes */}
      <section className="space-y-3">
        <h2 className="font-semibold">Avance de planes vigentes</h2>
        {plansProgress.length === 0 ? (
          <p className="text-sm text-slate-400">
            No hay planes de trabajo vigentes en este momento.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {plansProgress.map((pl) => (
              <PlanAvanceCard
                key={pl.id}
                href={`/admin/planes#plan-${pl.id}`}
                title={pl.title}
                subtitle={`${pl.company} · vence ${fmt(pl.windowEnd)}`}
                done={pl.done}
                total={pl.total}
              />
            ))}
          </div>
        )}
      </section>

      {/* Últimas respuestas (10 iniciales + mostrar más) */}
      <section id="ultimas-respuestas" className="space-y-3 scroll-mt-20">
        <h2 className="font-semibold">Últimas respuestas</h2>
        <LatestResponses rows={responseRows} />
      </section>

      {/* Última actualización en BigQuery (cuadro pequeño) */}
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="text-slate-500">Última actualización en BigQuery: </span>
        {lastSync ? (
          <span className="font-medium text-slate-900">
            {fmt(lastSync.syncedAt)}
            <span className="ml-1 font-normal text-slate-400">
              ({lastSync.tables} tablas, {lastSync.rows} filas)
            </span>
          </span>
        ) : (
          <span className="text-slate-500">aún sin sincronizar.</span>
        )}
      </div>
    </div>
  );
}
