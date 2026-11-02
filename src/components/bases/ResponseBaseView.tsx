"use client";
import { useEffect, useState } from "react";
import ResponseGrid from "@/components/bases/ResponseGrid";
import type { BasePage, BasePlanOption } from "@/lib/responseBase/data";
import type { GridColumn, GridRow } from "@/lib/responseBase/grid";

type Load = {
  columns: GridColumn[];
  rows: GridRow[];
  total: number;
  status: "loading" | "done" | "error";
};

const EMPTY_LOAD: Load = { columns: [], rows: [], total: 0, status: "loading" };

const planOption = (p: BasePlanOption) => (
  <option key={p.id} value={p.id}>
    {p.label} · {p.company} ({p.responses.toLocaleString("es-CL")})
  </option>
);

export default function ResponseBaseView({
  plans,
  initialPlanId,
}: {
  plans: BasePlanOption[];
  initialPlanId: string | null;
}) {
  const [planId, setPlanId] = useState(initialPlanId);
  const [load, setLoad] = useState<Load>(EMPTY_LOAD);
  const [attempt, setAttempt] = useState(0);

  // Baja los envíos por tramos; la grilla se va llenando mientras llegan.
  useEffect(() => {
    if (!planId) return;
    const controller = new AbortController();
    setLoad(EMPTY_LOAD);
    (async () => {
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
        const res: Response = await fetch(`/api/bases/${planId}${query}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const page: BasePage = await res.json();
        setLoad((prev) => ({
          columns: page.columns,
          rows: prev.rows.concat(page.rows),
          total: page.total,
          status: page.nextCursor ? "loading" : "done",
        }));
        cursor = page.nextCursor;
      } while (cursor);
    })().catch(() => {
      if (!controller.signal.aborted) setLoad((prev) => ({ ...prev, status: "error" }));
    });
    return () => controller.abort();
  }, [planId, attempt]);

  function choosePlan(id: string) {
    setPlanId(id);
    window.history.replaceState(null, "", `/admin/bases?plan=${encodeURIComponent(id)}`);
  }

  const vigentes = plans.filter((p) => p.active);
  const noVigentes = plans.filter((p) => !p.active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Bases de datos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada fila es un envío de cuestionario y cada columna una pregunta. Usa el embudo de cada
          columna para filtrar u ordenar.
        </p>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Aún no hay planes de trabajo.
        </div>
      ) : (
        <>
          <div className="max-w-2xl">
            <label htmlFor="base-plan" className="label">
              Plan de trabajo
            </label>
            <select
              id="base-plan"
              value={planId ?? ""}
              onChange={(e) => choosePlan(e.target.value)}
              className="input bg-white"
            >
              {vigentes.length > 0 && <optgroup label="Vigentes">{vigentes.map(planOption)}</optgroup>}
              {noVigentes.length > 0 && <optgroup label="No vigentes">{noVigentes.map(planOption)}</optgroup>}
            </select>
          </div>

          {load.status === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              No se pudieron cargar las respuestas.{" "}
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="font-medium underline"
              >
                Reintentar
              </button>
            </div>
          ) : load.status === "done" && load.rows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Este plan aún no tiene respuestas.
            </div>
          ) : load.columns.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Cargando respuestas…</p>
          ) : (
            <ResponseGrid
              key={planId}
              columns={load.columns}
              rows={load.rows}
              total={load.total}
              loading={load.status === "loading"}
            />
          )}
        </>
      )}
    </div>
  );
}
