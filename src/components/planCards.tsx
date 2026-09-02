import { Fragment } from "react";
import Link from "next/link";
import type { Level1Node } from "@/lib/planProgress";

// Barra de avance reutilizable (verde si alcanzó la meta).
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const reached = total > 0 && done >= total;
  return (
    <div className="h-2 w-full rounded bg-slate-100">
      <div
        className={`h-2 rounded ${reached ? "bg-green-500" : "bg-brand-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Tarjeta de avance de un plan. Con `href` la tarjeta entera es enlace
// (admin). Sin `href` es estática (cliente) y admite `children` como pie
// (chips de segmento, botón "Levantar", etc.).
export function PlanAvanceCard({
  title,
  subtitle,
  done,
  total,
  href,
  children,
}: {
  title: string;
  subtitle: string;
  done: number;
  total: number;
  href?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-slate-600">
          {done} / {total || "∞"}
        </span>
      </div>
      <ProgressBar done={done} total={total} />
      {children}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="card block space-y-2 transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {body}
      </Link>
    );
  }
  return <div className="card space-y-2">{body}</div>;
}

// Estado de una sub-meta: ✓ si alcanzó la meta, o cuántas faltan.
function Estado({ done, target }: { done: number; target: number }) {
  if (target > 0 && done >= target) return <span className="font-medium text-green-600">✓</span>;
  return <span className="text-slate-400">faltan {Math.max(0, target - done)}</span>;
}

// Tabla de avance detallado por apertura (nivel 1) y sub-apertura (nivel 2).
// Reutilizada en el plan de trabajo del admin y en la página de inicio del
// encuestador. Devuelve null si el plan no tiene segmentos definidos.
export function PlanSegmentTable({
  segmentLabel,
  segment2Label,
  levels,
  otros,
}: {
  segmentLabel?: string | null;
  segment2Label?: string | null;
  levels: Level1Node[];
  otros: number;
}) {
  if (levels.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">
              {segmentLabel || "Segmento"}
              {segment2Label && ` / ${segment2Label}`}
            </th>
            <th className="px-3 py-2 text-right">Realizadas</th>
            <th className="px-3 py-2 text-right">Meta</th>
            <th className="px-3 py-2 text-right">Estado</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((l1) => (
            <Fragment key={l1.value}>
              <tr className="border-t border-slate-200 bg-slate-50/60 font-medium">
                <td className="px-3 py-2">{l1.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l1.done}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l1.target}</td>
                <td className="px-3 py-2 text-right">
                  <Estado done={l1.done} target={l1.target} />
                </td>
              </tr>
              {l1.children.map((c) => (
                <tr key={c.value} className="border-t border-slate-100 text-slate-600">
                  <td className="px-3 py-2 pl-7">↳ {c.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.done}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.target}</td>
                  <td className="px-3 py-2 text-right">
                    <Estado done={c.done} target={c.target} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          {otros > 0 && (
            <tr className="border-t border-slate-100 text-slate-500">
              <td className="px-3 py-2 italic">Otros (fuera de segmentos)</td>
              <td className="px-3 py-2 text-right tabular-nums">{otros}</td>
              <td className="px-3 py-2 text-right">—</td>
              <td className="px-3 py-2"></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
