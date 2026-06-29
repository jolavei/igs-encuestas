"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Company = { id: string; name: string };

export default function NewQuestionnaireForm({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/questionnaires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, companyIds: [...selected] }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setTitle("");
      setSelected(new Set());
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">Título</label>
        <input
          className="input"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Empresas que usarán este cuestionario</label>
        <div className="grid max-h-44 grid-cols-1 gap-1 overflow-auto rounded-md border border-slate-200 p-2 sm:grid-cols-2">
          {companies.length === 0 && (
            <p className="text-sm text-slate-400">No hay empresas activas.</p>
          )}
          {companies.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Puedes dejarlo sin empresas y asignarlas después.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn" disabled={busy}>
        {busy ? "Creando…" : "Crear cuestionario"}
      </button>
    </form>
  );
}
