"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  QUESTION_TYPE_LABELS,
  BUILDER_QUESTION_TYPES,
  hasOptions,
  type QuestionType,
} from "@/lib/questionTypes";
import { BQ_TYPES, defaultBqType, type BqType } from "@/lib/dataform";
import { CopyIcon, TrashIcon } from "@/components/icons";

// Opción de una pregunta. goto (solo SINGLE_CHOICE): "NEXT" | "SUBMIT" | "GOTO:<sectionKey>".
export type OptionDraft = { label: string; goto: string };

export type Draft = {
  key: string;
  type: QuestionType;
  text: string;
  required: boolean;
  options?: OptionDraft[]; // SINGLE_CHOICE / MULTI_CHOICE / DROPDOWN
  maxStars?: number; // RATING
  maxLength?: number; // TEXT / PARAGRAPH
  afterKey?: string; // DATETIME: debe ser posterior a esta otra pregunta
  min?: number; // legado
  max?: number; // legado
  bqColumnName?: string;
  bqType?: BqType;
  bqDescription?: string;
};

export type SectionDraft = {
  key: string;
  title: string;
  description?: string;
  routing: string; // "NEXT" | "SUBMIT" | "GOTO:<sectionKey>"
  questions: Draft[];
};

function emptyOption(): OptionDraft {
  return { label: "", goto: "NEXT" };
}
function newDraft(): Draft {
  return { key: crypto.randomUUID(), type: "TEXT", text: "", required: true, options: [emptyOption()] };
}
function newSection(withQuestion = true): SectionDraft {
  return {
    key: crypto.randomUUID(),
    title: "",
    routing: "NEXT",
    questions: withQuestion ? [newDraft()] : [],
  };
}

function buildConfig(d: Draft, convGoto: (g: string) => string): Record<string, unknown> {
  switch (d.type) {
    case "RATING":
      return { maxStars: d.maxStars ?? 5 };
    case "TEXT":
    case "PARAGRAPH":
      return d.maxLength ? { maxLength: d.maxLength } : {};
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
    case "DROPDOWN": {
      const options = (d.options ?? [])
        .filter((o) => o.label.trim())
        .map((o) => {
          const base: { value: string; label: string; goto?: string } = {
            value: o.label.trim(),
            label: o.label.trim(),
          };
          // Ruteo por opción solo en SINGLE_CHOICE, y solo si difiere de "seguir".
          if (d.type === "SINGLE_CHOICE" && o.goto && o.goto !== "NEXT") {
            base.goto = convGoto(o.goto);
          }
          return base;
        });
      return { options, multi: d.type === "MULTI_CHOICE" };
    }
    case "LIKERT":
      return { min: d.min ?? 1, max: d.max ?? 5 };
    case "NUMBER":
      return { min: d.min, max: d.max };
    default:
      return {};
  }
}

// ---- Editor de opciones (estilo Google Forms) ----
function OptionsEditor({
  type,
  options,
  onChange,
  sectionTargets,
  showRouting,
}: {
  type: QuestionType;
  options: OptionDraft[];
  onChange: (opts: OptionDraft[]) => void;
  sectionTargets: { key: string; label: string }[];
  showRouting: boolean;
}) {
  const marker = type === "MULTI_CHOICE" ? "▢" : type === "DROPDOWN" ? "" : "○";
  const list = options.length ? options : [emptyOption()];
  const setAt = (i: number, patch: Partial<OptionDraft>) =>
    onChange(list.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <div className="space-y-2">
      {list.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-center text-slate-400">
            {type === "DROPDOWN" ? `${i + 1}.` : marker}
          </span>
          <input
            className="input flex-1"
            placeholder={`Opción ${i + 1}`}
            value={opt.label}
            onChange={(e) => setAt(i, { label: e.target.value })}
          />
          {showRouting && (
            <select
              className="input shrink-0 text-sm"
              style={{ width: "11rem" }}
              value={opt.goto}
              onChange={(e) => setAt(i, { goto: e.target.value })}
              title="A dónde lleva esta opción"
            >
              <option value="NEXT">→ Siguiente sección</option>
              {sectionTargets.map((t) => (
                <option key={t.key} value={`GOTO:${t.key}`}>
                  → {t.label}
                </option>
              ))}
              <option value="SUBMIT">→ Enviar formulario</option>
            </select>
          )}
          {list.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Quitar opción"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, emptyOption()])}
        className="pl-7 text-sm text-slate-400 hover:text-slate-600"
      >
        Agregar una opción
      </button>
    </div>
  );
}

// ---- Vista previa del formato de respuesta según el tipo ----
function AnswerPreview({
  d,
  onChange,
  sectionTargets,
}: {
  d: Draft;
  onChange: (patch: Partial<Draft>) => void;
  sectionTargets: { key: string; label: string }[];
}) {
  switch (d.type) {
    case "TEXT":
      return <input className="input" disabled placeholder="Texto de respuesta breve" />;
    case "PARAGRAPH":
      return <textarea className="input" disabled rows={2} placeholder="Texto de respuesta largo" />;
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
    case "DROPDOWN":
      return (
        <OptionsEditor
          type={d.type}
          options={d.options ?? [emptyOption()]}
          onChange={(options) => onChange({ options })}
          sectionTargets={sectionTargets}
          showRouting={d.type === "SINGLE_CHOICE"}
        />
      );
    case "FILE_UPLOAD":
      return (
        <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
          Subir archivo (pdf, word, excel o imágenes)
        </div>
      );
    case "RATING": {
      const max = d.maxStars ?? 5;
      return (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Cantidad de estrellas
            <select
              className="input shrink-0"
              style={{ width: "5rem" }}
              value={max}
              onChange={(e) => onChange({ maxStars: Number(e.target.value) })}
            >
              {Array.from({ length: 8 }, (_, i) => i + 3).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end justify-center gap-3 py-1">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-slate-400">N/A</span>
              <span className="h-7 w-7 rounded border border-slate-300" />
            </div>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <div key={n} className="flex flex-col items-center gap-1">
                <span className="text-xs text-slate-400">{n}</span>
                <span className="text-2xl leading-none text-slate-300">★</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "DATETIME":
      return (
        <div className="flex gap-2">
          <input className="input" type="datetime-local" step={1} disabled />
          <button type="button" className="btn-secondary whitespace-nowrap" disabled>
            Ahora
          </button>
        </div>
      );
    case "NPS":
      return <p className="text-sm text-slate-400">Escala NPS 0–10 (tipo histórico).</p>;
    case "LIKERT":
      return <p className="text-sm text-slate-400">Escala Likert (tipo histórico).</p>;
    case "NUMBER":
      return <input className="input" type="number" disabled placeholder="Número" />;
    default:
      return null;
  }
}

// ---- Tarjeta editable de una pregunta ----
function QuestionCard({
  d,
  index,
  total,
  datetimeOptions,
  sectionTargets,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  d: Draft;
  index: number;
  total: number;
  datetimeOptions: { key: string; text: string }[];
  sectionTargets: { key: string; label: string }[];
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const typeChoices = BUILDER_QUESTION_TYPES.includes(d.type)
    ? BUILDER_QUESTION_TYPES
    : [d.type, ...BUILDER_QUESTION_TYPES];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
          {index + 1}
        </span>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <input
            className="input font-medium"
            placeholder="Pregunta"
            value={d.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <select
            className="input min-w-0"
            value={d.type}
            onChange={(e) => onChange({ type: e.target.value as QuestionType })}
          >
            {typeChoices.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pl-8">
        <AnswerPreview d={d} onChange={onChange} sectionTargets={sectionTargets} />

        {d.type === "DATETIME" && datetimeOptions.length > 0 && (
          <div className="mt-3">
            <label className="label">Debe ser posterior a (opcional)</label>
            <select
              className="input"
              value={d.afterKey ?? ""}
              onChange={(e) => onChange({ afterKey: e.target.value || undefined })}
            >
              <option value="">— sin validación —</option>
              {datetimeOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.text || "(sin texto)"}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 rounded-md bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Columna en BigQuery
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Nombre de la columna</label>
              <input
                className="input"
                placeholder="ej: satisfaccion_general"
                value={d.bqColumnName ?? ""}
                onChange={(e) => onChange({ bqColumnName: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Tipo de dato</label>
              <select
                className="input"
                value={d.bqType ?? defaultBqType(d.type)}
                onChange={(e) => onChange({ bqType: e.target.value as BqType })}
              >
                {BQ_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="label">Descripción breve de la pregunta</label>
            <input
              className="input"
              placeholder="ej: Satisfacción general del pasajero"
              value={d.bqDescription ?? ""}
              onChange={(e) => onChange({ bqDescription: e.target.value })}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            El nombre de columna identifica la pregunta entre versiones (clave de referencia).
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 border-t border-slate-100 pt-3">
        <button
          type="button"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          title="Subir"
        >
          ↑
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          title="Bajar"
        >
          ↓
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={onDuplicate}
          title="Duplicar"
        >
          <CopyIcon width={18} height={18} />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          onClick={onRemove}
          title="Eliminar"
        >
          <TrashIcon width={18} height={18} />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={d.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Obligatoria
        </label>
      </div>
    </div>
  );
}

export default function QuestionnaireBuilder({
  questionnaireId,
  nextVersion,
  initialSections = [],
}: {
  questionnaireId: string;
  nextVersion: number;
  initialSections?: SectionDraft[];
}) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionDraft[]>(
    initialSections.length ? initialSections : [newSection()]
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Todas las preguntas DATETIME (para "posterior a"), a través de las secciones.
  const allDatetime = sections
    .flatMap((s) => s.questions)
    .filter((q) => q.type === "DATETIME");
  // Secciones destino para el ruteo por opción (SINGLE_CHOICE).
  const sectionTargets = sections.map((s, i) => ({
    key: s.key,
    label: `Sección ${i + 1}${s.title ? `: ${s.title}` : ""}`,
  }));

  function patchSection(sk: string, patch: Partial<SectionDraft>) {
    setSections((ss) => ss.map((s) => (s.key === sk ? { ...s, ...patch } : s)));
  }
  function mutQuestions(sk: string, fn: (qs: Draft[]) => Draft[]) {
    setSections((ss) => ss.map((s) => (s.key === sk ? { ...s, questions: fn(s.questions) } : s)));
  }
  function updateQ(sk: string, qk: string, patch: Partial<Draft>) {
    mutQuestions(sk, (qs) => qs.map((q) => (q.key === qk ? { ...q, ...patch } : q)));
  }
  function removeQ(sk: string, qk: string) {
    mutQuestions(sk, (qs) => qs.filter((q) => q.key !== qk));
  }
  function duplicateQ(sk: string, qk: string) {
    mutQuestions(sk, (qs) => {
      const i = qs.findIndex((q) => q.key === qk);
      if (i < 0) return qs;
      const copy = {
        ...qs[i],
        key: crypto.randomUUID(),
        options: qs[i].options ? qs[i].options!.map((o) => ({ ...o })) : undefined,
      };
      const out = [...qs];
      out.splice(i + 1, 0, copy);
      return out;
    });
  }
  function moveQ(sk: string, qk: string, dir: -1 | 1) {
    mutQuestions(sk, (qs) => {
      const i = qs.findIndex((q) => q.key === qk);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function addQ(sk: string) {
    mutQuestions(sk, (qs) => [...qs, newDraft()]);
  }
  function addSection() {
    setSections((ss) => [...ss, newSection()]);
  }
  function removeSection(sk: string) {
    setSections((ss) => ss.filter((s) => s.key !== sk));
  }
  function moveSection(sk: string, dir: -1 | 1) {
    setSections((ss) => {
      const i = ss.findIndex((s) => s.key === sk);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ss.length) return ss;
      const copy = [...ss];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  async function save(publish: boolean) {
    const cleanSections = sections
      .map((s) => ({ ...s, questions: s.questions.filter((q) => q.text.trim()) }))
      .filter((s) => s.questions.length > 0);
    if (cleanSections.length === 0) {
      setError("Agrega al menos una pregunta con texto.");
      return;
    }
    for (const s of cleanSections)
      for (const q of s.questions)
        if (hasOptions(q.type) && (q.options ?? []).filter((o) => o.label.trim()).length === 0) {
          setError(`La pregunta "${q.text}" necesita al menos una opción.`);
          return;
        }

    // Orden global de preguntas (para afterQuestionOrder) y orden de secciones.
    const globalOrder: Record<string, number> = {};
    let gi = 0;
    for (const s of cleanSections) for (const q of s.questions) globalOrder[q.key] = ++gi;
    const sectionOrder: Record<string, number> = {};
    cleanSections.forEach((s, i) => (sectionOrder[s.key] = i + 1));
    const convRouting = (r: string) => {
      if (r === "SUBMIT" || r === "NEXT") return r;
      if (r.startsWith("GOTO:")) {
        const o = sectionOrder[r.slice(5)];
        return o ? `GOTO:${o}` : "NEXT";
      }
      return "NEXT";
    };
    // Ruteo por opción: convierte GOTO:<sectionKey> a GOTO:<order>.
    const convGoto = (g: string) => {
      if (g === "SUBMIT") return "SUBMIT";
      if (g.startsWith("GOTO:")) {
        const o = sectionOrder[g.slice(5)];
        return o ? `GOTO:${o}` : "NEXT";
      }
      return "NEXT";
    };

    setBusy(true);
    setError(null);
    try {
      const payloadSections = cleanSections.map((s, si) => ({
        order: si + 1,
        title: s.title || "",
        description: s.description || null,
        routing: convRouting(s.routing),
        questions: s.questions.map((q) => {
          const cfg = buildConfig(q, convGoto);
          if (q.type === "DATETIME" && q.afterKey && globalOrder[q.afterKey]) {
            (cfg as Record<string, unknown>).afterQuestionOrder = globalOrder[q.afterKey];
          }
          const config = Object.keys(cfg).length ? cfg : null;
          return {
            order: globalOrder[q.key],
            type: q.type,
            text: q.text,
            required: q.required,
            config,
            bqColumnName: q.bqColumnName || null,
            bqType: q.bqType || null,
            bqDescription: q.bqDescription || null,
          };
        }),
      }));

      const r = await fetch(`/api/questionnaires/${questionnaireId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish, note: note || null, sections: payloadSections }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setSections([newSection()]);
      setNote("");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Nueva versión (v{nextVersion})</h2>
        {initialSections.length > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSections(initialSections)}
            title={`Cargar las preguntas de la v${nextVersion - 1}`}
          >
            Cargar v{nextVersion - 1}
          </button>
        )}
      </div>

      <div className="space-y-5">
        {sections.map((s, si) => (
          <div key={s.key} className="rounded-lg border border-slate-300 bg-slate-50/60 p-3">
            {/* Encabezado de sección */}
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                Sección {si + 1}
              </span>
              <input
                className="input flex-1 bg-white font-medium"
                placeholder="Título de la sección (opcional)"
                value={s.title}
                onChange={(e) => patchSection(s.key, { title: e.target.value })}
              />
              <button
                type="button"
                className="rounded p-1.5 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                disabled={si === 0}
                onClick={() => moveSection(s.key, -1)}
                title="Subir sección"
              >
                ↑
              </button>
              <button
                type="button"
                className="rounded p-1.5 text-slate-400 hover:bg-slate-200 disabled:opacity-30"
                disabled={si === sections.length - 1}
                onClick={() => moveSection(s.key, 1)}
                title="Bajar sección"
              >
                ↓
              </button>
              {sections.length > 1 && (
                <button
                  type="button"
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => removeSection(s.key)}
                  title="Eliminar sección"
                >
                  <TrashIcon width={18} height={18} />
                </button>
              )}
            </div>
            <input
              className="input mb-3 bg-white text-sm"
              placeholder="Descripción de la sección (opcional)"
              value={s.description ?? ""}
              onChange={(e) => patchSection(s.key, { description: e.target.value })}
            />

            {/* Preguntas de la sección */}
            <div className="space-y-3">
              {s.questions.map((d, i) => (
                <QuestionCard
                  key={d.key}
                  d={d}
                  index={i}
                  total={s.questions.length}
                  datetimeOptions={allDatetime
                    .filter((x) => x.key !== d.key)
                    .map((x) => ({ key: x.key, text: x.text }))}
                  sectionTargets={sectionTargets}
                  onChange={(patch) => updateQ(s.key, d.key, patch)}
                  onRemove={() => removeQ(s.key, d.key)}
                  onDuplicate={() => duplicateQ(s.key, d.key)}
                  onMove={(dir) => moveQ(s.key, d.key, dir)}
                />
              ))}
            </div>

            <button
              type="button"
              className="btn-secondary mt-3 w-full"
              onClick={() => addQ(s.key)}
            >
              + Agregar pregunta
            </button>

            {/* Ruteo al final de la sección */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-500">Después de esta sección:</span>
              <select
                className="input shrink-0"
                style={{ width: "17rem", maxWidth: "100%" }}
                value={s.routing}
                onChange={(e) => patchSection(s.key, { routing: e.target.value })}
              >
                <option value="NEXT">Continuar a la siguiente sección</option>
                {sections
                  .filter((o) => o.key !== s.key)
                  .map((o) => {
                    const idx = sections.findIndex((x) => x.key === o.key) + 1;
                    return (
                      <option key={o.key} value={`GOTO:${o.key}`}>
                        Ir a la sección {idx}
                        {o.title ? `: ${o.title}` : ""}
                      </option>
                    );
                  })}
                <option value="SUBMIT">Enviar formulario</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn-secondary w-full" onClick={addSection}>
        + Agregar sección
      </button>

      <div>
        <label className="label">Comentario del cambio (qué cambió y por qué)</label>
        <textarea
          className="input"
          rows={2}
          placeholder="ej: Se agregó una sección para pasajeros frecuentes."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button className="btn" disabled={busy} onClick={() => save(true)}>
          Publicar versión
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => save(false)}>
          Guardar borrador
        </button>
      </div>
    </div>
  );
}
