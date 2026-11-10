"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  QUESTION_TYPE_LABELS,
  BUILDER_QUESTION_TYPES,
  hasOptions,
  type QuestionType,
} from "@/lib/questionTypes";
import { BQ_TYPES, defaultBqType, type BqType } from "@/lib/dataform";
import { CopyIcon, TrashIcon } from "@/components/icons";

// Opción de una pregunta. goto (solo SINGLE_CHOICE): "NEXT" | "SUBMIT" | "GOTO:<sectionKey>".
// labelEn: etiqueta en inglés (encuesta bilingüe); lo que se guarda sigue siendo la
// etiqueta en español.
export type OptionDraft = { label: string; labelEn?: string; goto: string };

export type Draft = {
  key: string;
  type: QuestionType;
  text: string;
  textEn?: string; // traducción (encuesta bilingüe)
  required: boolean;
  options?: OptionDraft[]; // SINGLE_CHOICE / MULTI_CHOICE / DROPDOWN
  maxStars?: number; // RATING
  maxLength?: number; // TEXT / PARAGRAPH
  afterKey?: string; // DATETIME: debe ser posterior a esta otra pregunta
  min?: number; // LIKERT: valor inicial de la escala (NUMBER legado)
  max?: number; // LIKERT: valor final de la escala (NUMBER legado)
  flowProcesses?: string[]; // FLOW_MEASUREMENT: opciones del desplegable de proceso
  flowAirlines?: string[]; // FLOW_MEASUREMENT: opciones del desplegable de aerolínea
  bqColumnName?: string;
  bqType?: BqType;
  bqDescription?: string;
};

export type SectionDraft = {
  key: string;
  title: string;
  description?: string;
  titleEn?: string;
  descriptionEn?: string;
  routing: string; // "NEXT" | "SUBMIT" | "GOTO:<sectionKey>"
  questions: Draft[];
};

// Texto que no necesita traducción: sin letras minúsculas (códigos IATA como "SCL",
// "LATAM - LA/LU", números). Si no se traduce, se muestra igual en ambos idiomas.
function isNeutral(s: string): boolean {
  return !/[a-záéíóúüñ]/.test(s);
}
// ¿Falta el inglés de este texto? (vacío en español = no hay nada que traducir)
function missingEn(es: string | undefined, en: string | undefined): boolean {
  const t = (es ?? "").trim();
  return !!t && !isNeutral(t) && !(en ?? "").trim();
}

// Campo de traducción al inglés, bajo el texto en español. Resaltado si falta.
function EnInput({
  value,
  source,
  onChange,
  placeholder,
  className = "",
}: {
  value: string | undefined;
  source: string | undefined;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const missing = missingEn(source, value);
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span className="w-7 shrink-0 rounded border border-accent px-0.5 py-0.5 text-center text-[10px] font-bold text-accent">
        EN
      </span>
      <input
        className={`input min-w-0 flex-1 ${missing ? "border-amber-400 bg-amber-50" : "bg-white"}`}
        placeholder={placeholder}
        value={value ?? ""}
        data-en-missing={missing ? "1" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

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
          const base: { value: string; label: string; labelEn?: string; goto?: string } = {
            value: o.label.trim(),
            label: o.label.trim(),
          };
          if (o.labelEn?.trim()) base.labelEn = o.labelEn.trim();
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
    case "FLOW_MEASUREMENT": {
      const clean = (xs?: string[]) =>
        Array.from(new Set((xs ?? []).map((x) => x.trim()).filter(Boolean)));
      const cfg: Record<string, unknown> = {};
      const procs = clean(d.flowProcesses);
      const airlines = clean(d.flowAirlines);
      if (procs.length) cfg.flowProcesses = procs;
      if (airlines.length) cfg.flowAirlines = airlines;
      return cfg;
    }
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
  bilingual,
}: {
  type: QuestionType;
  options: OptionDraft[];
  onChange: (opts: OptionDraft[]) => void;
  sectionTargets: { key: string; label: string }[];
  showRouting: boolean;
  bilingual: boolean;
}) {
  const marker = type === "MULTI_CHOICE" ? "▢" : type === "DROPDOWN" ? "" : "○";
  const list = options.length ? options : [emptyOption()];
  const setAt = (i: number, patch: Partial<OptionDraft>) =>
    onChange(list.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <div className="space-y-2">
      {list.map((opt, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="w-5 shrink-0 text-center text-slate-400">
            {type === "DROPDOWN" ? `${i + 1}.` : marker}
          </span>
          <input
            className="input min-w-0 flex-1"
            placeholder={`Opción ${i + 1}`}
            value={opt.label}
            onChange={(e) => setAt(i, { label: e.target.value })}
          />
          {bilingual && (
            <EnInput
              className="w-full sm:w-auto sm:flex-1"
              value={opt.labelEn}
              source={opt.label}
              placeholder={`Opción ${i + 1} en inglés`}
              onChange={(v) => setAt(i, { labelEn: v })}
            />
          )}
          {showRouting && (
            <select
              // En móvil baja a línea propia a ancho completo (order-last + w-full);
              // en escritorio vuelve a la misma fila con ancho fijo.
              className="input order-last w-full text-sm sm:order-none sm:w-44 sm:shrink-0"
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

// Vista previa estática de la captura de medición de flujo.
function FlowPreviewBox() {
  return (
    <div className="space-y-2 rounded-md border border-dashed border-slate-300 p-3 text-center text-sm text-slate-400">
      <div>Proceso · Aerolínea · Pasajeros en fila · cronómetro 00:00:00</div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <span className="rounded border border-slate-200 py-1">En fila</span>
        <span className="rounded border border-slate-200 py-1">Entraron</span>
        <span className="rounded border border-slate-200 py-1">Salieron</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
        <span className="rounded bg-emerald-50 py-2 text-emerald-600">Entra</span>
        <span className="rounded bg-red-50 py-2 text-red-600">Sale</span>
      </div>
      <div className="text-xs">Solo en levantamiento de campo (no aparece en el QR público).</div>
    </div>
  );
}

// ---- Vista previa del formato de respuesta según el tipo ----
function AnswerPreview({
  d,
  onChange,
  sectionTargets,
  bilingual,
}: {
  d: Draft;
  onChange: (patch: Partial<Draft>) => void;
  sectionTargets: { key: string; label: string }[];
  bilingual: boolean;
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
          bilingual={bilingual}
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
          <div className="flex flex-wrap items-start justify-center gap-3 py-1">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-slate-400">N/A</span>
              <span className="h-3.5 w-3.5 rounded border border-slate-300" />
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
    case "FLOW_MEASUREMENT":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-600">
              Procesos a medir <span className="text-slate-400">(uno por línea)</span>
              <textarea
                className="input mt-1"
                rows={4}
                placeholder={"Check-in\nControl de seguridad\nEmbarque"}
                value={(d.flowProcesses ?? []).join("\n")}
                onChange={(e) => onChange({ flowProcesses: e.target.value.split("\n") })}
              />
            </label>
            <label className="block text-sm text-slate-600">
              Aerolíneas <span className="text-slate-400">(uno por línea, opcional)</span>
              <textarea
                className="input mt-1"
                rows={4}
                placeholder={"LATAM\nSKY\nJetSMART"}
                value={(d.flowAirlines ?? []).join("\n")}
                onChange={(e) => onChange({ flowAirlines: e.target.value.split("\n") })}
              />
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Cada lista se muestra como un desplegable antes de iniciar la medición (vacía = no se
            muestra). El de aerolínea incluye «No aplica».
          </p>
          <FlowPreviewBox />
        </div>
      );
    case "NPS":
      return (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <span
              key={n}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-400"
            >
              {n}
            </span>
          ))}
        </div>
      );
    case "LIKERT": {
      const min = d.min ?? 1;
      const max = d.max ?? 5;
      const range = max >= min ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [];
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              Desde
              <input
                className="input shrink-0"
                style={{ width: "5rem" }}
                type="number"
                value={min}
                onChange={(e) => onChange({ min: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-2">
              Hasta
              <input
                className="input shrink-0"
                style={{ width: "5rem" }}
                type="number"
                value={max}
                onChange={(e) => onChange({ max: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {range.map((n) => (
              <span
                key={n}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-400"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      );
    }
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
  bilingual,
}: {
  d: Draft;
  index: number;
  total: number;
  bilingual: boolean;
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
          {bilingual && (
            <EnInput
              className="sm:col-span-2"
              value={d.textEn}
              source={d.text}
              placeholder="Pregunta en inglés"
              onChange={(v) => onChange({ textEn: v })}
            />
          )}
        </div>
      </div>

      <div className="pl-8">
        <AnswerPreview
          d={d}
          onChange={onChange}
          sectionTargets={sectionTargets}
          bilingual={bilingual}
        />

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
  bilingual = false,
}: {
  questionnaireId: string;
  nextVersion: number;
  initialSections?: SectionDraft[];
  // Encuesta bilingüe: muestra los campos en inglés y la barra de traducción.
  bilingual?: boolean;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionDraft[]>(
    initialSections.length ? initialSections : [newSection()]
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // true si el contenido es el de la última versión (precargado o con "Cargar vN"):
  // habilita "Guardar solo inglés en vN".
  const [loadedLatest, setLoadedLatest] = useState(initialSections.length > 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevVersion = nextVersion - 1;

  // ---- Traducción: qué falta en inglés ----
  function translationSlots(ss: SectionDraft[]): { es: string; en: string | undefined; apply: (ss: SectionDraft[], v: string) => SectionDraft[] }[] {
    const out: { es: string; en: string | undefined; apply: (ss: SectionDraft[], v: string) => SectionDraft[] }[] = [];
    const mapS = (ss: SectionDraft[], sk: string, fn: (s: SectionDraft) => SectionDraft) =>
      ss.map((s) => (s.key === sk ? fn(s) : s));
    const mapQ = (ss: SectionDraft[], sk: string, qk: string, fn: (q: Draft) => Draft) =>
      mapS(ss, sk, (s) => ({ ...s, questions: s.questions.map((q) => (q.key === qk ? fn(q) : q)) }));
    for (const s of ss) {
      out.push({ es: s.title, en: s.titleEn, apply: (x, v) => mapS(x, s.key, (y) => ({ ...y, titleEn: v })) });
      if (s.description)
        out.push({ es: s.description, en: s.descriptionEn, apply: (x, v) => mapS(x, s.key, (y) => ({ ...y, descriptionEn: v })) });
      for (const q of s.questions) {
        out.push({ es: q.text, en: q.textEn, apply: (x, v) => mapQ(x, s.key, q.key, (y) => ({ ...y, textEn: v })) });
        if (hasOptions(q.type))
          (q.options ?? []).forEach((o, i) =>
            out.push({
              es: o.label,
              en: o.labelEn,
              apply: (x, v) =>
                mapQ(x, s.key, q.key, (y) => ({
                  ...y,
                  options: (y.options ?? []).map((oo, j) => (j === i ? { ...oo, labelEn: v } : oo)),
                })),
            })
          );
      }
    }
    return out;
  }
  const slots = bilingual ? translationSlots(sections) : [];
  const toTranslate = slots.filter((x) => (x.es ?? "").trim() && !isNeutral(x.es.trim()));
  const missing = toTranslate.filter((x) => missingEn(x.es, x.en));
  const pctDone = toTranslate.length
    ? Math.round(((toTranslate.length - missing.length) / toTranslate.length) * 100)
    : 100;

  function focusMissing() {
    const el = rootRef.current?.querySelector<HTMLInputElement>('[data-en-missing="1"]');
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  }

  async function autoTranslate() {
    if (!missing.length) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      // Textos únicos (las opciones "Sí/No" o "Relación precio–calidad" se repiten).
      const uniq = Array.from(new Set(missing.map((m) => m.es.trim())));
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: uniq }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "No se pudo traducir.");
      const byEs = new Map<string, string>(uniq.map((u, i) => [u, data.translations?.[i] ?? ""]));
      setSections((ss) => {
        let next = ss;
        // Se recalcula sobre el estado actual y solo se llenan campos aún vacíos.
        for (const slot of translationSlots(ss)) {
          if (!missingEn(slot.es, slot.en)) continue;
          const v = byEs.get(slot.es.trim());
          if (v) next = slot.apply(next, v);
        }
        return next;
      });
      setInfo(
        `Se tradujeron ${missing.length} texto(s). Es un borrador: revísalo antes de guardar.`
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

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

  // Arma el payload de secciones (orden, ruteo, config). Devuelve un string si hay error.
  function buildPayload() {
    const cleanSections = sections
      .map((s) => ({ ...s, questions: s.questions.filter((q) => q.text.trim()) }))
      .filter((s) => s.questions.length > 0);
    if (cleanSections.length === 0) return "Agrega al menos una pregunta con texto.";
    for (const s of cleanSections)
      for (const q of s.questions)
        if (hasOptions(q.type) && (q.options ?? []).filter((o) => o.label.trim()).length === 0)
          return `La pregunta "${q.text}" necesita al menos una opción.`;

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

    return cleanSections.map((s, si) => ({
        order: si + 1,
        title: s.title || "",
        description: s.description || null,
        titleEn: s.titleEn?.trim() || null,
        descriptionEn: s.description ? s.descriptionEn?.trim() || null : null,
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
            textEn: q.textEn?.trim() || null,
            required: q.required,
            config,
            bqColumnName: q.bqColumnName || null,
            bqType: q.bqType || null,
            bqDescription: q.bqDescription || null,
          };
        }),
      }));
  }

  async function save(publish: boolean) {
    const payloadSections = buildPayload();
    if (typeof payloadSections === "string") {
      setError(payloadSections);
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(`/api/questionnaires/${questionnaireId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish, note: note || null, sections: payloadSections }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setSections([newSection()]);
      setNote("");
      setLoadedLatest(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Guarda SOLO el inglés en la última versión (sin crear una nueva). El servidor
  // rechaza si el contenido en español cambió (eso sí requiere versión nueva).
  async function saveTranslations() {
    const payloadSections = buildPayload();
    if (typeof payloadSections === "string") {
      setError(payloadSections);
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(`/api/questionnaires/${questionnaireId}/translations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strict: true,
          sections: payloadSections.map((s) => ({
            order: s.order,
            title: s.title,
            titleEn: s.titleEn,
            descriptionEn: s.descriptionEn,
            questions: s.questions.map((q) => ({
              order: q.order,
              text: q.text,
              textEn: q.textEn,
              options: (
                (q.config as { options?: { value: string; labelEn?: string }[] } | null)
                  ?.options ?? []
              ).map((o) => ({ value: o.value, labelEn: o.labelEn ?? null })),
            })),
          })),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail =
          Array.isArray(data.mismatches) && data.mismatches.length
            ? ` (${data.mismatches.slice(0, 3).join(" ")})`
            : "";
        throw new Error((data.error ?? "Error") + detail);
      }
      setInfo(`Traducción guardada en la v${data.versionNumber}, sin crear una versión nueva.`);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4" ref={rootRef}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Nueva versión (v{nextVersion})</h2>
        {initialSections.length > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSections(initialSections);
              setLoadedLatest(true);
            }}
            title={`Cargar las preguntas de la v${prevVersion}`}
          >
            Cargar v{prevVersion}
          </button>
        )}
      </div>

      {bilingual && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <p className="text-sm text-slate-700">
                {missing.length === 0 ? (
                  <>Inglés: todo traducido</>
                ) : (
                  <>
                    Inglés: <b>{missing.length}</b> de {toTranslate.length} texto(s) sin traducir
                    <span className="text-slate-400"> · se muestran en español</span>
                  </>
                )}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pctDone}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={!missing.length}
                onClick={focusMissing}
              >
                Ver faltantes
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !missing.length}
                onClick={autoTranslate}
              >
                Traducir automáticamente
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Lo que se guarda en las respuestas es siempre el texto en español. Los códigos sin
            minúsculas (SCL, LATAM - LA/LU) no necesitan traducción.
          </p>
        </div>
      )}

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
            {bilingual && (
              <EnInput
                className="mb-3"
                value={s.titleEn}
                source={s.title}
                placeholder="Título de la sección en inglés"
                onChange={(v) => patchSection(s.key, { titleEn: v })}
              />
            )}
            <input
              className="input mb-3 bg-white text-sm"
              placeholder="Descripción de la sección (opcional)"
              value={s.description ?? ""}
              onChange={(e) => patchSection(s.key, { description: e.target.value })}
            />
            {bilingual && s.description?.trim() && (
              <EnInput
                className="mb-3"
                value={s.descriptionEn}
                source={s.description}
                placeholder="Descripción en inglés"
                onChange={(v) => patchSection(s.key, { descriptionEn: v })}
              />
            )}

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
                  bilingual={bilingual}
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
        <label className="label">Comentario del cambio</label>
        <textarea
          className="input"
          rows={2}
          placeholder="ej: Se agregó una sección para pasajeros frecuentes."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-emerald-700">{info}</p>}

      <div className="flex flex-wrap gap-3">
        <button className="btn" disabled={busy} onClick={() => save(true)}>
          Publicar versión
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => save(false)}>
          Guardar borrador
        </button>
        {bilingual && loadedLatest && prevVersion > 0 && (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={saveTranslations}
            title={`Guarda solo los textos en inglés en la v${prevVersion}, sin crear una versión nueva`}
          >
            Guardar solo inglés en v{prevVersion}
          </button>
        )}
      </div>
    </div>
  );
}
