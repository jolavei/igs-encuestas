// Periodos de los informes: tipos (Mensual / Semestral / Anual), temporadas ASQ y el
// contexto que reciben todos los módulos de un informe.
//
// Puro (sin BD ni BigQuery): lo usan el servidor, el cliente y las pruebas.
//
// Temporadas ASQ: Summer = abril–septiembre; Winter = octubre–marzo del año siguiente.
// Códigos como en la base de ACI: "SU26" = Summer 2026, "WI25" = Winter 2025-26.
// Año ASQ = Summer + el Winter que le sigue ("2025" = SU25 + WI25).

export type ReportKind = "MENSUAL" | "SEMESTRAL" | "ANUAL";
export const REPORT_KINDS: ReportKind[] = ["MENSUAL", "SEMESTRAL", "ANUAL"];

export const KIND_LABEL: Record<ReportKind, string> = {
  MENSUAL: "Mensual",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
};

/** Segmento de URL de cada tipo: /admin/informes/mensual/... */
export const KIND_SLUG: Record<ReportKind, string> = {
  MENSUAL: "mensual",
  SEMESTRAL: "semestral",
  ANUAL: "anual",
};

export function kindFromSlug(slug: string | null | undefined): ReportKind | null {
  const s = (slug ?? "").toLowerCase();
  return REPORT_KINDS.find((k) => KIND_SLUG[k] === s) ?? null;
}

export type Range = { from: string; to: string }; // YYYY-MM-DD, ambos inclusive

export type Season = {
  code: string; // "SU26" | "WI25"
  type: "SUMMER" | "WINTER";
  year: number; // año de inicio
  label: string; // "Summer 2026" | "Winter 2025-26"
  from: string;
  to: string;
};

export type PeriodContext = {
  kind: ReportKind;
  key: string; // "2026-10" | "SU26" | "2025"
  label: string; // "Octubre de 2026" | "Summer 2026" | "Año ASQ 2025"
  focus: Range & { label: string }; // mes, o temporada de detalle
  season: Season; // temporada del foco
  window: Range; // mensual: temporada a la fecha; semestral: la temporada; anual: el año ASQ
  compare: Season[]; // temporada anterior y la misma del año previo
  history: Season[]; // temporadas previas a la del foco, de la más antigua a la más reciente
  month: string | null; // solo mensual: "YYYY-MM"
};

/** Primera temporada con datos en las fuentes (microdata ASQ desde Summer 2019). */
export const FIRST_SEASON = "SU19";

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export function isValidSeasonCode(code: string): boolean {
  return /^(SU|WI)\d{2}$/.test(code);
}

export function isValidAsqYear(key: string): boolean {
  return /^20\d{2}$/.test(key);
}

export function seasonFromCode(code: string): Season | null {
  if (!isValidSeasonCode(code)) return null;
  const year = 2000 + Number(code.slice(2));
  if (code.startsWith("SU")) {
    return { code, type: "SUMMER", year, label: `Summer ${year}`, from: `${year}-04-01`, to: `${year}-09-30` };
  }
  const next = year + 1;
  return {
    code,
    type: "WINTER",
    year,
    label: `Winter ${year}-${String(next).slice(2)}`,
    from: `${year}-10-01`,
    to: `${next}-03-31`,
  };
}

const codeOf = (type: "SUMMER" | "WINTER", year: number) => `${type === "SUMMER" ? "SU" : "WI"}${pad(year % 100)}`;

/** Temporada que contiene un mes "YYYY-MM". */
export function seasonOfMonth(month: string): Season {
  const [y, m] = month.split("-").map(Number);
  if (m >= 4 && m <= 9) return seasonFromCode(codeOf("SUMMER", y))!;
  return seasonFromCode(codeOf("WINTER", m >= 10 ? y : y - 1))!;
}

export function prevSeason(s: Season): Season {
  return s.type === "WINTER" ? seasonFromCode(codeOf("SUMMER", s.year))! : seasonFromCode(codeOf("WINTER", s.year - 1))!;
}

export function nextSeason(s: Season): Season {
  return s.type === "SUMMER" ? seasonFromCode(codeOf("WINTER", s.year))! : seasonFromCode(codeOf("SUMMER", s.year + 1))!;
}

/** Orden cronológico (para comparar temporadas). */
export const seasonOrder = (s: Season) => s.year * 2 + (s.type === "WINTER" ? 1 : 0);

/** Temporadas desde FIRST_SEASON hasta la anterior a `s` (cronológico). */
export function seasonsBefore(s: Season): Season[] {
  const out: Season[] = [];
  let cur = seasonFromCode(FIRST_SEASON)!;
  while (seasonOrder(cur) < seasonOrder(s)) {
    out.push(cur);
    cur = nextSeason(cur);
  }
  return out;
}

/** Año ASQ: Summer de ese año + el Winter que le sigue. */
export function seasonsOfAsqYear(year: number): [Season, Season] {
  return [seasonFromCode(codeOf("SUMMER", year))!, seasonFromCode(codeOf("WINTER", year))!];
}

/** "YYYY-MM" -> "Octubre de 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 15))
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function compareOf(s: Season): Season[] {
  const prev = prevSeason(s);
  const lastYear = seasonFromCode(codeOf(s.type, s.year - 1))!;
  return prev.code === lastYear.code ? [prev] : [prev, lastYear];
}

/**
 * Resuelve el periodo de un informe. `focusSeason` solo aplica al anual (temporada de
 * detalle; por defecto el Winter del año). Devuelve null si la clave no es válida.
 */
export function resolvePeriod(kind: ReportKind, key: string, focusSeason?: string | null): PeriodContext | null {
  if (kind === "MENSUAL") {
    if (!isValidMonth(key)) return null;
    const [y, m] = key.split("-").map(Number);
    const season = seasonOfMonth(key);
    const focus = { from: `${key}-01`, to: `${key}-${pad(lastDay(y, m))}`, label: monthLabel(key) };
    return {
      kind,
      key,
      label: focus.label,
      focus,
      season,
      window: { from: season.from, to: focus.to },
      compare: [],
      history: [],
      month: key,
    };
  }

  if (kind === "SEMESTRAL") {
    const season = seasonFromCode(key);
    if (!season) return null;
    return {
      kind,
      key,
      label: season.label,
      focus: { from: season.from, to: season.to, label: season.label },
      season,
      window: { from: season.from, to: season.to },
      compare: compareOf(season),
      history: seasonsBefore(season),
      month: null,
    };
  }

  if (!isValidAsqYear(key)) return null;
  const year = Number(key);
  const [su, wi] = seasonsOfAsqYear(year);
  const season = focusSeason === su.code ? su : focusSeason == null || focusSeason === wi.code ? wi : null;
  if (!season) return null;
  return {
    kind,
    key,
    label: `Año ASQ ${year}`,
    focus: { from: season.from, to: season.to, label: season.label },
    season,
    window: { from: su.from, to: wi.to },
    compare: compareOf(season),
    history: seasonsBefore(season),
    month: null,
  };
}

/** Mes actual en hora de Chile, "YYYY-MM". */
export function currentMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" })
    .format(now)
    .slice(0, 7);
}

/** Periodo por defecto: el mes en curso, la última temporada cerrada o el último año ASQ cerrado. */
export function defaultPeriodKey(kind: ReportKind, month: string): string {
  if (kind === "MENSUAL") return month;
  const closed = prevSeason(seasonOfMonth(month));
  if (kind === "SEMESTRAL") return closed.code;
  // Un año ASQ cierra con su Winter: el último cerrado es el del Winter cerrado más reciente.
  return String(closed.type === "WINTER" ? closed.year : closed.year - 1);
}

export type PeriodOption = { value: string; label: string };

/** Opciones del selector de periodo, de la más reciente a la más antigua. */
export function periodOptions(kind: ReportKind, month: string, n = 12): PeriodOption[] {
  const out: PeriodOption[] = [];
  if (kind === "MENSUAL") {
    const [y0, m0] = month.split("-").map(Number);
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
      const v = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
      out.push({ value: v, label: monthLabel(v) });
    }
    return out;
  }
  const current = seasonOfMonth(month);
  if (kind === "SEMESTRAL") {
    let s = current;
    for (let i = 0; i < n; i++) {
      out.push({ value: s.code, label: s.code === current.code ? `${s.label} (en curso)` : s.label });
      s = prevSeason(s);
    }
    return out;
  }
  // Summer y Winter de un mismo año de inicio forman el año ASQ: el en curso es current.year.
  for (let y = current.year; y > current.year - Math.ceil(n / 2); y--) {
    const [su, wi] = seasonsOfAsqYear(y);
    out.push({ value: String(y), label: `Año ASQ ${y} (${su.code} + ${wi.code})${y === current.year ? " · en curso" : ""}` });
  }
  return out;
}

/** Clave de periodo válida en cualquier tipo: "2026-10", "SU26" o "2025". */
export function isValidPeriodKey(key: string): boolean {
  return isValidMonth(key) || isValidSeasonCode(key) || isValidAsqYear(key);
}
