// Textos de la diapositiva "Cómo leer las Encuestas AGA" (Módulo 03), compartidos por
// el render HTML (ReportDeck) y el PPTX para que digan exactamente lo mismo.

export type AgaGuideKpi = {
  title: string;
  question: string; // qué se pregunta / de dónde sale
  how: string; // cómo se calcula y para qué sirve
  color: string; // regla de color del número
};

export const AGA_GUIDE_KPIS: AgaGuideKpi[] = [
  {
    title: "NPS",
    question: "¿Qué tan probable es que recomiende el aeropuerto? (0 a 10)",
    how:
      "% de promotores (9–10) menos % de detractores (0–6); va de −100 a +100. " +
      "La barra muestra promotores, pasivos (7–8) y detractores. Mide lealtad y recomendación.",
    color: "Verde ≥ +30 · azul 0 a +29 · rojo < 0",
  },
  {
    title: "Satisfacción general",
    question: "Satisfacción general con el aeropuerto en la visita de hoy (1 a 5)",
    how: "Promedio de las respuestas. Es la nota global de la experiencia.",
    color: "Verde ≥ 4,0 · amarillo 3,5–3,9 · rojo < 3,5",
  },
  {
    title: "Satisfechos (nota 4–5)",
    question: "Misma pregunta de satisfacción general",
    how:
      "% de encuestados que calificó con 4 o 5 (top-2-box). Complementa al promedio: " +
      "indica cuántos quedan realmente satisfechos.",
    color: "",
  },
  {
    title: "Encuestas del mes",
    question: "Encuestas realizadas en el mes",
    how:
      "“Periodo X de Y” = acumulado desde el inicio del plan frente a la meta. " +
      "Con pocos casos (menos de 30) los resultados son referenciales.",
    color: "",
  },
];

export const AGA_GUIDE_PERIOD_NOTE =
  "En cada tarjeta, el número grande corresponde al mes del informe y “Periodo” al acumulado desde el inicio del plan.";

export const AGA_GUIDE_ATTRIBUTES =
  "Aspectos generales del terminal que evalúan todos los encuestados (limpieza, seguridad, señalética, confort…). " +
  "La barra y el número son la nota promedio de 1 a 5; n = cantidad de respuestas válidas.";

export const AGA_GUIDE_SERVICES =
  "Servicios que califica solo quien declaró haberlos usado (baños, comercio, estacionamiento…). " +
  "Nota promedio de 1 a 5; el % es la proporción de encuestados que lo usó y n, cuántos lo calificaron " +
  "(“—” = el servicio no tiene pregunta de uso).";

export const AGA_GUIDE_SCALE_NOTE = "Ambas listas se ordenan de mejor a peor nota. Las respuestas N/A no se consideran.";

// Filas de ejemplo (ilustrativas) para mostrar cómo se ve cada lista.
export const AGA_GUIDE_EXAMPLE_ATTRIBUTE = { label: "Limpieza general del terminal", avg: 4.2, n: 60 };
export const AGA_GUIDE_EXAMPLE_SERVICE = { label: "Comidas y bebidas", avg: 3.7, n: 20, usePct: 32, useN: 62 };
