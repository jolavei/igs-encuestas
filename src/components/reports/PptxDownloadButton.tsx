"use client";

import { useState } from "react";

// Botón "Descargar PPTX" que primero pregunta por comentarios y sugerencias:
// abre un diálogo con un cuadro de texto. Si se escribe algo, el informe agrega
// una diapositiva "Comentarios y sugerencias" antes del cierre; si se deja
// vacío, se omite. Descarga vía POST + blob (el comentario puede ser largo).
export default function PptxDownloadButton({ airport, mes }: { airport: string; mes: string }) {
  const [open, setOpen] = useState(false);
  const [comentarios, setComentarios] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (loading) return;
    setOpen(false);
    setError(null);
  }

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airport, mes, comentarios }),
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
      setOpen(false);
      setComentarios("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        Descargar PPTX
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">Comentarios y sugerencias</h3>
            <p className="mt-1 text-sm text-slate-500">
              Se agregará una diapositiva “Comentarios y sugerencias” antes del cierre. Si lo dejas vacío, el informe
              se genera sin esa diapositiva.
            </p>
            <textarea
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              rows={6}
              maxLength={3000}
              autoFocus
              placeholder="Escribe aquí tus comentarios y sugerencias (opcional)…"
              className="mt-3 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={download}
                disabled={loading}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Generando…" : comentarios.trim() ? "Descargar con comentarios" : "Descargar sin comentarios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
