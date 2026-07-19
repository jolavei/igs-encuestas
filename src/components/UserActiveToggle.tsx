"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UserActiveToggle({
  id,
  active,
  isSelf,
}: {
  id: string;
  active: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/users/${id}`, {
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
      <button
        className={
          active
            ? "inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            : "btn-secondary"
        }
        disabled={busy || (isSelf && active)}
        title={isSelf && active ? "No puedes desactivar tu propia cuenta" : undefined}
        onClick={toggle}
      >
        {busy ? "…" : active ? "Desactivar" : "Reactivar"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
