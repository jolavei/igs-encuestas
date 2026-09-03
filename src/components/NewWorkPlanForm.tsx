"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buildPlanSegmentsFromTargets } from "@/lib/planSegments";

export type Company = { id: string; name: string; locations: { id: string; name: string }[] };
type SubOption = { value: string; label: string };
type SegmentQuestion = {
  equivalenceKey: string;
  text: string;
  options: SubOption[];
  // Presente solo si esta pregunta enruta a una sección por opción (p. ej. "Proceso a
  // medir"): la sub-meta de cada opción usa la aerolínea de su sección, distinta por
  // proceso. `byOption[valorDelProceso]` = opciones de aerolínea de ese proceso.
  nested?: { label: string; byOption: Record<string, SubOption[]> } | null;
};
export type Questionnaire = {
  id: string;
  title: string;
  companyIds: string[];
  segmentQuestions: SegmentQuestion[];
};
export type Surveyor = { id: string; email: string };

// Valores iniciales para editar un plan existente. Si no se pasa, el formulario
// crea un plan nuevo.
export type PlanInitial = {
  id: string;
  companyId: string;
  questionnaireId: string;
  locationId: string;
  windowStart: string; // "YYYY-MM-DD" (día chileno)
  windowEnd: string;
  totalTarget: number;
  segEqKey: string;
  seg2EqKey: string;
  segTargets: Record<string, number>;
  seg2Targets: Record<string, number>;
  surveyorIds: string[];
  comment: string;
};

export default function NewWorkPlanForm({
  companies,
  questionnaires,
  surveyors,
  initial,
  onDone,
}: {
  companies: Company[];
  questionnaires: Questionnaire[];
  surveyors: Surveyor[];
  initial?: PlanInitial;
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = !!initial;
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [questionnaireId, setQuestionnaireId] = useState(initial?.questionnaireId ?? "");
  const [locationId, setLocationId] = useState(initial?.locationId ?? "");
  const [windowStart, setWindowStart] = useState(initial?.windowStart ?? "");
  const [windowEnd, setWindowEnd] = useState(initial?.windowEnd ?? "");
  const [totalTarget, setTotalTarget] = useState<number | "">(initial?.totalTarget ?? "");
  const [segEqKey, setSegEqKey] = useState(initial?.segEqKey ?? ""); // primario
  const [seg2EqKey, setSeg2EqKey] = useState(initial?.seg2EqKey ?? ""); // secundario (opcional)
  const [segTargets, setSegTargets] = useState<Record<string, number>>(initial?.segTargets ?? {}); // nivel 1
  const [seg2Targets, setSeg2Targets] = useState<Record<string, number>>(initial?.seg2Targets ?? {}); // "pval|sval"
  const [surveyorIds, setSurveyorIds] = useState<Set<string>>(new Set(initial?.surveyorIds ?? []));
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const company = companies.find((c) => c.id === companyId);
  // La asignación empresa↔cuestionario nace del propio plan: se ofrecen todos los
  // cuestionarios con versión activa (ya no se filtra por empresa).
  const availableQuestionnaires = questionnaires;
  const questionnaire = questionnaires.find((q) => q.id === questionnaireId);
  const primaryQ = questionnaire?.segmentQuestions.find((s) => s.equivalenceKey === segEqKey);
  const secondaryQ = questionnaire?.segmentQuestions.find((s) => s.equivalenceKey === seg2EqKey);
  // Modo "anidado por sección": el primario enruta a una sección por opción y cada una
  // tiene su propia aerolínea. En ese caso el sub-segmento no se elige (es automático).
  const nested = primaryQ?.nested ?? null;
  const isNested = !!nested;
  // Opciones de sub-meta para un valor del primario: anidadas por proceso, o (modo
  // clásico) las opciones uniformes del sub-segmento elegido.
  const subOptionsFor = (poValue: string): SubOption[] =>
    nested ? nested.byOption[poValue] ?? [] : secondaryQ ? secondaryQ.options : [];
  const subLabel = nested ? nested.label : secondaryQ?.text;

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
      const segments = buildPlanSegmentsFromTargets(
        primaryQ ? primaryQ.options : [],
        subOptionsFor,
        segTargets,
        seg2Targets
      );

      const r = await fetch(editing ? `/api/workplans/${initial!.id}` : "/api/workplans", {
        method: editing ? "PATCH" : "POST",
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
          // Anidado por sección => centinela "@nested" (la aerolínea se resuelve por la
          // sección del proceso al guardar la respuesta). Si no, el sub-segmento elegido.
          segment2Key: primaryQ ? (isNested ? "@nested" : secondaryQ ? seg2EqKey : null) : null,
          segment2Label: primaryQ ? (isNested ? nested!.label : secondaryQ?.text ?? null) : null,
          segments,
          surveyorIds: [...surveyorIds],
          comment: comment || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      router.refresh();
      if (editing) {
        onDone?.();
        return;
      }
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

      {primaryQ && !isNested && questionnaire!.segmentQuestions.length > 1 && (
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
            {subLabel && ` → ${subLabel}`}
          </p>
          <div className="space-y-2">
            {primaryQ.options.map((po) => {
              const subOpts = subOptionsFor(po.value);
              return (
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
                {subOpts.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                    {subOpts.map((so) => {
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
              );
            })}
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
        {busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear plan de trabajo"}
      </button>
    </form>
  );
}
