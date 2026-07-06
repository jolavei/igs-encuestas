import Link from "next/link";

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
