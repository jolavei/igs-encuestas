"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QuestionnaireActions({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/questionnaires/${id}`, {
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

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-secondary shrink-0" disabled={busy} onClick={toggle}>
        {busy ? "…" : active ? "Dejar no vigente" : "Reactivar"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
