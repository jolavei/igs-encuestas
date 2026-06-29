"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Company = { id: string; name: string };

export default function QuestionnaireCompanies({
  questionnaireId,
  companies,
  assigned,
}: {
  questionnaireId: string;
  companies: Company[];
  assigned: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(assigned));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/questionnaires/${questionnaireId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: [...selected] }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setSaved(true);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">Empresas asignadas</h2>
        <p className="text-sm text-slate-500">
          El mismo cuestionario puede usarse en varias empresas (para comparar resultados
          entre ellas).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy} onClick={save}>
          {busy ? "Guardando…" : "Guardar empresas"}
        </button>
        {saved && <span className="text-sm text-green-600">✓ guardado</span>}
      </div>
    </div>
  );
}
