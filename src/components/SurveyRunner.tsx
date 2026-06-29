"use client";
import { useEffect, useState } from "react";
import QuestionInput, { type ClientQuestion } from "./QuestionInput";
import { validateAnswers, type RawAnswer } from "@/lib/questionTypes";

const QUEUE_KEY = "igs.offlineQueue";

type Props = {
  questions: ClientQuestion[];
  endpoint: string; // POST {answers}
  title?: string;
  subtitle?: string;
  offline?: boolean; // habilita cola local (campo)
  extra?: Record<string, unknown>; // campos extra en el body (ej: assignmentId)
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

export default function SurveyRunner({
  questions,
  endpoint,
  title,
  subtitle,
  offline = false,
  extra,
  onDone,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, RawAnswer>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "queued" | "error">(
    "idle"
  );
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

  async function submit() {
    const raw = questions.map((q) => answers[q.id] ?? { questionId: q.id });
    const { ok, errors: errs } = validateAnswers(questions, raw);
    setErrors(errs);
    if (!ok) return;

    setStatus("sending");
    const body = JSON.stringify({ answers: raw, ...extra });

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!r.ok) throw new Error(await r.text());
      setStatus("ok");
      setAnswers({});
      onDone?.();
    } catch (e) {
      if (offline) {
        const q = readQueue();
        q.push({ endpoint, body, at: Date.now() });
        writeQueue(q);
        setPending(q.length);
        setStatus("queued");
        setAnswers({});
        onDone?.();
      } else {
        setStatus("error");
      }
    }
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
        <button className="btn mt-4" onClick={() => setStatus("idle")}>
          Nueva respuesta
        </button>
      </div>
    );
  }

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

      {questions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((q) => (
          <QuestionInput
            key={q.id}
            q={q}
            value={answers[q.id] ?? { questionId: q.id }}
            error={errors[q.id]}
            onChange={(v) => setAnswers((s) => ({ ...s, [q.id]: v }))}
          />
        ))}

      {status === "error" && (
        <p className="text-sm text-red-600">Error al enviar. Intenta de nuevo.</p>
      )}

      <button className="btn w-full" disabled={status === "sending"} onClick={submit}>
        {status === "sending" ? "Enviando…" : "Enviar respuestas"}
      </button>
    </div>
  );
}
