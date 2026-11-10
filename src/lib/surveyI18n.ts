// Encuesta bilingüe (botón ES | EN). Compartido cliente/servidor.
//
// Reglas:
//  - El idioma solo cambia lo que se MUESTRA. Lo que se guarda (value de cada opción,
//    números, N/A) es siempre el valor en español, así BigQuery, Bases e Informes no
//    cambian. El ResponseSet registra además el idioma usado.
//  - Si falta la traducción de un texto, se muestra en español (nunca vacío).
//  - Los textos que solo ve el agente (cola sin conexión, "Nueva respuesta", medición
//    de flujo, fecha-hora) quedan en español.
import type { ClientSection } from "@/components/QuestionInput";

export type SurveyLang = "es" | "en";

export const SURVEY_UI = {
  es: {
    next: "Siguiente →",
    back: "← Atrás",
    submit: "Enviar respuestas",
    sending: "Enviando…",
    thanks: "¡Gracias!",
    recorded: "Respuesta registrada.",
    shortAnswer: "Texto de respuesta breve",
    longAnswer: "Texto de respuesta largo",
    choose: "— elegir —",
    notApplicable: "No aplica",
    ofMax: (n: number, max: number) => `${n} de ${max}`,
    sendFailed: "No se pudo enviar la respuesta.",
    noConnection: "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
    stale:
      "El formulario está desactualizado (se publicó una versión nueva). Recarga la página y vuelve a responder.",
    reload: "Recargar",
    alreadyTitle: "Ya registramos tu respuesta",
    alreadyBody: "Gracias por participar. Solo se admite una respuesta por dispositivo.",
    anonymous: "Tus respuestas son anónimas y se usan para mejorar el servicio.",
    langGroup: "Idioma de la encuesta",
  },
  en: {
    next: "Next →",
    back: "← Back",
    submit: "Submit answers",
    sending: "Submitting…",
    thanks: "Thank you!",
    recorded: "Your response has been recorded.",
    shortAnswer: "Short answer",
    longAnswer: "Long answer",
    choose: "— select —",
    notApplicable: "Not applicable",
    ofMax: (n: number, max: number) => `${n} of ${max}`,
    sendFailed: "Your response could not be submitted.",
    noConnection: "Could not reach the server. Check your connection and try again.",
    stale:
      "This form is out of date (a new version was published). Reload the page and answer again.",
    reload: "Reload",
    alreadyTitle: "We already have your response",
    alreadyBody: "Thank you for taking part. Only one response per device is allowed.",
    anonymous: "Your answers are anonymous and are used to improve the service.",
    langGroup: "Survey language",
  },
} as const;

const pick = (es: string, en: string | null | undefined, lang: SurveyLang) =>
  lang === "en" && en && en.trim() ? en : es;

// Texto a mostrar de un título/pregunta según el idioma (cae al español si falta).
export function localizeText(es: string, en: string | null | undefined, lang: SurveyLang): string {
  return pick(es, en, lang);
}

// Secciones con los textos en el idioma pedido. Conserva ids, values y ruteo, así
// las respuestas, la validación y los saltos no dependen del idioma.
export function localizeSections(sections: ClientSection[], lang: SurveyLang): ClientSection[] {
  if (lang === "es") return sections;
  return sections.map((s) => ({
    ...s,
    title: pick(s.title, s.titleEn, lang),
    description: s.description ? pick(s.description, s.descriptionEn, lang) : s.description,
    questions: s.questions.map((q) => ({
      ...q,
      text: pick(q.text, q.textEn, lang),
      config: q.config?.options
        ? {
            ...q.config,
            options: q.config.options.map((o) => ({ ...o, label: pick(o.label, o.labelEn, lang) })),
          }
        : q.config,
    })),
  }));
}

// Mensajes de validación (vienen en español desde validateAnswers, compartido con el
// servidor) traducidos para el pasajero. Lo no reconocido queda tal cual.
export function translateError(msg: string, lang: SurveyLang): string {
  if (lang === "es") return msg;
  const exact: Record<string, string> = {
    "Esta pregunta es obligatoria.": "This question is required.",
    "NPS debe ser entero 0-10.": "Choose a whole number from 0 to 10.",
    "Debe ser numérico.": "Enter a number.",
    "Fecha inválida.": "Invalid date.",
  };
  if (exact[msg]) return exact[msg];
  let m = msg.match(/^Máximo (\d+) caracteres\.$/);
  if (m) return `Maximum ${m[1]} characters.`;
  m = msg.match(/^Calificación fuera de rango \(1-(\d+)\) o N\/A\.$/);
  if (m) return `Choose a rating from 1 to ${m[1]}, or N/A.`;
  m = msg.match(/^Valor fuera de rango \((-?\d+)-(-?\d+)\)\.$/);
  if (m) return `Choose a value from ${m[1]} to ${m[2]}.`;
  m = msg.match(/^Mínimo (.+)\.$/);
  if (m) return `Minimum ${m[1]}.`;
  m = msg.match(/^Máximo (.+)\.$/);
  if (m) return `Maximum ${m[1]}.`;
  return msg;
}

// Idioma inicial del QR público: inglés si el navegador del pasajero está en inglés.
export function browserLang(): SurveyLang {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return langs[0]?.toLowerCase().startsWith("en") ? "en" : "es";
  } catch {
    return "es";
  }
}

// ---- Guardar traducciones sobre una versión existente (sin crear versión nueva) ----

export type TranslationOptionInput = { value: string; labelEn?: string | null };
export type TranslationQuestionInput = {
  order: number;
  text: string; // texto en español, para verificar que es la misma pregunta
  textEn?: string | null;
  options?: TranslationOptionInput[];
};
export type TranslationSectionInput = {
  order: number;
  title: string;
  titleEn?: string | null;
  descriptionEn?: string | null;
  questions: TranslationQuestionInput[];
};

type DbQ = { id: string; order: number; text: string; sectionId: string | null; config: string | null };
type DbS = { id: string; order: number; title: string };

export type TranslationPlan = {
  questions: { id: string; textEn: string | null; config: string | null }[];
  sections: { id: string; titleEn: string | null; descriptionEn: string | null }[];
  mismatches: string[]; // qué no calzó (texto en español distinto, pregunta u opción inexistente)
};

const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/**
 * Calcula qué actualizar para dejar las traducciones de una versión. Empareja por
 * orden (sección y pregunta) y verifica que el texto en español sea el mismo: si el
 * español cambió, eso es un cambio de contenido y requiere una versión nueva.
 * Pura (sin base de datos) para poder probarla.
 */
export function planTranslations(
  dbQuestions: DbQ[],
  dbSections: DbS[],
  input: TranslationSectionInput[]
): TranslationPlan {
  const mismatches: string[] = [];
  const qByOrder = new Map(dbQuestions.map((q) => [q.order, q]));
  const sByOrder = new Map(dbSections.map((s) => [s.order, s]));
  const plan: TranslationPlan = { questions: [], sections: [], mismatches };

  for (const s of input) {
    const dbS = sByOrder.get(s.order);
    if (dbSections.length > 0) {
      if (!dbS) {
        mismatches.push(`La sección ${s.order} no existe en la versión.`);
      } else if (norm(dbS.title) !== norm(s.title)) {
        mismatches.push(`Sección ${s.order}: el título en español cambió («${s.title}»).`);
      } else {
        plan.sections.push({ id: dbS.id, titleEn: clean(s.titleEn), descriptionEn: clean(s.descriptionEn) });
      }
    }
    for (const q of s.questions) {
      const dbQ = qByOrder.get(q.order);
      if (!dbQ) {
        mismatches.push(`La pregunta ${q.order} no existe en la versión.`);
        continue;
      }
      if (norm(dbQ.text) !== norm(q.text)) {
        mismatches.push(`Pregunta ${q.order}: el texto en español cambió («${q.text}»).`);
        continue;
      }
      let config = dbQ.config;
      if (q.options?.length) {
        let cfg: { options?: { value: string; label: string; labelEn?: string }[] } | null = null;
        try {
          cfg = dbQ.config ? JSON.parse(dbQ.config) : null;
        } catch {
          cfg = null;
        }
        const opts = cfg?.options ?? [];
        let bad = false;
        for (const o of q.options) {
          if (!opts.some((x) => x.value === o.value)) {
            mismatches.push(`Pregunta ${q.order}: la opción «${o.value}» no existe en la versión.`);
            bad = true;
          }
        }
        if (bad) continue;
        const enByValue = new Map(q.options.map((o) => [o.value, clean(o.labelEn)]));
        const nextOpts = opts.map((x) => {
          const en = enByValue.has(x.value) ? enByValue.get(x.value) : x.labelEn ?? null;
          const { labelEn: _drop, ...rest } = x;
          return en ? { ...rest, labelEn: en } : rest;
        });
        config = JSON.stringify({ ...cfg, options: nextOpts });
      }
      plan.questions.push({ id: dbQ.id, textEn: clean(q.textEn), config });
    }
  }
  return plan;
}
