// Tipos de pregunta + validacion de respuesta. Compartido cliente/servidor.
import { z } from "zod";

export type QuestionType =
  // Tipos ofrecidos en el constructor (estilo Google Forms):
  | "TEXT" // Respuesta corta
  | "PARAGRAPH" // Párrafo
  | "SINGLE_CHOICE" // Opción múltiple (una respuesta)
  | "MULTI_CHOICE" // Casillas de verificación (varias)
  | "DROPDOWN" // Lista desplegable (una respuesta)
  | "FILE_UPLOAD" // Carga de archivos (a Drive/GCS)
  | "RATING" // Calificación (estrellas)
  | "DATETIME" // Fecha-Hora-Minuto-Segundo
  | "NPS" // Escala NPS (0-10)
  | "LIKERT" // Escala Likert (min-max)
  | "FLOW_MEASUREMENT" // Medición de flujo (fila + cronómetro + entradas/salidas)
  // Legado: NO se ofrece en el constructor nuevo; se conserva para leer/mostrar
  // versiones históricas y sus dashboards.
  | "NUMBER";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  TEXT: "Respuesta corta",
  PARAGRAPH: "Párrafo",
  SINGLE_CHOICE: "Opción múltiple",
  MULTI_CHOICE: "Casillas de verificación",
  DROPDOWN: "Lista desplegable",
  FILE_UPLOAD: "Carga de archivos",
  RATING: "Calificación",
  DATETIME: "Fecha-Hora-Minuto-Segundo",
  FLOW_MEASUREMENT: "Medición de flujo",
  // Legado
  NPS: "NPS (0-10)",
  LIKERT: "Escala Likert",
  NUMBER: "Numérico",
};

// Tipos que se ofrecen en el constructor nuevo, en orden.
export const BUILDER_QUESTION_TYPES: QuestionType[] = [
  "TEXT",
  "PARAGRAPH",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "DROPDOWN",
  "FILE_UPLOAD",
  "RATING",
  "NPS",
  "LIKERT",
  "DATETIME",
  "FLOW_MEASUREMENT",
];

// Tipos que solo tienen sentido en levantamiento de campo (no se muestran en el QR público).
export const FIELD_ONLY_TYPES: QuestionType[] = ["FILE_UPLOAD", "FLOW_MEASUREMENT"];

// Tipos que usan lista de opciones (editor de opciones en el constructor).
export function hasOptions(t: QuestionType): boolean {
  return t === "SINGLE_CHOICE" || t === "MULTI_CHOICE" || t === "DROPDOWN";
}

// goto: ruteo por opción (solo SINGLE_CHOICE). "SUBMIT" | "GOTO:<order>". Ausente = seguir sección.
export type Option = { value: string; label: string; goto?: string };

// Config por pregunta (validaciones). Todo opcional segun tipo.
export type QuestionConfig = {
  min?: number; // LIKERT/NUMBER
  max?: number; // LIKERT/NUMBER
  step?: number; // NUMBER
  maxLength?: number; // TEXT/PARAGRAPH
  options?: Option[]; // SINGLE_CHOICE/MULTI_CHOICE/DROPDOWN
  multi?: boolean;
  maxStars?: number; // RATING: cantidad de estrellas (3-10)
  fileTypes?: string[]; // FILE_UPLOAD: extensiones/mime permitidos
  maxFiles?: number; // FILE_UPLOAD: máximo de archivos
  // DATETIME: esta fecha/hora debe ser POSTERIOR a la de la pregunta con este 'order'
  // (ej. t2 posterior a t1). Validación cruzada entre preguntas de la misma versión.
  afterQuestionOrder?: number;
  // FLOW_MEASUREMENT: listas para los desplegables de proceso y aerolínea. Si una
  // lista está vacía/ausente, ese desplegable no se muestra.
  flowProcesses?: string[];
  flowAirlines?: string[];
};

// Valor del desplegable de aerolínea cuando la medición no corresponde a una.
export const FLOW_AIRLINE_NA = "N/A";

// ---- Medición de flujo ----------------------------------------------------------
// Se parte con la cantidad de pasajeros en fila, se inicia un cronómetro y se marca
// cada pasajero que ENTRA a la fila o SALE de ella. t = ms desde el inicio.
export type FlowEvent = { t: number; e: "IN" | "OUT" };
export type FlowKpis = {
  durationMin: number; // duración de la medición
  totalIn: number; // pasajeros que entraron
  totalOut: number; // pasajeros que salieron
  finalQueue: number; // pasajeros en fila al finalizar
  arrivalRate: number; // pax/min que entran
  departureRate: number; // pax/min que salen
  avgQueue: number; // largo promedio de la fila (ponderado por tiempo)
  avgWaitMin: number; // tiempo promedio estimado en fila (Ley de Little: L / λ)
};
export type FlowMeasurement = {
  process?: string | null; // proceso medido (de config.flowProcesses)
  airline?: string | null; // aerolínea (de config.flowAirlines) o "N/A"
  initialQueue: number;
  startedAt: string; // ISO
  endedAt: string | null; // ISO; null = medición en curso
  events: FlowEvent[];
  kpis?: FlowKpis; // lo calcula el servidor al validar
};

const flowMeasurementSchema = z.object({
  process: z.string().max(200).nullable().optional(),
  airline: z.string().max(200).nullable().optional(),
  initialQueue: z.number().int().min(0).max(100_000),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  events: z
    .array(z.object({ t: z.number().int().min(0).max(86_400_000), e: z.enum(["IN", "OUT"]) }))
    .max(20_000),
  kpis: z.any().optional(),
});

/** Largo de la fila tras procesar los eventos (inicial + entradas − salidas). */
export function flowQueue(m: Pick<FlowMeasurement, "initialQueue" | "events">): number {
  return m.events.reduce((q, ev) => q + (ev.e === "IN" ? 1 : -1), m.initialQueue);
}

/** KPIs de una medición de flujo. `endMs` (epoch) permite calcularlos en curso. */
export function flowKpis(m: FlowMeasurement, endMs?: number): FlowKpis {
  const start = new Date(m.startedAt).getTime();
  const end = endMs ?? (m.endedAt ? new Date(m.endedAt).getTime() : Date.now());
  const durMs = Math.max(0, end - start);
  const durationMin = durMs / 60_000;
  let q = m.initialQueue;
  let prevT = 0;
  let area = 0; // Σ (largo de fila × tiempo) para el promedio ponderado por tiempo
  let totalIn = 0;
  let totalOut = 0;
  for (const ev of m.events) {
    const t = Math.min(ev.t, durMs);
    area += q * (t - prevT);
    prevT = t;
    if (ev.e === "IN") {
      q++;
      totalIn++;
    } else {
      q--;
      totalOut++;
    }
  }
  area += q * (durMs - prevT);
  const avgQueue = durMs > 0 ? area / durMs : m.initialQueue;
  const arrivalRate = durationMin > 0 ? totalIn / durationMin : 0;
  const departureRate = durationMin > 0 ? totalOut / durationMin : 0;
  // Ley de Little (W = L / λ). Si nadie entró, se usa la tasa de salida como flujo.
  const lambda = arrivalRate > 0 ? arrivalRate : departureRate;
  const avgWaitMin = lambda > 0 ? avgQueue / lambda : 0;
  return {
    durationMin,
    totalIn,
    totalOut,
    finalQueue: q,
    arrivalRate,
    departureRate,
    avgQueue,
    avgWaitMin,
  };
}

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
  raw: RawAnswer[],
  // Si se pasa, solo se validan/exigen las preguntas de estas secciones "visitadas"
  // (las de secciones saltadas por el ruteo no se exigen aunque sean obligatorias).
  activeIds?: Set<string>
): { ok: boolean; errors: Record<string, string>; answers: ValidatedAnswer[] } {
  const byId = new Map(raw.map((r) => [r.questionId, r]));
  const errors: Record<string, string> = {};
  const answers: ValidatedAnswer[] = [];

  for (const q of questions) {
    if (activeIds && !activeIds.has(q.id)) continue; // pregunta no presentada -> se ignora
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
      case "TEXT":
      case "PARAGRAPH": {
        const t = String(a.valueText ?? "");
        if (cfg.maxLength != null && t.length > cfg.maxLength) {
          errors[q.id] = `Máximo ${cfg.maxLength} caracteres.`;
          break;
        }
        out.valueText = t;
        break;
      }
      case "RATING": {
        if (a.valueText === "N/A") {
          out.valueText = "N/A"; // no aplica
          break;
        }
        const max = cfg.maxStars ?? 5;
        const n = Number(a.valueNumber);
        if (!Number.isInteger(n) || n < 1 || n > max) {
          errors[q.id] = `Calificación fuera de rango (1-${max}) o N/A.`;
          break;
        }
        out.valueNumber = n;
        break;
      }
      case "FILE_UPLOAD": {
        // Rutas de los archivos ya subidos a GCS (una o varias). El límite de
        // tipo/tamaño se valida al subir; aquí solo se guarda la lista.
        const arr = Array.isArray(a.valueJson) ? (a.valueJson as string[]) : [];
        out.valueJson = arr;
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
      case "FLOW_MEASUREMENT": {
        const p = flowMeasurementSchema.safeParse(a.valueJson);
        if (!p.success) {
          errors[q.id] = "Medición de flujo inválida.";
          break;
        }
        const m = p.data;
        const procs = (cfg.flowProcesses ?? []).filter(Boolean);
        const airlines = (cfg.flowAirlines ?? []).filter(Boolean);
        if (procs.length && !procs.includes(m.process ?? "")) {
          errors[q.id] = "Selecciona el proceso que se está midiendo.";
          break;
        }
        if (
          airlines.length &&
          m.airline !== FLOW_AIRLINE_NA &&
          !airlines.includes(m.airline ?? "")
        ) {
          errors[q.id] = "Selecciona la aerolínea (o «No aplica»).";
          break;
        }
        if (!m.endedAt) {
          errors[q.id] = "Finaliza la medición antes de continuar.";
          break;
        }
        const durMs = new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime();
        if (!(durMs > 0)) {
          errors[q.id] = "La medición debe durar más de 0 segundos.";
          break;
        }
        const events = m.events.slice().sort((x, y) => x.t - y.t);
        let queue = m.initialQueue;
        let bad = false;
        for (const ev of events) {
          queue += ev.e === "IN" ? 1 : -1;
          if (queue < 0 || ev.t > durMs + 1000) bad = true;
        }
        if (bad) {
          errors[q.id] = "Medición inconsistente (fila negativa o evento fuera de rango).";
          break;
        }
        const clean: FlowMeasurement = {
          process: procs.length ? m.process! : null,
          airline: airlines.length ? m.airline! : null,
          initialQueue: m.initialQueue,
          startedAt: m.startedAt,
          endedAt: m.endedAt,
          events,
        };
        const kpis = flowKpis(clean);
        out.valueJson = { ...clean, kpis };
        out.valueNumber = Math.round(kpis.avgWaitMin * 100) / 100; // min promedio en fila
        break;
      }
      case "SINGLE_CHOICE":
      case "DROPDOWN": {
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
        // Array de strings (MULTI_CHOICE/FILE_UPLOAD) u objeto de medición de flujo
        // (se valida en detalle en validateAnswers).
        valueJson: z
          .union([z.array(z.string().max(500)).max(100), flowMeasurementSchema])
          .optional(),
      })
    )
    .max(300), // tope de respuestas por envío
  // Preguntas efectivamente mostradas (secciones visitadas). Si viene, solo se
  // exigen esas; las de secciones saltadas no bloquean el envío.
  presentedQuestionIds: z.array(z.string().max(60)).max(300).optional(),
  // Idempotencia: UUID generado en el cliente por envío. Reintentos y reenvíos de
  // la cola offline con el mismo id no crean duplicados (ver createResponseSet).
  clientSubmissionId: z.string().uuid().optional(),
  // Métricas de la toma (opcionales): las reporta el cronómetro del cliente.
  startedAt: z.string().datetime().optional(), // ISO 8601 del inicio de la encuesta
  durationMs: z.number().int().min(0).max(86_400_000).optional(), // duración (tope 24 h)
});
