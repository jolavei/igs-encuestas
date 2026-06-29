"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CompanyActions({
  id,
  name,
  active,
  canDelete,
}: {
  id: string;
  name: string;
  active: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `¿Eliminar definitivamente "${name}"? Esta acción no se puede deshacer.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/companies/${id}`, { method: "DELETE" });
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
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={busy} onClick={toggle}>
          {active ? "Desactivar" : "Activar"}
        </button>
        <button
          className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          disabled={busy || !canDelete}
          title={
            canDelete
              ? "Eliminar definitivamente"
              : "Tiene cuestionarios o respuestas: desactiva en vez de eliminar"
          }
          onClick={remove}
        >
          Eliminar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
