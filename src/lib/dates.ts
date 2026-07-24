// Fechas "de calendario" (ventanas de planes, fecha de nacimiento). Se ingresan
// con <input type="date"> como "YYYY-MM-DD" sin hora, y deben interpretarse en
// hora de Chile. `new Date("2026-07-23")` las lee como medianoche UTC, que en
// Santiago es el día anterior a las 20:00 — de ahí el corrimiento de un día.
export const CHILE_TZ = "America/Santiago";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHILE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// Diferencia (ms) entre el reloj de pared chileno y UTC para un instante dado.
// Se calcula por instante para respetar el horario de verano.
function chileOffsetMs(instant: Date) {
  const parts = partsFmt.formatToParts(instant);
  const at = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wall = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour"), at("minute"), at("second"));
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * "YYYY-MM-DD" → instante UTC del inicio (o fin) de ese día en Chile.
 * Devuelve null si el texto no es una fecha válida.
 */
export function chileDayToUtc(ymd: string, edge: "start" | "end" = "start"): Date | null {
  const m = YMD.exec(ymd.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];

  // Date.UTC normaliza los desbordes ("2026-13-40" → feb-2027): se rechazan.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }

  const wall =
    edge === "end"
      ? Date.UTC(y, mo - 1, d, 23, 59, 59, 999)
      : Date.UTC(y, mo - 1, d, 0, 0, 0, 0);

  // El offset depende del instante y el instante del offset, así que se prueban
  // dos candidatos. En días normales coinciden; en el cambio de horario de
  // verano difieren (en septiembre la medianoche local ni siquiera existe), y
  // ahí se elige el candidato que de verdad cae en el día pedido.
  const first = new Date(wall - chileOffsetMs(new Date(wall)));
  const second = new Date(wall - chileOffsetMs(first));
  const target = `${m[1]}-${m[2]}-${m[3]}`;
  const valid = [first, second].filter((c) => utcToChileDay(c) === target);
  if (valid.length === 0) return second;
  // El borde "start" es el instante más temprano del día; "end", el más tardío.
  return valid.reduce((a, b) => ((edge === "end" ? b > a : b < a) ? b : a));
}

/** Instante UTC → "YYYY-MM-DD" del día chileno (para <input type="date">). */
export function utcToChileDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
