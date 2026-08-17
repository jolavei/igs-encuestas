"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Encabezado editable del cuestionario en la página de detalle.
export default function QuestionnaireTitleEditor({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("El título debe tener al menos 2 caracteres.");
      return;
    }
    if (trimmed === title) {
      setEditing(false);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/questionnaires/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setEditing(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-2">
        <input
          className="input text-2xl font-bold"
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <button
        className="btn-secondary shrink-0"
        onClick={() => {
          setName(title);
          setError(null);
          setEditing(true);
        }}
      >
        Renombrar
      </button>
    </div>
  );
}
