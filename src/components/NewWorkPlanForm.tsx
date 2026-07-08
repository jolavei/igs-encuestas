"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [segEqKey, setSegEqKey] = useState(""); // primario
  const [seg2EqKey, setSeg2EqKey] = useState(""); // secundario (opcional)
  const [segTargets, setSegTargets] = useState<Record<string, number>>({}); // nivel 1
  const [seg2Targets, setSeg2Targets] = useState<Record<string, number>>({}); // "pval|sval"
  const [surveyorIds, setSurveyorIds] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const company = companies.find((c) => c.id === companyId);
  // La asignación empresa↔cuestionario nace del propio plan: se ofrecen todos los
  // cuestionarios con versión activa (ya no se filtra por empresa).
  const availableQuestionnaires = questionnaires;
  const questionnaire = questionnaires.find((q) => q.id === questionnaireId);
  const primaryQ = questionnaire?.segmentQuestions.find((s) => s.equivalenceKey === segEqKey);
  const secondaryQ = questionnaire?.segmentQuestions.find((s) => s.equivalenceKey === seg2EqKey);

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
      const segments: {
        parentValue: string | null;
        value: string;
        label: string;
        target: number;
      }[] = [];

      if (primaryQ) {
        for (const po of primaryQ.options) {
          const childSum = secondaryQ
            ? secondaryQ.options.reduce(
                (a, so) => a + (seg2Targets[`${po.value}|${so.value}`] ?? 0),
                0
              )
            : 0;
          const l1target = segTargets[po.value] || childSum;
          if (l1target > 0) {
            segments.push({ parentValue: null, value: po.value, label: po.label, target: l1target });
          }
          if (secondaryQ) {
            for (const so of secondaryQ.options) {
              const t = seg2Targets[`${po.value}|${so.value}`] ?? 0;
              if (t > 0) {
                segments.push({ parentValue: po.value, value: so.value, label: so.label, target: t });
              }
            }
          }
        }
      }

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
          segmentKey: primaryQ ? segEqKey : null,
          segmentLabel: primaryQ ? primaryQ.text : null,
          segment2Key: primaryQ && secondaryQ ? seg2EqKey : null,
          segment2Label: primaryQ && secondaryQ ? secondaryQ.text : null,
          segments,
          surveyorIds: [...surveyorIds],
          comment: comment || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      router.refresh();
      setCompanyId("");
      setQuestionnaireId("");
      setLocationId("");
      setWindowStart("");
      setWindowEnd("");
      setTotalTarget("");
      setSegEqKey("");
      setSeg2EqKey("");
      setSegTargets({});
      setSeg2Targets({});
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
            setSeg2EqKey("");
            setSegTargets({});
            setSeg2Targets({});
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
              setSeg2EqKey("");
              setSegTargets({});
              setSeg2Targets({});
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
              No hay cuestionarios con versión activa.
            </p>
          )}
        </div>
      )}

      {company && (
        <div>
          <label className="label">Sede (opcional — si no eliges, el encuestador la elige)</label>
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
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
          <input className="input" type="date" required value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input className="input" type="date" required value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
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

      {questionnaire && questionnaire.segmentQuestions.length === 0 && (
        <p className="text-xs text-slate-400">
          Este cuestionario no tiene preguntas de selección única con clave de equivalencia
          para usar como segmento.
        </p>
      )}

      {questionnaire && questionnaire.segmentQuestions.length > 0 && (
        <div>
          <label className="label">Segmento principal (opcional)</label>
          <select
            className="input"
            value={segEqKey}
            onChange={(e) => {
              setSegEqKey(e.target.value);
              setSeg2EqKey("");
              setSegTargets({});
              setSeg2Targets({});
            }}
          >
            <option value="">— sin segmento —</option>
            {questionnaire.segmentQuestions.map((s) => (
              <option key={s.equivalenceKey} value={s.equivalenceKey}>
                {s.text}
              </option>
            ))}
          </select>
        </div>
      )}

      {primaryQ && questionnaire!.segmentQuestions.length > 1 && (
        <div>
          <label className="label">Sub-segmento (opcional — para metas de dos niveles)</label>
          <select
            className="input"
            value={seg2EqKey}
            onChange={(e) => {
              setSeg2EqKey(e.target.value);
              setSeg2Targets({});
            }}
          >
            <option value="">— sin sub-segmento —</option>
            {questionnaire!.segmentQuestions
              .filter((s) => s.equivalenceKey !== segEqKey)
              .map((s) => (
                <option key={s.equivalenceKey} value={s.equivalenceKey}>
                  {s.text}
                </option>
              ))}
          </select>
        </div>
      )}

      {primaryQ && (
        <div className="rounded-md bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sub-metas por {primaryQ.text}
            {secondaryQ && ` → ${secondaryQ.text}`}
          </p>
          <div className="space-y-2">
            {primaryQ.options.map((po) => (
              <div key={po.value} className="rounded-md border border-slate-200 bg-white p-2">
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium">{po.label}</span>
                  <input
                    className="input w-24"
                    type="number"
                    min={0}
                    placeholder="meta"
                    value={segTargets[po.value] ?? ""}
                    onChange={(e) =>
                      setSegTargets((s) => ({
                        ...s,
                        [po.value]: e.target.value === "" ? 0 : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                {secondaryQ && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                    {secondaryQ.options.map((so) => {
                      const k = `${po.value}|${so.value}`;
                      return (
                        <div key={so.value} className="flex items-center gap-3 pl-4">
                          <span className="flex-1 text-sm text-slate-600">↳ {so.label}</span>
                          <input
                            className="input w-24"
                            type="number"
                            min={0}
                            placeholder="0"
                            value={seg2Targets[k] ?? ""}
                            onChange={(e) =>
                              setSeg2Targets((s) => ({
                                ...s,
                                [k]: e.target.value === "" ? 0 : Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            No es obligatorio que las sub-metas sumen N (el resto cuenta como “Otros”). Si un
            proceso no tiene meta propia, se usa la suma de sus sub-metas.
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
              <input type="checkbox" checked={surveyorIds.has(s.id)} onChange={() => toggleSurveyor(s.id)} />
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
