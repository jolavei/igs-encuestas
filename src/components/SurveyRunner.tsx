"use client";
import { useEffect, useRef, useState } from "react";
import QuestionInput, { type ClientSection } from "./QuestionInput";
import SurveyFooter from "./SurveyFooter";
import { validateAnswers, type RawAnswer } from "@/lib/questionTypes";

const QUEUE_KEY = "igs.offlineQueue";

// Candado anti-duplicado del QR público (capa cliente): una respuesta por dispositivo
// cada 24 h. Se refuerza con la cookie httpOnly del servidor (ver lib/onceGuard); cada
// capa cubre a la otra si el navegador bloquea localStorage o las cookies.
const LOCK_PREFIX = "igs.answered.";
const LOCK_MS = 24 * 60 * 60 * 1000; // 24 h

function isAnswered(key: string): boolean {
  try {
    const ts = Number(localStorage.getItem(LOCK_PREFIX + key) ?? "0");
    return ts > 0 && Date.now() - ts < LOCK_MS;
  } catch {
    return false;
  }
}
function markAnswered(key: string) {
  try {
    localStorage.setItem(LOCK_PREFIX + key, String(Date.now()));
  } catch {
    /* localStorage no disponible: la cookie httpOnly del servidor hace de respaldo */
  }
}

// UUID v4 para idempotencia del envío. Se genera uno por respuesta y viaja en el
// body; si un reintento o el reenvío de la cola offline usa el mismo id, el servidor
// devuelve el envío existente en vez de crear un duplicado.
function makeSubmissionId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* sin crypto.randomUUID (contexto no seguro / navegador antiguo): cae al fallback */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type Props = {
  sections: ClientSection[];
  endpoint: string; // POST {answers, presentedQuestionIds}
  title?: string;
  subtitle?: string;
  offline?: boolean; // habilita cola local (campo)
  allowFileUpload?: boolean; // muestra preguntas de carga de archivos (solo campo)
  extra?: Record<string, unknown>; // campos extra en el body (ej: workPlanId)
  onDone?: () => void;
  // Si se define, activa "una respuesta por dispositivo cada 24 h" (QR público).
  // Es la clave del candado en localStorage; usar el token del QR.
  lockKey?: string;
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

// Cuenta cuántas secciones faltan desde `startIdx` hasta ENVIAR, siguiendo el ruteo
// POR DEFECTO de cada sección (con respuestas vacías). Al ignorar las respuestas, el
// porcentaje de avance no cambia mientras el encuestado responde la sección actual;
// solo se recalcula al pasar de sección (donde el salto real ya quedó en el historial).
function stepsToSubmit(sections: ClientSection[], startIdx: number): number {
  let idx = startIdx;
  let count = 0;
  const seen = new Set<number>();
  while (idx >= 0 && !seen.has(idx)) {
    seen.add(idx);
    const nxt = nextIndex(sections, idx, {}); // {} = sin respuestas => ruteo por defecto
    if (nxt < 0) break; // corresponde ENVIAR
    count++;
    idx = nxt;
  }
  return count;
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
  lockKey,
}: Props) {
  // El QR público no muestra preguntas de carga de archivos (ni las exige).
  const visible = (s: ClientSection) =>
    allowFileUpload ? s.questions : s.questions.filter((q) => q.type !== "FILE_UPLOAD");
  const [answers, setAnswers] = useState<Record<string, RawAnswer>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<number[]>([0]);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "queued" | "error">("idle");
  const [pending, setPending] = useState(0);
  // Id de idempotencia de la respuesta en curso (estable entre reintentos; se renueva
  // al iniciar una respuesta nueva en reset()).
  const submissionId = useRef<string | null>(null);
  if (submissionId.current === null) submissionId.current = makeSubmissionId();

  // Candado por dispositivo (solo QR público). lockChecked evita el parpadeo del
  // formulario antes de leer localStorage; locked muestra "ya respondiste".
  const [locked, setLocked] = useState(false);
  const [lockChecked, setLockChecked] = useState(!lockKey);
  useEffect(() => {
    if (!lockKey) return;
    setLocked(isAnswered(lockKey));
    setLockChecked(true);
  }, [lockKey]);

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

  // Barra de progreso: solo para cuestionarios con varias secciones.
  // Avance = secciones recorridas / (recorridas + faltantes proyectadas). Las
  // faltantes se proyectan por ruteo por defecto (ver stepsToSubmit), así el % no
  // se mueve al elegir una opción; se ajusta recién al pasar a la siguiente sección.
  const multiSection = sections.length > 1;
  const visitedSteps = history.length;
  const remainingSteps = multiSection ? stepsToSubmit(sections, curIdx) : 0;
  const progressPct = Math.round((visitedSteps / (visitedSteps + remainingSteps)) * 100);

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
    const body = JSON.stringify({
      answers: raw,
      presentedQuestionIds: presented,
      ...extra,
      clientSubmissionId: submissionId.current,
    });

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!r.ok) throw new Error(await r.text());
      if (lockKey) markAnswered(lockKey);
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
    // Nueva respuesta = nuevo id de idempotencia.
    submissionId.current = makeSubmissionId();
  }

  // Evita mostrar el formulario un instante antes de resolver el candado local.
  if (lockKey && !lockChecked) return null;

  if (status === "ok" || status === "queued") {
    return (
      <div className="my-6 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm sm:px-8">
        <h2 className="text-lg font-semibold">¡Gracias!</h2>
        <p className="mt-1 text-sm text-slate-600">
          {status === "ok"
            ? "Respuesta registrada."
            : "Sin conexión: respuesta guardada y se sincronizará automáticamente."}
        </p>
        {/* En el QR público no se ofrece "Nueva respuesta": una por dispositivo. */}
        {!lockKey && (
          <button className="btn mt-6" onClick={reset}>
            Nueva respuesta
          </button>
        )}
        <SurveyFooter />
      </div>
    );
  }

  // Ya respondió desde este dispositivo en las últimas 24 h (candado local).
  if (lockKey && locked) {
    return (
      <div className="my-6 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm sm:px-8">
        <h2 className="text-lg font-semibold">Ya registramos tu respuesta</h2>
        <p className="mt-1 text-sm text-slate-600">
          Gracias por participar. Solo se admite una respuesta por dispositivo.
        </p>
        <SurveyFooter />
      </div>
    );
  }

  if (!section) return null;

  return (
    <div className="my-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8">
      {title && (
        <div className="pb-2">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      )}

      {multiSection && (
        <div className="pb-4 pt-1">
          <div className="mb-1.5 text-right text-xs font-medium text-slate-500">
            {progressPct}%
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {offline && pending > 0 && (
        <p className="pb-2 text-sm text-amber-700">
          {pending} respuesta(s) pendiente(s) de sincronizar.
        </p>
      )}

      {multi && (section.title || section.description) && (
        <div className="pb-1 pt-3">
          {section.title && (
            <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
          )}
          {section.description && (
            <p className="mt-0.5 text-sm text-slate-500">{section.description}</p>
          )}
        </div>
      )}

      {/* Las preguntas van sobre el mismo fondo blanco, separadas solo por una línea fina. */}
      <div className="divide-y divide-slate-100 border-t border-slate-100">
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
      </div>

      {status === "error" && (
        <p className="pt-4 text-sm text-red-600">Error al enviar. Intenta de nuevo.</p>
      )}

      <div className="flex justify-center gap-3 pt-6">
        {history.length > 1 && (
          <button className="btn-secondary" onClick={onBack} disabled={status === "sending"}>
            ← Atrás
          </button>
        )}
        <button className="btn w-1/2" disabled={status === "sending"} onClick={onNext}>
          {status === "sending"
            ? "Enviando…"
            : goesToSubmit
            ? "Enviar respuestas"
            : "Siguiente →"}
        </button>
      </div>

      <SurveyFooter />
    </div>
  );
}
