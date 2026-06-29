"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  QUESTION_TYPE_LABELS,
  type QuestionType,
  type Option,
} from "@/lib/questionTypes";
import { BQ_TYPES, defaultBqType, type BqType } from "@/lib/dataform";

type Draft = {
  type: QuestionType;
  text: string;
  required: boolean;
  equivalenceKey?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  optionsText?: string; // "valor:Etiqueta" por linea
  // Mapeo a BigQuery (Dataform)
  bqColumnName?: string;
  bqType?: BqType;
  bqDescription?: string;
};

const TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

function buildConfig(d: Draft) {
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
      return undefined;
  }
}

export default function QuestionnaireBuilder({
  questionnaireId,
  nextVersion,
}: {
  questionnaireId: string;
  nextVersion: number;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [d, setD] = useState<Draft>({ type: "NPS", text: "", required: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!d.text.trim()) return;
    setDrafts((s) => [...s, d]);
    setD({ type: "NPS", text: "", required: true });
  }

  async function save(publish: boolean) {
    if (drafts.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/questionnaires/${questionnaireId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publish,
          questions: drafts.map((q, i) => ({
            order: i + 1,
            type: q.type,
            text: q.text,
            required: q.required,
            equivalenceKey: q.equivalenceKey || null,
            config: buildConfig(q),
            bqColumnName: q.bqColumnName || null,
            bqType: q.bqType || null,
            bqDescription: q.bqDescription || null,
          })),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setDrafts([]);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const needsOptions = d.type === "SINGLE_CHOICE" || d.type === "MULTI_CHOICE";
  const needsRange = d.type === "LIKERT" || d.type === "NUMBER";

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">Nueva versión (v{nextVersion})</h2>

      <div className="space-y-3 rounded-md border border-dashed border-slate-300 p-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Tipo</label>
            <select
              className="input"
              value={d.type}
              onChange={(e) => setD({ ...d, type: e.target.value as QuestionType })}
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
              placeholder="ej: nps_general"
              value={d.equivalenceKey ?? ""}
              onChange={(e) => setD({ ...d, equivalenceKey: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">Texto de la pregunta</label>
          <input
            className="input"
            value={d.text}
            onChange={(e) => setD({ ...d, text: e.target.value })}
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
                onChange={(e) => setD({ ...d, min: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Máx</label>
              <input
                className="input"
                type="number"
                value={d.max ?? (d.type === "LIKERT" ? 5 : "")}
                onChange={(e) => setD({ ...d, max: Number(e.target.value) })}
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
              onChange={(e) => setD({ ...d, maxLength: Number(e.target.value) })}
            />
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
              onChange={(e) => setD({ ...d, optionsText: e.target.value })}
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.required}
            onChange={(e) => setD({ ...d, required: e.target.checked })}
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
                placeholder="ej: nps_recomendacion"
                value={d.bqColumnName ?? ""}
                onChange={(e) => setD({ ...d, bqColumnName: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Tipo de dato</label>
              <select
                className="input"
                value={d.bqType ?? defaultBqType(d.type)}
                onChange={(e) => setD({ ...d, bqType: e.target.value as BqType })}
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
              placeholder="ej: Probabilidad de recomendación (0-10)"
              value={d.bqDescription ?? ""}
              onChange={(e) => setD({ ...d, bqDescription: e.target.value })}
            />
          </div>
        </div>

        <button type="button" className="btn-secondary" onClick={add}>
          + Agregar pregunta
        </button>
      </div>

      {drafts.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {drafts.map((q, i) => (
            <li key={i} className="flex items-center justify-between">
              <span>
                <span className="font-medium">{q.text}</span>{" "}
                <span className="text-slate-400">
                  ({QUESTION_TYPE_LABELS[q.type]}
                  {q.required ? ", oblig." : ""})
                </span>
                {q.bqColumnName && (
                  <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-700">
                    BQ: {q.bqColumnName} · {q.bqType ?? defaultBqType(q.type)}
                  </span>
                )}
              </span>
              <button
                className="text-red-500"
                onClick={() => setDrafts((s) => s.filter((_, j) => j !== i))}
              >
                quitar
              </button>
            </li>
          ))}
        </ol>
      )}

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
