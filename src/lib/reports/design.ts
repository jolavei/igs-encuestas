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
export const SERIES = { prom: AIGS.blue, med: "3D7593", p90: "A9B2BF", meta: "D9B300" } as const;

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
export function fmtNps(v: number | null | undefined): string {
  if (v == null) return "—";
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0";
}

/** Semáforo de una nota 1–5: ≥4,0 verde · 3,5–3,9 amarillo · <3,5 rojo. */
export function scoreColor(v: number | null | undefined): string {
  if (v == null) return AIGS.muted;
  return v >= 4 ? AIGS.up : v >= 3.5 ? AIGS.yellow : AIGS.down;
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
