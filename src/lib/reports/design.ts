// Tokens del "AIGS Design System" (template Workshop Deck), compartidos por el
// renderizador HTML imprimible y el generador de PPTX. Los hex van SIN '#'
// (formato que pide pptxgenjs); usar hx() para CSS.

export const AIGS = {
  ink: "0D0D0D", // títulos, texto fuerte
  muted: "7C828A", // etiquetas, captions
  body: "5B616E", // cuerpo
  blue: "003152", // azul AIGS (acento de marca)
  blueActive: "2A6D84",
  blueDisabled: "61718A",
  hairline: "DEE1E6", // divisores
  surfaceStrong: "EEF0F3", // fondo de píldoras/badges
  surfaceSoft: "F7F7F7", // banda suave
  up: "05B169", // verde (bajo estándar / cumple)
  down: "CF202F", // rojo (sobre estándar / no cumple)
  yellow: "F4B000", // acento
  white: "FFFFFF",
} as const;

// Fuentes seguras equivalentes al template (Arial = display+cuerpo; Courier New = números).
export const FONT = { face: "Arial", mono: "Courier New" } as const;

/** Hex con '#': para CSS. `hx("003152")` -> "#003152". */
export const hx = (c: string) => `#${c}`;

// Colores de las series del evolutivo (idénticos al dashboard).
export const SERIES = { prom: AIGS.blue, med: "3D7593", p90: "A9B2BF", meta: "D9B300", at: "E5893B" } as const;

const nfInt = new Intl.NumberFormat("es-CL");

/** Entero con separador de miles (es-CL). */
export function fmtInt(n: number | null | undefined): string {
  return n == null ? "—" : nfInt.format(Math.round(n));
}

/** Duración (minutos decimales) -> "MM:SS" (soporta negativos para márgenes). */
export function fmtMMSS(v: number | null | undefined): string {
  if (v == null) return "—";
  const total = Math.round(v * 60);
  const sign = total < 0 ? "−" : "";
  const a = Math.abs(total);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/**
 * Eje Y (minutos) de los gráficos de tiempos, común al deck HTML y al PPTX. Se ajusta a los
 * datos y nunca queda bajo el Estándar IATA: mientras los datos no lo superen, el tope es el
 * estándar; si lo superan, sube lo justo (con un margen) hasta el siguiente múltiplo del paso.
 */
export function timeAxis(values: (number | null | undefined)[], standard?: number | null) {
  const data = Math.max(0, ...values.map((v) => v ?? 0));
  const floor = standard ?? 0;
  const target = Math.max(1, data > floor ? data * 1.05 : floor);
  const step = [0.5, 1, 2, 5, 10, 15, 20, 30, 60].find((s) => target / s <= 6) ?? Math.ceil(target / 6 / 60) * 60;
  const max = Math.ceil(target / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  return { max, step, ticks };
}

/**
 * Ejes de la diapositiva de un proceso. El evolutivo incluye todo lo que dibuja, p90 incluido.
 * Los mini por aerolínea comparten una escala propia, sin el p90 (que no dibujan), para que
 * una cola extrema no aplaste sus promedios.
 */
export function processAxes(
  p: {
    meta: number | null;
    series: { prom: number | null; med: number | null; p90: number | null }[];
    byAirline: { meta: number | null; series: { prom: number | null }[] }[];
  },
  service?: (number | null)[]
) {
  const airlines = p.byAirline.slice(0, 6);
  return {
    main: timeAxis([...p.series.flatMap((s) => [s.prom, s.med, s.p90]), ...(service ?? [])], p.meta),
    mini: timeAxis(
      airlines.flatMap((a) => a.series.map((s) => s.prom)),
      Math.max(0, ...airlines.map((a) => a.meta ?? 0))
    ),
  };
}

/**
 * Base (y, hacia abajo) de las etiquetas de dos puntos del mismo mes, siempre sobre el punto
 * para no chocar con el eje X. Si están muy cerca, ambas van apiladas sobre el punto superior.
 */
export function stackPointLabels(a: number | null, b: number | null, gap: number, lineH: number): [number | null, number | null] {
  if (a == null || b == null) return [a == null ? null : a - gap, b == null ? null : b - gap];
  const upper = Math.min(a, b);
  const lower = Math.max(a, b);
  const close = lower - upper < lineH + gap;
  const lowerBase = (close ? upper : lower) - gap;
  const upperBase = close ? lowerBase - lineH : upper - gap;
  return a <= b ? [upperBase, lowerBase] : [lowerBase, upperBase];
}

/** Porcentaje de avance (0..100), acotado. */
export function pct(done: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
}

const nfDec1 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Nota 1–5 con un decimal ("4,3"). */
export function fmtScore(v: number | null | undefined): string {
  return v == null ? "—" : nfDec1.format(v);
}

/** NPS con signo ("+42", "−8", "0"). */
const nfDec2 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Nota con 2 decimales ("4,03"): ACI ASQ, donde las diferencias entre aeropuertos son de centésimas. */
export function fmtScore2(v: number | null | undefined): string {
  return v == null ? "—" : nfDec2.format(v);
}

export function fmtNps(v: number | null | undefined): string {
  if (v == null) return "—";
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0";
}

/** Semáforo de una nota 1–5: ≥4,0 verde · 3,5–3,9 amarillo · <3,5 rojo. */
export function scoreColor(v: number | null | undefined): string {
  if (v == null) return AIGS.muted;
  return v >= 4 ? AIGS.up : v >= 3.5 ? AIGS.yellow : AIGS.down;
}

// Estándar AIGS: nivel de servicio mínimo esperable en una nota 1–5 (ACI ASQ y AGA).
export const SCORE_STANDARD = 3.5;

// Series de las comparaciones con la industria: el aeropuerto en azul AIGS, el resto en segundo plano.
export const BENCH = { airport: AIGS.blue, chile: "2E9AA8", all: "A9B2BF" } as const;

// Notas 1–5 de una distribución, de peor a mejor (divergente: rojo ↔ gris ↔ azul).
export const LIKERT = ["B3261E", "E8A29C", "C9CED6", "7FB2C6", "1F5F86"] as const;

const hexRgb = (c: string) => [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hexRgb(a), hexRgb(b)];
  return x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
};
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * Celda de un mapa de calor de notas (divergente alrededor del Estándar AIGS, gris en el
 * centro). Devuelve el fondo y la tinta legible sobre él.
 */
export function scoreHeat(v: number | null | undefined): { fill: string; ink: string } {
  if (v == null) return { fill: AIGS.surfaceSoft, ink: AIGS.muted };
  const d = v - SCORE_STANDARD;
  const t = clamp01(Math.abs(d) / 1.1);
  const fill = d < 0 ? mix("EEF0F3", "B3261E", t) : mix("EEF0F3", "1F5F86", t);
  return { fill, ink: t > 0.55 ? AIGS.white : AIGS.ink };
}

/** Celda del mapa de tiempos (una sola tinta, de claro a oscuro: más minutos, más oscuro). */
export function timeHeat(v: number | null | undefined, max: number): { fill: string; ink: string } {
  if (v == null) return { fill: "F4F5F7", ink: AIGS.muted };
  const t = clamp01(max > 0 ? v / max : 0);
  const fill = t < 0.5 ? mix("FDF0E3", "EE9A4D", t * 2) : mix("EE9A4D", "9C1C14", (t - 0.5) * 2);
  return { fill, ink: t > 0.62 ? AIGS.white : AIGS.ink };
}

/** Color del NPS: ≥30 verde · 0–29 azul · negativo rojo. */
export function npsColor(v: number | null | undefined): string {
  if (v == null) return AIGS.muted;
  return v >= 30 ? AIGS.up : v >= 0 ? AIGS.blue : AIGS.down;
}

/** Nombre corto de aerolínea para etiquetas compactas de los mini-gráficos. */
export function shortAirline(a: string): string {
  return a
    .replace(/\s*Airlines?\b/i, "")
    .replace(/^Aerovías\s+/i, "")
    .replace(/\s+de Aviación$/i, "")
    .trim();
}
