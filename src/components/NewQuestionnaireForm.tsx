"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BilingualSwitch from "@/components/BilingualSwitch";

export default function NewQuestionnaireForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [bilingual, setBilingual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/questionnaires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, bilingual }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setTitle("");
      setBilingual(false);
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
      <BilingualSwitch checked={bilingual} onChange={setBilingual} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn" disabled={busy}>
        {busy ? "Creando…" : "Crear cuestionario"}
      </button>
    </form>
  );
}
