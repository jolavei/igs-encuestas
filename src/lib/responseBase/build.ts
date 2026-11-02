// Base de respuestas: de formato largo (una fila por respuesta a una pregunta) a formato
// ancho (una fila por envío, una columna por pregunta). Lógica pura, sin base de datos.
import { createHash } from "node:crypto";
import { fromJson } from "@/lib/enums";
import type { FlowMeasurement, QuestionConfig, QuestionType } from "@/lib/questionTypes";
import type { CellValue, ColumnKind, GridColumn } from "@/lib/responseBase/grid";

export type BaseQuestion = {
  id: string;
  order: number;
  type: string;
  text: string;
  config: string | null;
  equivalenceKey: string | null;
  section: { order: number; title: string } | null;
};

export type BaseVersion = { versionNumber: number; questions: BaseQuestion[] };

export type BaseAnswer = {
  questionId: string;
  valueNumber: number | null;
  valueText: string | null;
  valueDate: Date | null;
  valueJson: string | null;
};

const KIND_BY_TYPE: Partial<Record<QuestionType, ColumnKind>> = {
  LIKERT: "number",
  NPS: "number",
  NUMBER: "number",
  RATING: "number",
  DATETIME: "date",
  MULTI_CHOICE: "multi",
  FILE_UPLOAD: "file",
};

const kindOf = (type: string): ColumnKind => KIND_BY_TYPE[type as QuestionType] ?? "text";

const byFormOrder = (a: BaseQuestion, b: BaseQuestion) =>
  (a.section?.order ?? 0) - (b.section?.order ?? 0) || a.order - b.order;

/**
 * Columnas de las preguntas de un plan. Un plan puede tener envíos de varias versiones
 * del cuestionario: la misma pregunta (por equivalenceKey o, si no tiene, por sección y
 * texto) comparte columna entre versiones. Manda el texto y orden de la versión más
 * nueva; lo que solo existe en una versión antigua se intercala tras su pregunta anterior.
 * `columnOf` asocia cada pregunta (de cualquier versión) a su columna.
 */
export function buildQuestionColumns(versions: BaseVersion[]): {
  columns: GridColumn[];
  columnOf: Map<string, string>;
} {
  const newestFirst = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const columns: GridColumn[] = [];
  const columnOf = new Map<string, string>();

  for (const version of newestFirst) {
    let anchor = -1;
    const seen = new Map<string, number>();
    for (const q of [...version.questions].sort(byFormOrder)) {
      const kind = kindOf(q.type);
      // Si cambió el tipo de dato entre versiones no se mezclan en una misma columna.
      const identity = `${kind}|${q.equivalenceKey ?? `${q.section?.title ?? ""}|${q.text.trim()}`}`;
      // Dos preguntas idénticas dentro de una versión (misma clave en secciones distintas).
      const occurrence = (seen.get(identity) ?? 0) + 1;
      seen.set(identity, occurrence);
      const key = `q${createHash("sha1").update(`${identity}#${occurrence}`).digest("hex").slice(0, 12)}`;

      columnOf.set(q.id, key);
      const at = columns.findIndex((c) => c.key === key);
      if (at >= 0) {
        anchor = at;
        continue;
      }
      anchor += 1;
      columns.splice(anchor, 0, {
        key,
        label: q.text.trim(),
        section: q.section?.title.trim() || null,
        kind,
        ...(q.type === "PARAGRAPH" ? { wide: true } : {}),
      });
    }
  }
  return { columns, columnOf };
}

/** Valor → etiqueta de las opciones de una pregunta (para answerCell). */
export function questionLabels(q: Pick<BaseQuestion, "config">): Map<string, string> {
  const options = fromJson<QuestionConfig>(q.config)?.options ?? [];
  return new Map(options.map((o) => [o.value, o.label]));
}

function flowSummary(m: FlowMeasurement): string {
  const k = m.kpis;
  return [
    m.process,
    m.airline,
    k ? `fila ${m.initialQueue}→${k.finalQueue}` : `fila inicial ${m.initialQueue}`,
    k ? `espera ${k.avgWaitMin.toFixed(1).replace(".", ",")} min` : null,
    k ? `medición ${k.durationMin.toFixed(1).replace(".", ",")} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Valor de la celda de una respuesta; null si no hay nada que mostrar. */
export function answerCell(
  q: Pick<BaseQuestion, "type">,
  a: BaseAnswer,
  labels: Map<string, string>
): CellValue | null {
  switch (q.type as QuestionType) {
    case "SINGLE_CHOICE":
    case "DROPDOWN": {
      const v = a.valueText?.trim();
      return v ? (labels.get(v) ?? v) : null;
    }
    case "MULTI_CHOICE":
    case "FILE_UPLOAD": {
      const arr = fromJson<string[]>(a.valueJson);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return q.type === "MULTI_CHOICE" ? arr.map((v) => labels.get(v) ?? v) : arr;
    }
    case "FLOW_MEASUREMENT": {
      const m = fromJson<FlowMeasurement>(a.valueJson);
      return m ? flowSummary(m) : null;
    }
    case "DATETIME":
      return a.valueDate ? a.valueDate.getTime() : a.valueText?.trim() || null;
    default:
      // Números y calificaciones (el "N/A" llega como texto), y textos libres.
      return a.valueNumber ?? (a.valueText?.trim() || null);
  }
}
