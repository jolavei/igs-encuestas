// Título visible de un plan de trabajo: el título del cuestionario más el
// nombre/etiqueta opcional del plan (p. ej. "Mediciones de tiempos – SU2026").
// Se usa en todas las vistas donde aparece un plan para que dos planes del mismo
// cuestionario se distingan a simple vista.
export function planDisplayTitle(
  questionnaireTitle: string,
  name?: string | null
): string {
  const n = name?.trim();
  return n ? `${questionnaireTitle} – ${n}` : questionnaireTitle;
}
