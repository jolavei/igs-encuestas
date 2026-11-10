"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BilingualSwitch from "@/components/BilingualSwitch";

// Encuesta bilingüe en el detalle del cuestionario: interruptor ES | EN y título en
// inglés. Se guardan al instante y no crean una versión nueva.
export default function QuestionnaireLanguageSettings({
  id,
  bilingual,
  titleEn,
}: {
  id: string;
  bilingual: boolean;
  titleEn: string | null;
}) {
  const router = useRouter();
  const [on, setOn] = useState(bilingual);
  const [title, setTitle] = useState(titleEn ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function patch(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/questionnaires/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Error");
      setMsg({ ok: true, text: okText });
      router.refresh();
      return true;
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(v: boolean) {
    setOn(v);
    const ok = await patch(
      { bilingual: v },
      v ? "Botón ES | EN activado." : "Botón ES | EN desactivado."
    );
    if (!ok) setOn(!v);
  }

  return (
    <div className="mt-3 max-w-2xl space-y-2">
      <BilingualSwitch checked={on} onChange={toggle} disabled={busy} />
      {on && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            patch({ titleEn: title.trim() || null }, "Título en inglés guardado.");
          }}
        >
          <span className="w-7 shrink-0 rounded border border-accent py-0.5 text-center text-[10px] font-bold text-accent">
            EN
          </span>
          <input
            className={`input min-w-0 flex-1 ${title.trim() ? "" : "border-amber-400 bg-amber-50"}`}
            placeholder="Título del cuestionario en inglés"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="submit"
            className="btn-secondary shrink-0"
            disabled={busy || title.trim() === (titleEn ?? "")}
          >
            Guardar
          </button>
        </form>
      )}
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
