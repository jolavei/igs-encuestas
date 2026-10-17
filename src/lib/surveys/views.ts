// Configuración de las vistas del Dashboard por cuestionario (una vista separada por
// cuestionario vigente). La estructura de cada cuestionario se lee de la base; aquí
// solo va lo que es propio de cada uno: qué cuestionario es, cómo se presentan sus
// notas, el contexto que acompaña a cada comentario y el mapeo de la pregunta
// "los 3 aspectos más importantes" a las notas (matriz importancia–desempeño).

export type SurveyViewKey = "aga-pasajeros" | "aga-acompanantes" | "hotel";

export type ImportanceMap = { option: string; match: RegExp }[];

export type SurveyViewConfig = {
  key: SurveyViewKey;
  title: string;
  description: string;
  questionnaireTitle: string; // título exacto del cuestionario en la base
  respondent: string; // "pasajero" / "acompañante" / "huésped"
  // "modules": atributos generales + servicios con pregunta de uso (AGA).
  // "sections": cada sección del cuestionario es una dimensión con sus ítems (hotel).
  layout: "modules" | "sections";
  // Preguntas cuyo valor se muestra junto a cada comentario (por texto de la pregunta).
  context: RegExp[];
  // Etiqueta corta de cada pregunta abierta (la primera que calce); el resto usa su texto.
  openLabels: { match: RegExp; label: string }[];
  // Preguntas abiertas que no son comentarios (se excluyen del explorador).
  openExclude: RegExp[];
  // `match` se prueba contra "<sección>|<ítem>" de cada nota (sección sin "— evaluación").
  importance: ImportanceMap | null;
};

export const SURVEY_VIEWS: Record<SurveyViewKey, SurveyViewConfig> = {
  "aga-pasajeros": {
    key: "aga-pasajeros",
    title: "Encuesta AGA · Pasajeros",
    description: "Experiencia de los pasajeros durante su paso por el aeropuerto.",
    questionnaireTitle: "Encuesta AGA - Pasajeros",
    respondent: "pasajero",
    layout: "modules",
    context: [/^aerol[ií]nea$/i, /^destino$/i, /motivo principal/i],
    openLabels: [
      { match: /cambiar una sola cosa/i, label: "Lo que cambiaría" },
      { match: /m[aá]s valor[oó]/i, label: "Lo más valorado" },
      { match: /qu[eé] destino visit[oó]/i, label: "Destino en la región" },
      { match: /imperdible/i, label: "Imperdible de la región" },
    ],
    openExclude: [/n[uú]mero de vuelo/i],
    importance: [
      { option: "Limpieza", match: /\|limpieza general/i },
      { option: "Seguridad", match: /\|sensaci[oó]n de seguridad/i },
      { option: "Tiempos de espera", match: /\|.*tiempo de espera/i },
      { option: "Señalética y orientación", match: /\|señal[eé]tica/i },
      { option: "Confort y asientos", match: /\|confort del terminal/i },
      { option: "Personal amable", match: /\|amabilidad y disposici[oó]n del personal/i },
      { option: "Comida y comercio", match: /^(tiendas y comercio|comidas y bebidas)\|/i },
      { option: "Información de vuelos", match: /\|informaci[oó]n de vuelos/i },
      { option: "Wi-Fi", match: /^wi-fi\|/i },
      { option: "Transporte y acceso", match: /^transporte/i },
      { option: "Estacionamiento", match: /^estacionamientos?\|/i },
      { option: "Baños", match: /^baños\|/i },
    ],
  },
  "aga-acompanantes": {
    key: "aga-acompanantes",
    title: "Encuesta AGA · Acompañantes",
    description: "Experiencia de quienes acompañan a pasajeros en el aeropuerto.",
    questionnaireTitle: "Encuesta AGA - Acompañantes",
    respondent: "acompañante",
    layout: "modules",
    context: [/relaci[oó]n con el pasajero/i, /cu[aá]nto tiempo permanecer/i],
    openLabels: [
      { match: /cambiar una sola cosa/i, label: "Lo que cambiaría" },
      { match: /m[aá]s valor[oó]/i, label: "Lo más valorado" },
    ],
    openExclude: [],
    importance: [
      { option: "Limpieza", match: /\|limpieza y aseo general/i },
      { option: "Seguridad", match: /\|sensaci[oó]n de seguridad/i },
      { option: "Confort y asientos", match: /\|confort del [aá]rea de espera/i },
      { option: "Señalética y orientación", match: /\|señal[eé]tica y facilidad/i },
      { option: "Información de vuelos", match: /\|informaci[oó]n de vuelos/i },
      { option: "Personal amable", match: /\|amabilidad y disposici[oó]n del personal/i },
      { option: "Servicios higiénicos", match: /^servicios higi[eé]nicos\|/i },
      { option: "Comercio y comida", match: /^(locales comerciales|comidas y bebidas)\|/i },
      { option: "Estacionamiento", match: /^estacionamientos?\|/i },
      { option: "Transporte y acceso", match: /^transporte/i },
      { option: "Climatización", match: /\|climatizaci[oó]n/i },
    ],
  },
  hotel: {
    key: "hotel",
    title: "Nivel de satisfacción hotelera",
    description: "Experiencia de los huéspedes durante su estadía.",
    questionnaireTitle: "Nivel de satisfacción hotelera",
    respondent: "huésped",
    layout: "sections",
    context: [/motivo principal/i, /con qui[eé]n se hospeda/i, /cu[aá]ntas noches/i],
    openLabels: [
      { match: /lo mejor de su experiencia/i, label: "Lo mejor" },
      { match: /oportunidades de mejora/i, label: "Oportunidades de mejora" },
      { match: /reconocimiento/i, label: "Reconocimiento a colaboradores" },
    ],
    openExclude: [/en qu[eé] industria/i],
    importance: null,
  },
};

export const SURVEY_VIEW_KEYS = Object.keys(SURVEY_VIEWS) as SurveyViewKey[];

export function isSurveyViewKey(v: string): v is SurveyViewKey {
  return (SURVEY_VIEW_KEYS as string[]).includes(v);
}
