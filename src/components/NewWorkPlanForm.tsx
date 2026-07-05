"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Company = { id: string; name: string; locations: { id: string; name: string }[] };
type SegmentQuestion = {
  equivalenceKey: string;
  text: string;
  options: { value: string; label: string }[];
};
type Questionnaire = {
  id: string;
  title: string;
  companyIds: string[];
  segmentQuestions: SegmentQuestion[];
};
type Surveyor = { id: string; email: string };

export default function NewWorkPlanForm({
  companies,
  questionnaires,
  surveyors,
}: {
  companies: Company[];
  questionnaires: Questionnaire[];
  surveyors: Surveyor[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  const [questionnaireId, setQuestionnaireId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [totalTarget, setTotalTarget] = useState<number | "">("");
  const [segEqKey, setSegEqKey] = useState("");
  const [segTargets, setSegTargets] = useState<Record<string, number>>({});
  const [surveyorIds, setSurveyorIds] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const company = companies.find((c) => c.id === companyId);
  const availableQuestionnaires = useMemo(
    () => questionnaires.filter((q) => q.companyIds.includes(companyId)),
    [questionnaires, companyId]
  );
  const questionnaire = questionnaires.find((q) => q.id === questionnaireId);
  const segmentQuestion = questionnaire?.segmentQuestions.find(
    (s) => s.equivalenceKey === segEqKey
  );
  const segSum = Object.values(segTargets).reduce((a, b) => a + (b || 0), 0);

  function toggleSurveyor(id: string) {
    setSurveyorIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const segments = segmentQuestion
        ? segmentQuestion.options
            .filter((o) => (segTargets[o.value] ?? 0) > 0)
            .map((o) => ({ value: o.value, label: o.label, target: segTargets[o.value] }))
        : [];

      const r = await fetch("/api/workplans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          questionnaireId,
          locationId: locationId || null,
          windowStart,
          windowEnd,
          totalTarget: Number(totalTarget) || 0,
          segmentKey: segmentQuestion ? segEqKey : null,
          segmentLabel: segmentQuestion ? segmentQuestion.text : null,
          segments,
          surveyorIds: [...surveyorIds],
          comment: comment || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      router.refresh();
      // reset
      setCompanyId("");
      setQuestionnaireId("");
      setLocationId("");
      setWindowStart("");
      setWindowEnd("");
      setTotalTarget("");
      setSegEqKey("");
      setSegTargets({});
      setSurveyorIds(new Set());
      setComment("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Empresa</label>
        <select
          className="input"
          required
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value);
            setQuestionnaireId("");
            setLocationId("");
            setSegEqKey("");
            setSegTargets({});
          }}
        >
          <option value="">— elegir —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {companyId && (
        <div>
          <label className="label">Cuestionario</label>
          <select
            className="input"
            required
            value={questionnaireId}
            onChange={(e) => {
              setQuestionnaireId(e.target.value);
              setSegEqKey("");
              setSegTargets({});
            }}
          >
            <option value="">— elegir —</option>
            {availableQuestionnaires.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
          {availableQuestionnaires.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              Esta empresa no tiene cuestionarios con versión activa.
            </p>
          )}
        </div>
      )}

      {company && (
        <div>
          <label className="label">Sede (opcional — si no eliges, el encuestador la elige)</label>
          <select
            className="input"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">— cualquiera de la empresa —</option>
            {company.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Desde</label>
          <input
            className="input"
            type="date"
            required
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input
            className="input"
            type="date"
            required
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label">Meta total mínima (N encuestas)</label>
        <input
          className="input"
          type="number"
          min={0}
          required
          value={totalTarget}
          onChange={(e) => setTotalTarget(e.target.value === "" ? "" : Number(e.target.value))}
        />
      </div>

      {questionnaire && (
        <div>
          <label className="label">Segmento (opcional)</label>
          {questionnaire.segmentQuestions.length === 0 ? (
            <p className="text-xs text-slate-400">
              Este cuestionario no tiene preguntas de selección única con clave de
              equivalencia para usar como segmento.
            </p>
          ) : (
            <select
              className="input"
              value={segEqKey}
              onChange={(e) => {
                setSegEqKey(e.target.value);
                setSegTargets({});
              }}
            >
              <option value="">— sin segmento —</option>
              {questionnaire.segmentQuestions.map((s) => (
                <option key={s.equivalenceKey} value={s.equivalenceKey}>
                  {s.text}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {segmentQuestion && (
        <div className="rounded-md bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sub-metas por {segmentQuestion.text}
          </p>
          <div className="space-y-2">
            {segmentQuestion.options.map((o) => (
              <div key={o.value} className="flex items-center gap-3">
                <span className="flex-1 text-sm">{o.label}</span>
                <input
                  className="input w-24"
                  type="number"
                  min={0}
                  placeholder="0"
                  value={segTargets[o.value] ?? ""}
                  onChange={(e) =>
                    setSegTargets((s) => ({
                      ...s,
                      [o.value]: e.target.value === "" ? 0 : Number(e.target.value),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Suma de sub-metas: {segSum}
            {totalTarget !== "" && ` de ${totalTarget}`}. No es obligatorio que sumen N
            (el resto se cuenta como “Otros”).
          </p>
        </div>
      )}

      <div>
        <label className="label">Encuestadores asignados</label>
        <div className="grid max-h-36 grid-cols-1 gap-1 overflow-auto rounded-md border border-slate-200 p-2 sm:grid-cols-2">
          {surveyors.length === 0 && (
            <p className="text-sm text-slate-400">No hay encuestadores registrados.</p>
          )}
          {surveyors.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={surveyorIds.has(s.id)}
                onChange={() => toggleSurveyor(s.id)}
              />
              <span className="truncate">{s.email}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Comentario del plan (opcional)</label>
        <textarea
          className="input"
          rows={2}
          placeholder="Ej: completar en horario AM, priorizar pasajeros business…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full" disabled={busy || !questionnaireId}>
        {busy ? "Creando…" : "Crear plan de trabajo"}
      </button>
    </form>
  );
}
