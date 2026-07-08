import { fromJson } from "@/lib/enums";
import type { QuestionConfig, QuestionType } from "@/lib/questionTypes";
import type { ClientQuestion, ClientSection } from "@/components/QuestionInput";

type DbQuestion = {
  id: string;
  order: number;
  type: string;
  text: string;
  required: boolean;
  config: string | null;
  sectionId: string | null;
};
type DbSection = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  routing: string;
};

// Arma las secciones para el runner a partir de las preguntas + secciones de una
// versión. Versiones antiguas (sin secciones) => una sola sección implícita que
// muestra todo y envía al final.
export function buildClientSections(
  questions: DbQuestion[],
  sections: DbSection[]
): ClientSection[] {
  const toCQ = (q: DbQuestion): ClientQuestion => ({
    id: q.id,
    order: q.order,
    type: q.type as QuestionType,
    text: q.text,
    required: q.required,
    config: fromJson<QuestionConfig>(q.config),
  });
  const sorted = [...questions].sort((a, b) => a.order - b.order);

  if (sections.length === 0) {
    return [{ order: 1, title: "", description: null, routing: "SUBMIT", questions: sorted.map(toCQ) }];
  }

  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      order: s.order,
      title: s.title,
      description: s.description,
      routing: s.routing,
      questions: sorted.filter((q) => q.sectionId === s.id).map(toCQ),
    }));
}
