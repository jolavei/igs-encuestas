// Calculo de NPS y CSAT. Mismas formulas para admin y cliente -> comparabilidad.

export function computeNps(scores: number[]): { nps: number | null; n: number } {
  const n = scores.length;
  if (n === 0) return { nps: null, n };
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  return { nps: Math.round(((prom - det) / n) * 100), n };
}

// CSAT top-box: % de respuestas en el/los puntajes mas altos de la escala.
export function computeCsat(
  scores: number[],
  max: number,
  topBox = 2
): { csat: number | null; avg: number | null; n: number } {
  const n = scores.length;
  if (n === 0) return { csat: null, avg: null, n };
  const threshold = max - (topBox - 1);
  const top = scores.filter((s) => s >= threshold).length;
  const avg = scores.reduce((a, b) => a + b, 0) / n;
  return { csat: Math.round((top / n) * 100), avg: Math.round(avg * 100) / 100, n };
}
