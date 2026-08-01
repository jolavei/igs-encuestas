"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import NewWorkPlanForm, {
  type Company,
  type Questionnaire,
  type Surveyor,
  type PlanInitial,
} from "@/components/NewWorkPlanForm";

// Botón "Editar" por plan (solo admin). Abre un panel con el mismo formulario del
// plan, precargado con sus valores actuales. Reusa el chrome del modal del Fab.
export default function EditPlanButton({
  companies,
  questionnaires,
  surveyors,
  initial,
}: {
  companies: Company[];
  questionnaires: Questionnaire[];
  surveyors: Surveyor[];
  initial: PlanInitial;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Editar
      </button>

      {mounted &&
        open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-900/30"
              onClick={() => setOpen(false)}
            />
            <div className="fixed bottom-24 right-6 z-50 max-h-[75vh] w-[26rem] max-w-[92vw] overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Editar plan de trabajo</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xl leading-none text-slate-400 hover:text-slate-600"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              <NewWorkPlanForm
                companies={companies}
                questionnaires={questionnaires}
                surveyors={surveyors}
                initial={initial}
                onDone={() => setOpen(false)}
              />
            </div>
          </>,
          document.body
        )}
    </>
  );
}
