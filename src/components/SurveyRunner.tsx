"use client";
import { useEffect, useState } from "react";
import QuestionInput, { type ClientSection } from "./QuestionInput";
import { validateAnswers, type RawAnswer } from "@/lib/questionTypes";

const QUEUE_KEY = "igs.offlineQueue";

type Props = {
  sections: ClientSection[];
  endpoint: string; // POST {answers, presentedQuestionIds}
  title?: string;
  subtitle?: string;
  offline?: boolean; // habilita cola local (campo)
  allowFileUpload?: boolean; // muestra preguntas de carga de archivos (solo campo)
  extra?: Record<string, unknown>; // campos extra en el body (ej: workPlanId)
  onDone?: () => void;
};

type Queued = { endpoint: string; body: string; at: number };

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

async function flushQueue(): Promise<number> {
  const q = readQueue();
  if (!q.length) return 0;
  const remaining: Queued[] = [];
  for (const item of q) {
    try {
      const r = await fetch(item.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: item.body,
      });
      if (!r.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return q.length - remaining.length;
}

// Ruteo efectivo de una sección: si contiene una SINGLE_CHOICE con ruteo por opción
// y está respondida, manda la opción elegida; si no, el ruteo de la sección.
function sectionRouting(cur: ClientSection, answers: Record<string, RawAnswer>): string {
  let routing = cur.routing || "NEXT";
  for (const q of cur.questions) {
    if (q.type !== "SINGLE_CHOICE") continue;
    const opts = q.config?.options ?? [];
    if (!opts.some((o) => o.goto)) continue; // no controla ruteo
    const sel = opts.find((o) => o.value === answers[q.id]?.valueText);
    if (sel) routing = sel.goto || "NEXT";
  }
  return routing;
}

// Índice de la sección siguiente según el ruteo, o -1 si corresponde ENVIAR.
function nextIndex(
  sections: ClientSection[],
  curIdx: number,
  answers: Record<string, RawAnswer>
): number {
  const cur = sections[curIdx];
  const routing = sectionRouting(cur, answers);
  if (routing === "SUBMIT") return -1;
  let targetOrder: number | null = null;
  if (routing === "NEXT") targetOrder = cur.order + 1;
  else if (routing.startsWith("GOTO:")) targetOrder = parseInt(routing.slice(5), 10);
  if (targetOrder == null || isNaN(targetOrder)) return -1;
  return sections.findIndex((s) => s.order === targetOrder); // -1 si no existe => enviar
}

export default function SurveyRunner({
  sections,
  endpoint,
  title,
  subtitle,
  offline = false,
  allowFileUpload = false,
  extra,
  onDone,
}: Props) {
  // El QR público no muestra preguntas de carga de archivos (ni las exige).
  const visible = (s: ClientSection) =>
    allowFileUpload ? s.questions : s.questions.filter((q) => q.type !== "FILE_UPLOAD");
  const [answers, setAnswers] = useState<Record<string, RawAnswer>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<number[]>([0]);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "queued" | "error">("idle");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!offline) return;
    const sync = async () => {
      await flushQueue();
      setPending(readQueue().length);
    };
    setPending(readQueue().length);
    window.addEventListener("online", sync);
    sync();
    return () => window.removeEventListener("online", sync);
  }, [offline]);

  const curIdx = history[history.length - 1];
  const section = sections[curIdx];
  const multi = sections.length > 1 || !!section?.title;
  const goesToSubmit = section ? nextIndex(sections, curIdx, answers) < 0 : true;

  function validateCurrent(): boolean {
    const qs = visible(section);
    const raw = qs.map((q) => answers[q.id] ?? { questionId: q.id });
    const { errors: errs } = validateAnswers(qs, raw);
    // Duración entre DATETIME consecutivas: bloquear si excede 2 horas.
    const sorted = qs.slice().sort((a, b) => a.order - b.order);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].type !== "DATETIME" || sorted[i - 1].type !== "DATETIME") continue;
      const t0 = new Date(answers[sorted[i - 1].id]?.valueText ?? "").getTime();
      const t1 = new Date(answers[sorted[i].id]?.valueText ?? "").getTime();
      if (!isNaN(t0) && !isNaN(t1)) {
        const diff = (t1 - t0) / 1000;
        if (diff < 0) errs[sorted[i].id] = "La duración de medición no puede ser negativa.";
        else if (diff > 7200) errs[sorted[i].id] = "La duración de medición no puede exceder 2 horas.";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    // Preguntas efectivamente mostradas = las de las secciones del camino recorrido.
    const pathSections = history.map((i) => sections[i]);
    const presented = pathSections.flatMap((s) => visible(s).map((q) => q.id));
    const raw = presented.map((id) => answers[id] ?? { questionId: id });

    setStatus("sending");
    const body = JSON.stringify({ answers: raw, presentedQuestionIds: presented, ...extra });

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus("ok");
      onDone?.();
    } catch (e) {
      if (offline) {
        const q = readQueue();
        q.push({ endpoint, body, at: Date.now() });
        writeQueue(q);
        setPending(q.length);
        setStatus("queued");
        onDone?.();
      } else {
        setStatus("error");
      }
    }
  }

  function onNext() {
    if (!validateCurrent()) return;
    const nxt = nextIndex(sections, curIdx, answers);
    if (nxt < 0) {
      submit();
    } else {
      setErrors({});
      setHistory((h) => [...h, nxt]);
      window.scrollTo({ top: 0 });
    }
  }

  function onBack() {
    setErrors({});
    setHistory((h) => h.slice(0, -1));
    window.scrollTo({ top: 0 });
  }

  function reset() {
    setAnswers({});
    setErrors({});
    setHistory([0]);
    setStatus("idle");
  }

  if (status === "ok" || status === "queued") {
    return (
      <div className="card text-center">
        <h2 className="text-lg font-semibold">¡Gracias!</h2>
        <p className="text-slate-600">
          {status === "ok"
            ? "Respuesta registrada."
            : "Sin conexión: respuesta guardada y se sincronizará automáticamente."}
        </p>
        <button className="btn mt-4" onClick={reset}>
          Nueva respuesta
        </button>
      </div>
    );
  }

  if (!section) return null;

  return (
    <div className="space-y-4">
      {title && (
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-slate-600">{subtitle}</p>}
        </div>
      )}

      {offline && pending > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {pending} respuesta(s) pendiente(s) de sincronizar.
        </p>
      )}

      {multi && (section.title || section.description) && (
        <div className="rounded-md border-l-4 border-brand-500 bg-brand-50/50 px-3 py-2">
          {section.title && <h2 className="font-semibold text-brand-800">{section.title}</h2>}
          {section.description && (
            <p className="text-sm text-slate-600">{section.description}</p>
          )}
        </div>
      )}

      {visible(section)
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((q, i, arr) => {
          const prev = arr[i - 1];
          const prevDatetime =
            prev && prev.type === "DATETIME" && q.type === "DATETIME"
              ? answers[prev.id]?.valueText ?? undefined
              : undefined;
          return (
            <QuestionInput
              key={q.id}
              q={q}
              value={answers[q.id] ?? { questionId: q.id }}
              error={errors[q.id]}
              canUpload={allowFileUpload}
              prevDatetime={prevDatetime}
              onChange={(v) => setAnswers((s) => ({ ...s, [q.id]: v }))}
            />
          );
        })}

      {status === "error" && (
        <p className="text-sm text-red-600">Error al enviar. Intenta de nuevo.</p>
      )}

      <div className="flex gap-3">
        {history.length > 1 && (
          <button className="btn-secondary" onClick={onBack} disabled={status === "sending"}>
            ← Atrás
          </button>
        )}
        <button className="btn flex-1" disabled={status === "sending"} onClick={onNext}>
          {status === "sending"
            ? "Enviando…"
            : goesToSubmit
            ? "Enviar respuestas"
            : "Siguiente →"}
        </button>
      </div>
    </div>
  );
}
