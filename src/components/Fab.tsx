"use client";
import { useEffect, useState } from "react";

// Botón flotante "+" (abajo a la derecha) que despliega un panel para crear ítems.
export default function Fab({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-slate-900/20"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-24 right-6 z-40 max-h-[75vh] w-[26rem] max-w-[92vw] overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{title}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-xl leading-none text-slate-400 hover:text-slate-600"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            {children}
          </div>
        </>
      )}

      <button
        aria-label={title}
        title={title}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600 text-3xl leading-none text-white shadow-lg transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        {open ? "−" : "+"}
      </button>
    </>
  );
}
