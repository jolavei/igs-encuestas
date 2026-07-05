"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  QUESTION_TYPE_LABELS,
  type QuestionType,
  type Option,
} from "@/lib/questionTypes";
import { BQ_TYPES, defaultBqType, type BqType } from "@/lib/dataform";

export type Draft = {
  key: string;
  type: QuestionType;
  text: string;
  required: boolean;
  equivalenceKey?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  optionsText?: string; // "valor:Etiqueta" por linea
  afterKey?: string; // DATETIME: debe ser posterior a esta otra pregunta (por su key)
  // Mapeo a BigQuery (Dataform)
  bqColumnName?: string;
  bqType?: BqType;
  bqDescription?: string;
};

const TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

function newDraft(): Draft {
  return { key: crypto.randomUUID(), type: "NPS", text: "", required: true };
}

function buildConfig(d: Draft): Record<string, unknown> {
  switch (d.type) {
    case "LIKERT":
      return { min: d.min ?? 1, max: d.max ?? 5 };
    case "NUMBER":
      return { min: d.min, max: d.max };
    case "TEXT":
      return { maxLength: d.maxLength };
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE": {
      const options: Option[] = (d.optionsText ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [value, ...rest] = l.split(":");
          return { value: value.trim(), label: (rest.join(":") || value).trim() };
        });
      return { options, multi: d.type === "MULTI_CHOICE" };
    }
    default:
      return {};
  }
}

// ---- Tarjeta editable de una pregunta ----
function QuestionCard({
  d,
  index,
  total,
  datetimeOptions,
  onChange,
  onRemove,
  onMove,
}: {
  d: Draft;
  index: number;
  total: number;
  datetimeOptions: { key: string; text: string }[];
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const needsOptions = d.type === "SINGLE_CHOICE" || d.type === "MULTI_CHOICE";
  const needsRange = d.type === "LIKERT" || d.type === "NUMBER";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
          {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            title="Subir"
          >
            ↑
          </button>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            title="Bajar"
          >
            ↓
          </button>
          <button
            type="button"
            className="ml-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            onClick={onRemove}
          >
            Quitar
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Tipo</label>
            <select
              className="input"
              value={d.type}
              onChange={(e) => onChange({ type: e.target.value as QuestionType })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Clave de equivalencia (opcional)</label>
            <input
              className="input"
              placeholder="ej: t1_ingreso"
              value={d.equivalenceKey ?? ""}
              onChange={(e) => onChange({ equivalenceKey: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">Texto de la pregunta</label>
          <input
            className="input"
            value={d.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </div>

        {needsRange && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mín</label>
              <input
                className="input"
                type="number"
                value={d.min ?? (d.type === "LIKERT" ? 1 : "")}
                onChange={(e) => onChange({ min: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Máx</label>
              <input
                className="input"
                type="number"
                value={d.max ?? (d.type === "LIKERT" ? 5 : "")}
                onChange={(e) => onChange({ max: Number(e.target.value) })}
              />
            </div>
          </div>
        )}

        {d.type === "TEXT" && (
          <div>
            <label className="label">Longitud máxima</label>
            <input
              className="input"
              type="number"
              value={d.maxLength ?? ""}
              onChange={(e) => onChange({ maxLength: Number(e.target.value) })}
            />
          </div>
        )}

        {d.type === "DATETIME" && datetimeOptions.length > 0 && (
          <div>
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
            <p className="mt-1 text-xs text-slate-400">Ej: la hora t2 debe ser posterior a t1.</p>
          </div>
        )}

        {needsOptions && (
          <div>
            <label className="label">Opciones (una por línea, formato valor:Etiqueta)</label>
            <textarea
              className="input"
              rows={4}
              placeholder={"1:Muy malo\n2:Malo\n3:Bueno"}
              value={d.optionsText ?? ""}
              onChange={(e) => onChange({ optionsText: e.target.value })}
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Obligatoria
        </label>

        {/* Mapeo a BigQuery (Dataform) */}
        <div className="rounded-md bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Columna en BigQuery
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Nombre de la columna</label>
              <input
                className="input"
                placeholder="ej: t1_ingreso"
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
            <label className="label">Detalle (a qué hace referencia)</label>
            <input
              className="input"
              placeholder="ej: Hora de ingreso del pasajero"
              value={d.bqDescription ?? ""}
              onChange={(e) => onChange({ bqDescription: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuestionnaireBuilder({
  questionnaireId,
  nextVersion,
  initialDrafts = [],
}: {
  questionnaireId: string;
  nextVersion: number;
  initialDrafts?: Draft[];
}) {
  const router = useRouter();
  // Al crear una nueva versión, arranca con las preguntas de la versión anterior
  // ya cargadas y editables, en su orden final.
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((s) => s.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  function remove(key: string) {
    setDrafts((s) => s.filter((d) => d.key !== key));
  }
  function move(key: string, dir: -1 | 1) {
    setDrafts((s) => {
      const i = s.findIndex((d) => d.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function add() {
    setDrafts((s) => [...s, newDraft()]);
  }

  async function save(publish: boolean) {
    const clean = drafts.filter((d) => d.text.trim());
    if (clean.length === 0) {
      setError("Agrega al menos una pregunta con texto.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const keyToOrder: Record<string, number> = {};
      clean.forEach((q, i) => (keyToOrder[q.key] = i + 1));

      const r = await fetch(`/api/questionnaires/${questionnaireId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publish,
          note: note || null,
          questions: clean.map((q, i) => {
            const cfg = buildConfig(q);
            if (q.type === "DATETIME" && q.afterKey && keyToOrder[q.afterKey]) {
              cfg.afterQuestionOrder = keyToOrder[q.afterKey];
            }
            const config = Object.keys(cfg).length ? cfg : null;
            return {
              order: i + 1,
              type: q.type,
              text: q.text,
              required: q.required,
              equivalenceKey: q.equivalenceKey || null,
              config,
              bqColumnName: q.bqColumnName || null,
              bqType: q.bqType || null,
              bqDescription: q.bqDescription || null,
            };
          }),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setDrafts([]);
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
        <div className="flex gap-2">
          {initialDrafts.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDrafts(initialDrafts)}
              title={`Cargar las preguntas de la v${nextVersion - 1}`}
            >
              Cargar v{nextVersion - 1}
            </button>
          )}
          {drafts.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDrafts([])}
            >
              Vaciar
            </button>
          )}
        </div>
      </div>

      {drafts.length === 0 && (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          No hay preguntas todavía. Agrega la primera con el botón de abajo.
        </p>
      )}

      <div className="space-y-3">
        {drafts.map((d, i) => (
          <QuestionCard
            key={d.key}
            d={d}
            index={i}
            total={drafts.length}
            datetimeOptions={drafts
              .filter((x) => x.type === "DATETIME" && x.key !== d.key)
              .map((x) => ({ key: x.key, text: x.text }))}
            onChange={(patch) => update(d.key, patch)}
            onRemove={() => remove(d.key)}
            onMove={(dir) => move(d.key, dir)}
          />
        ))}
      </div>

      <button type="button" className="btn-secondary w-full" onClick={add}>
        + Agregar pregunta
      </button>

      <div>
        <label className="label">Comentario del cambio (qué cambió y por qué)</label>
        <textarea
          className="input"
          rows={2}
          placeholder="ej: Se agregó la medición t3 (salida) y se hizo obligatoria t2."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button className="btn" disabled={busy || drafts.length === 0} onClick={() => save(true)}>
          Publicar versión
        </button>
        <button
          className="btn-secondary"
          disabled={busy || drafts.length === 0}
          onClick={() => save(false)}
        >
          Guardar borrador
        </button>
      </div>
    </div>
  );
}
