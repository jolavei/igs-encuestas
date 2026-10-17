"use client";

import { useCallback, useEffect, useState } from "react";
import type { SurveyDashboardData, SurveyFilters } from "@/lib/surveys/data";
import type { SurveyViewKey } from "@/lib/surveys/views";

/** Carga los datos de una vista del Dashboard y mantiene sus filtros. */
export function useSurveyDashboard(view: SurveyViewKey) {
  const [filters, setFilters] = useState<SurveyFilters>({ plan: null, mes: null, segQ: null, segV: null });
  const [data, setData] = useState<SurveyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (f: SurveyFilters) => {
      setLoading(true);
      setError(null);
      const q = new URLSearchParams();
      if (f.plan) q.set("plan", f.plan);
      if (f.mes) q.set("mes", f.mes);
      if (f.segQ && f.segV) {
        q.set("segQ", f.segQ);
        q.set("segV", f.segV);
      }
      try {
        const res = await fetch(`/api/dashboard/encuestas/${view}?${q}`, { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "No se pudieron cargar los datos.");
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
      } finally {
        setLoading(false);
      }
    },
    [view]
  );

  useEffect(() => {
    load(filters);
  }, [filters, load]);

  // Al cambiar un filtro se parte de los filtros efectivos que devolvió el servidor
  // (que ya resolvió el plan y el mes por defecto).
  const update = (patch: Partial<SurveyFilters>) =>
    setFilters({ ...(data?.filters ?? filters), ...patch });

  // Actualización local tras destacar/quitar una respuesta (sin recargar todo).
  const setHighlighted = (answerId: string, on: boolean) =>
    setData((d) =>
      d
        ? {
            ...d,
            open: d.open.map((q) => ({
              ...q,
              answers: q.answers.map((a) => (a.answerId === answerId ? { ...a, highlighted: on } : a)),
            })),
          }
        : d
    );

  const setAppraisal = (appraisal: SurveyDashboardData["appraisal"]) =>
    setData((d) => (d ? { ...d, appraisal } : d));

  return { data, loading, error, update, setHighlighted, setAppraisal };
}
