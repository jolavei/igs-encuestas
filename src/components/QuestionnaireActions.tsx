"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QuestionnaireActions({
  id,
  active,
  title,
}: {
  id: string;
  active: boolean;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/questionnaires/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (await patch({ active: !active })) router.refresh();
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("El título debe tener al menos 2 caracteres.");
      return;
    }
    if (trimmed === title) {
      setEditing(false);
      return;
    }
    if (await patch({ title: trimmed })) {
      setEditing(false);
      router.refresh();
    }
  }

  if (editing) {
    return (
      <form onSubmit={saveName} className="flex flex-col items-end gap-1">
        <input
          className="input w-56"
          autoFocus
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="submit" className="btn shrink-0" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            className="btn-secondary shrink-0"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setName(title);
              setError(null);
            }}
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          className="btn-secondary shrink-0"
          disabled={busy}
          onClick={() => {
            setName(title);
            setError(null);
            setEditing(true);
          }}
        >
          Renombrar
        </button>
        <button className="btn-secondary shrink-0" disabled={busy} onClick={toggle}>
          {busy ? "…" : active ? "Dejar no vigente" : "Reactivar"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
