"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Botón para cancelar / reactivar un plan de trabajo (solo admin). Cancelar
// pone el plan "no vigente": deja de aparecer para los encuestadores y en el
// avance de planes vigentes, pero conserva su histórico.
export default function PlanStatusToggle({
  planId,
  active,
}: {
  planId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (
      active &&
      !confirm(
        "¿Cancelar este plan? Dejará de aparecer para los encuestadores y en el avance de planes vigentes. Podrás reactivarlo cuando quieras."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/workplans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: active ? "CANCELLED" : "ACTIVE" }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={
          active
            ? "rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            : "rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
        }
      >
        {busy ? "Guardando…" : active ? "Cancelar" : "Reactivar"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
