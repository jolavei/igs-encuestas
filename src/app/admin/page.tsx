import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { getPlanProgress } from "@/lib/planProgress";
import PlanesVigentesTable, { type PlanRow } from "@/components/PlanesVigentesTable";

function fmtDateTime(d: Date) {
  // No se puede mezclar dateStyle con hour/minute: se usan componentes individuales.
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "medium",
  }).format(d);
}

const SOURCE_LABEL: Record<string, string> = {
  QR_PUBLIC: "QR público",
  FIELD: "Encuestador",
};

// Cuadro-resumen. Si tiene href es clicable; si no, es solo informativo.
function StatCard({
  href,
  label,
  value,
}: {
  href?: string;
  label: string;
  value: string | number;
}) {
  const inner = (
    <>
      <div className="text-3xl font-bold text-brand-700">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </>
  );
  if (!href) return <div className="card flex flex-col justify-between">{inner}</div>;
  return (
    <Link
      href={href}
      className="card flex flex-col justify-between transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {inner}
    </Link>
  );
}

export default async function AdminHome() {
  const now = new Date();
  const [user, empresasVigentes, cuestionarios, activePlans, lastSync] = await Promise.all([
    getSessionUser(),
    prisma.company.count({ where: { active: true } }),
    prisma.questionnaire.count(),
    // Planes vigentes: hoy cae dentro de su ventana.
    prisma.workPlan.findMany({
      where: { windowStart: { lte: now }, windowEnd: { gte: now } },
      include: { company: true, questionnaire: true, location: true, segments: true },
      orderBy: { windowEnd: "asc" },
    }),
    prisma.syncLog.findFirst({ orderBy: { syncedAt: "desc" } }),
  ]);

  const firstName = user?.name?.split(" ")[0] ?? user?.email ?? "";

  const activePlanIds = activePlans.map((p) => p.id);
  const respuestasVigentes = activePlanIds.length
    ? await prisma.responseSet.count({ where: { workPlanId: { in: activePlanIds } } })
    : 0;

  // Filas de la tabla: avance + última encuesta (fecha/hora + origen) por plan.
  const rows: PlanRow[] = await Promise.all(
    activePlans.map(async (p) => {
      const [prog, last] = await Promise.all([
        getPlanProgress(p.id, { totalTarget: p.totalTarget, segments: p.segments }),
        prisma.responseSet.findFirst({
          where: { workPlanId: p.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, source: true },
        }),
      ]);
      const target = prog.total;
      const done = prog.done;
      return {
        id: p.id,
        questionnaire: p.questionnaire.title,
        company: p.company.name,
        location: p.location?.name ?? "Todas las sedes",
        windowStart: fmtDate(p.windowStart),
        windowEnd: fmtDate(p.windowEnd),
        done,
        target,
        pct: target > 0 ? Math.round((done / target) * 100) : 0,
        reached: target > 0 && done >= target,
        lastResponse: last ? fmtDateTime(last.createdAt) : null,
        source: last ? SOURCE_LABEL[last.source] ?? last.source : null,
      };
    })
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">¡Bienvenido {firstName}! 👋</h1>

        {/* Burbuja de estado: última sincronización con BigQuery */}
        {lastSync ? (
          <span
            title={`${lastSync.tables} tablas, ${lastSync.rows} filas`}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Última sincronización: {fmtDateTime(lastSync.syncedAt)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-slate-400" />
            Aún sin sincronizar
          </span>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard href="/admin/empresas" label="Empresas vigentes" value={empresasVigentes} />
        <StatCard href="/admin/cuestionarios" label="Cuestionarios" value={cuestionarios} />
        <StatCard
          href="/admin/planes"
          label="Planes de trabajo vigentes"
          value={activePlans.length}
        />
        <StatCard
          href="#planes-vigentes"
          label="Respuestas (planes vigentes)"
          value={respuestasVigentes}
        />
      </div>

      {/* Avance de planes de trabajo vigentes (tabla) */}
      <section id="planes-vigentes" className="space-y-3 scroll-mt-20">
        <h2 className="font-semibold">Avance de planes de trabajo vigentes</h2>
        <PlanesVigentesTable rows={rows} />
      </section>
    </div>
  );
}
