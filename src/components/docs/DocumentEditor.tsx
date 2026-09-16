"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

// Editor de un documento (admin): nombre y descripción. Abre un modal desde un
// botón "Editar" en cada fila de la tabla de documentos.
export default function DocumentEditor({
  id,
  name: initialName,
  description: initialDescription,
}: {
  id: string;
  name: string;
  description: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="text-xs font-medium text-brand-600 hover:underline"
        onClick={() => setOpen(true)}
      >
        Editar
      </button>
      {mounted &&
        open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setOpen(false)} />
            <div className="fixed left-1/2 top-1/2 z-50 w-[28rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Editar documento</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xl leading-none text-slate-400 hover:text-slate-600"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Nombre</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Descripción</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Nota o detalle del archivo (opcional)"
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button className="btn" disabled={busy} onClick={save}>
                  {busy ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
