import type { ReadinessState } from "@/lib/reports/readiness";

// Píldora de estado de datos de un módulo (tarjetas de Informes y editor).
const STYLES: Record<ReadinessState, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
  off: "bg-slate-100 text-slate-500",
  na: "bg-slate-100 text-slate-400",
};

export default function ReadinessChip({ state, text }: { state: ReadinessState; text: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[state]}`}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}
