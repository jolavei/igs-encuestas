"use client";

import { useState } from "react";

// Acciones de la tarjeta de informe: "Ver informe" despliega un cuadro de texto
// inline para redactar comentarios y sugerencias. El comentario alimenta tanto
// la vista HTML ("Abrir informe") como el PPTX ("Descargar PPTX"). Si se deja
// vacío, ni el informe ni el PPTX muestran la diapositiva de comentarios.
export default function ReportActions({ airport, mes }: { airport: string; mes: string }) {
  const [open, setOpen] = useState(false);
  const [comentarios, setComentarios] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = comentarios.trim();

  function openReport() {
    const q = new URLSearchParams({ mes });
    if (trimmed) q.set("comentarios", trimmed);
    window.open(`/informe/${encodeURIComponent(airport)}?${q.toString()}`, "_blank", "noopener");
  }

  async function downloadPptx() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airport, mes, comentarios: trimmed }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || "No se pudo generar el informe.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mes.replace("-", "")} ${airport} Informe Mensual.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-auto pt-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          Ver informe
        </button>
        <button
          type="button"
          onClick={downloadPptx}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Generando…" : "Descargar PPTX"}
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Comentarios y sugerencias
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Opcional. Si escribes algo, se agrega una diapositiva “Comentarios y sugerencias” antes del cierre —
            tanto en el informe como en el PPTX.
          </p>
          <textarea
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            rows={4}
            maxLength={3000}
            autoFocus
            placeholder="Escribe aquí tus comentarios y sugerencias…"
            className="mt-2 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={openReport}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              Abrir informe →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
