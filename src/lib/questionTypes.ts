// Tipos de pregunta + validacion de respuesta. Compartido cliente/servidor.
import { z } from "zod";

export type QuestionType =
  | "LIKERT"
  | "NPS"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "TEXT"
  | "DATETIME"
  | "NUMBER";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  LIKERT: "Escala Likert",
  NPS: "NPS (0-10)",
  SINGLE_CHOICE: "Selección única",
  MULTI_CHOICE: "Selección múltiple",
  TEXT: "Texto libre",
  DATETIME: "Fecha y hora",
  NUMBER: "Numérico",
};

export type Option = { value: string; label: string };

// Config por pregunta (validaciones). Todo opcional segun tipo.
export type QuestionConfig = {
  min?: number; // LIKERT/NUMBER
  max?: number; // LIKERT/NUMBER
  step?: number; // NUMBER
  maxLength?: number; // TEXT
  options?: Option[]; // SINGLE_CHOICE/MULTI_CHOICE
  multi?: boolean;
  // DATETIME: esta fecha/hora debe ser POSTERIOR a la de la pregunta con este 'order'
  // (ej. t2 posterior a t1). Validación cruzada entre preguntas de la misma versión.
  afterQuestionOrder?: number;
};

// Forma de un answer crudo que llega desde el form.
export type RawAnswer = {
  questionId: string;
  valueNumber?: number | null;
  valueText?: string | null;
  valueDate?: string | null; // ISO
  valueJson?: unknown;
};

export type QuestionLike = {
  id: string;
  type: QuestionType;
  required: boolean;
  config: QuestionConfig | null;
  order?: number; // para validación cruzada (afterQuestionOrder)
  text?: string; // para mensajes de error legibles
};

export type ValidatedAnswer = {
  questionId: string;
  valueNumber: number | null;
  valueText: string | null;
  valueDate: Date | null;
  valueJson: unknown | null;
};

function isEmpty(a: RawAnswer): boolean {
  return (
    (a.valueNumber === undefined || a.valueNumber === null) &&
    (a.valueText === undefined || a.valueText === null || a.valueText === "") &&
    (a.valueDate === undefined || a.valueDate === null || a.valueDate === "") &&
    (a.valueJson === undefined ||
      a.valueJson === null ||
      (Array.isArray(a.valueJson) && a.valueJson.length === 0))
  );
}

/**
 * Valida un conjunto de respuestas contra las preguntas de una version.
 * Devuelve { ok, errors, answers } — answers ya normalizado para persistir.
 */
export function validateAnswers(
  questions: QuestionLike[],
  raw: RawAnswer[]
): { ok: boolean; errors: Record<string, string>; answers: ValidatedAnswer[] } {
  const byId = new Map(raw.map((r) => [r.questionId, r]));
  const errors: Record<string, string> = {};
  const answers: ValidatedAnswer[] = [];

  for (const q of questions) {
    const a = byId.get(q.id);
    const cfg = q.config ?? {};

    if (!a || isEmpty(a)) {
      if (q.required) errors[q.id] = "Esta pregunta es obligatoria.";
      continue;
    }

    const out: ValidatedAnswer = {
      questionId: q.id,
      valueNumber: null,
      valueText: null,
      valueDate: null,
      valueJson: null,
    };

    switch (q.type) {
      case "NPS": {
        const n = Number(a.valueNumber);
        if (!Number.isInteger(n) || n < 0 || n > 10) {
          errors[q.id] = "NPS debe ser entero 0-10.";
          break;
        }
        out.valueNumber = n;
        break;
      }
      case "LIKERT": {
        const min = cfg.min ?? 1;
        const max = cfg.max ?? 5;
        const n = Number(a.valueNumber);
        if (!Number.isFinite(n) || n < min || n > max) {
          errors[q.id] = `Valor fuera de rango (${min}-${max}).`;
          break;
        }
        out.valueNumber = n;
        break;
      }
      case "NUMBER": {
        const n = Number(a.valueNumber);
        if (!Number.isFinite(n)) {
          errors[q.id] = "Debe ser numérico.";
          break;
        }
        if (cfg.min != null && n < cfg.min) errors[q.id] = `Mínimo ${cfg.min}.`;
        if (cfg.max != null && n > cfg.max) errors[q.id] = `Máximo ${cfg.max}.`;
        out.valueNumber = n;
        break;
      }
      case "TEXT": {
        const t = String(a.valueText ?? "");
        if (cfg.maxLength != null && t.length > cfg.maxLength) {
          errors[q.id] = `Máximo ${cfg.maxLength} caracteres.`;
          break;
        }
        out.valueText = t;
        break;
      }
      case "DATETIME": {
        const d = new Date(String(a.valueDate ?? a.valueText));
        if (isNaN(d.getTime())) {
          errors[q.id] = "Fecha inválida.";
          break;
        }
        // Validación cruzada: debe ser posterior a otra medición (ej. t2 > t1).
        if (cfg.afterQuestionOrder != null) {
          const ref = questions.find((qq) => qq.order === cfg.afterQuestionOrder);
          const refRaw = ref ? byId.get(ref.id) : undefined;
          const refDate = refRaw
            ? new Date(String(refRaw.valueDate ?? refRaw.valueText))
            : null;
          if (refDate && !isNaN(refDate.getTime()) && d <= refDate) {
            errors[q.id] = `Debe ser posterior a "${ref?.text ?? "la medición anterior"}".`;
            break;
          }
        }
        out.valueDate = d;
        break;
      }
      case "SINGLE_CHOICE": {
        const v = String(a.valueText ?? "");
        const opts = (cfg.options ?? []).map((o) => o.value);
        if (!opts.includes(v)) {
          errors[q.id] = "Opción inválida.";
          break;
        }
        out.valueText = v;
        break;
      }
      case "MULTI_CHOICE": {
        const arr = Array.isArray(a.valueJson) ? (a.valueJson as string[]) : [];
        const opts = new Set((cfg.options ?? []).map((o) => o.value));
        if (arr.some((v) => !opts.has(v))) {
          errors[q.id] = "Una o más opciones inválidas.";
          break;
        }
        out.valueJson = arr;
        break;
      }
    }

    if (!errors[q.id]) answers.push(out);
  }

  return { ok: Object.keys(errors).length === 0, errors, answers };
}

// Schema zod del payload de envio.
// Límites de tamaño (defensa en profundidad: rechaza payloads abusivos antes de tocar la DB).
export const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().max(60),
        valueNumber: z.number().finite().nullable().optional(),
        valueText: z.string().max(5000).nullable().optional(),
        valueDate: z.string().max(40).nullable().optional(),
        valueJson: z.array(z.string().max(200)).max(100).optional(),
      })
    )
    .max(300), // tope de respuestas por envío
});
