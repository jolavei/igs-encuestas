// Construye la lista de "preguntas-segmento" que ofrece el formulario de plan de
// trabajo a partir de una versión de cuestionario. Una pregunta es elegible como
// segmento si es de opción única / desplegable y tiene equivalenceKey.
//
// Caso especial "anidado por sección": si el segmento primario es una pregunta
// ENRUTADORA (cada opción salta con GOTO a una sección distinta, como "Proceso a
// medir"), la sub-meta de cada opción usa la pregunta de aerolínea de ESA sección,
// que difiere por proceso (Check in: Counter/Quiosco…; Retiro de equipajes: LATAM
// Airlines; AVSEC: ninguna). Esas preguntas anidadas se excluyen de la lista de
// segmentos elegibles (no se eligen a mano: se resuelven por proceso).
import { fromJson } from "@/lib/enums";
import type { QuestionConfig } from "@/lib/questionTypes";

export type SegmentSubOption = { value: string; label: string };
export type SegmentQuestion = {
  equivalenceKey: string;
  text: string;
  options: SegmentSubOption[];
  // Presente solo para una pregunta enrutadora: `byOption[valorDeLaOpción]` son las
  // opciones (aerolíneas) de la sección a la que salta esa opción.
  nested?: { label: string; byOption: Record<string, SegmentSubOption[]> } | null;
};

type QuestionInput = {
  id: string;
  type: string;
  text: string;
  equivalenceKey: string | null;
  config: string | null;
  sectionId: string | null;
};
type SectionInput = { id: string; order: number };

const isChoice = (t: string) => t === "SINGLE_CHOICE" || t === "DROPDOWN";

export function buildSegmentQuestions(
  questions: QuestionInput[],
  sections: SectionInput[]
): SegmentQuestion[] {
  const optsOf = (qq: QuestionInput) => fromJson<QuestionConfig>(qq.config)?.options ?? [];
  const sectionByOrder = new Map(sections.map((s) => [s.order, s]));
  const choiceQs = questions.filter((qq) => isChoice(qq.type) && qq.equivalenceKey);

  const nestedEqKeys = new Set<string>();
  const buildNested = (router: QuestionInput) => {
    const opts = optsOf(router);
    if (!opts.some((o) => o.goto?.startsWith("GOTO:"))) return null;
    const byOption: Record<string, SegmentSubOption[]> = {};
    let label = "";
    for (const o of opts) {
      if (!o.goto?.startsWith("GOTO:")) continue;
      const sec = sectionByOrder.get(parseInt(o.goto.slice(5), 10));
      if (!sec) continue;
      const airlineQ = questions.find(
        (x) => x.sectionId === sec.id && isChoice(x.type) && x.equivalenceKey
      );
      if (!airlineQ) continue;
      nestedEqKeys.add(airlineQ.equivalenceKey as string);
      if (!label) label = airlineQ.text;
      byOption[o.value] = optsOf(airlineQ).map((ao) => ({ value: ao.value, label: ao.label }));
    }
    return Object.keys(byOption).length ? { label, byOption } : null;
  };

  // Se resuelve el anidamiento de TODAS antes de filtrar, para poblar nestedEqKeys.
  const withNested = choiceQs.map((qq) => ({ qq, nested: buildNested(qq) }));
  return withNested
    .filter(({ qq }) => !nestedEqKeys.has(qq.equivalenceKey as string))
    .map(({ qq, nested }) => ({
      equivalenceKey: qq.equivalenceKey as string,
      text: qq.text,
      options: optsOf(qq).map((o) => ({ value: o.value, label: o.label })),
      nested,
    }));
}

export type PlanSegmentDraft = {
  parentValue: string | null;
  value: string;
  label: string;
  target: number;
};

// Traduce las metas capturadas en el formulario (nivel 1 por opción del primario,
// nivel 2 por "valorPrimario|valorSub") a las sub-metas que se guardan. Reglas:
//  - Solo se guardan sub-metas con target > 0 (por eso "meta 0" no aparece luego).
//  - Si el proceso no tiene meta propia, se usa la suma de sus sub-metas.
//  - `subOptionsFor` da las opciones del nivel 2 según la opción del primario
//    (anidadas por sección en Mediciones de tiempos, o uniformes en el caso clásico).
export function buildPlanSegmentsFromTargets(
  primaryOptions: SegmentSubOption[],
  subOptionsFor: (poValue: string) => SegmentSubOption[],
  segTargets: Record<string, number>,
  seg2Targets: Record<string, number>
): PlanSegmentDraft[] {
  const segments: PlanSegmentDraft[] = [];
  for (const po of primaryOptions) {
    const subOpts = subOptionsFor(po.value);
    const childSum = subOpts.reduce(
      (a, so) => a + (seg2Targets[`${po.value}|${so.value}`] ?? 0),
      0
    );
    const l1target = segTargets[po.value] || childSum;
    if (l1target > 0) {
      segments.push({ parentValue: null, value: po.value, label: po.label, target: l1target });
    }
    for (const so of subOpts) {
      const t = seg2Targets[`${po.value}|${so.value}`] ?? 0;
      if (t > 0) {
        segments.push({ parentValue: po.value, value: so.value, label: so.label, target: t });
      }
    }
  }
  return segments;
}
