// Constantes y helpers PUROS del Dashboard de "Mediciones de tiempos".
// Sin dependencias de servidor: lo importan tanto la API route como el
// componente cliente (filtros, metas, temporadas, etiquetas de mes).

export const PROCESOS = [
  "Check in",
  "AVSEC",
  "Retiro de equipajes",
  "Pasaporte emigración",
  "Pasaporte inmigración",
  "Control aduana / SAG",
] as const;
export type Proceso = (typeof PROCESOS)[number];

export const FASES = ["espera", "descarga"] as const;
export type Fase = (typeof FASES)[number];

// Código corto (para los filtros) ↔ location_name en BigQuery ↔ nombre corto.
export const AIRPORTS = [
  { code: "IQQ", name: "Aeropuerto Diego Aracena", short: "Diego Aracena" },
  { code: "CJC", name: "Aeropuerto El Loa", short: "El Loa" },
  { code: "PMC", name: "Aeropuerto El Tepual", short: "El Tepual" },
] as const;
export type AirportCode = (typeof AIRPORTS)[number]["code"];

// Aerolíneas del CHECK IN (columna checkin_airline). LATAM se abre por modalidad
// (mostrador / autoatención), que sólo aplica al check-in.
export const AIRLINES = [
  "LATAM Airlines - Counter",
  "LATAM Airlines - Quiosco",
  "SKY Airline",
  "JetSmart",
  "Aerovías DAP",
  "Boliviana de Aviación",
] as const;

// Aerolíneas del RETIRO de equipaje (columna baggage_claim_airline). El retiro no
// tiene modalidad, así que LATAM va sin sufijo Counter/Quiosco.
export const AIRLINES_RETIRO = ["LATAM Airlines", "SKY Airline", "JetSmart"] as const;

// Unión de todas las aerolíneas válidas (para validar el parámetro en la API).
export const AIRLINES_ALL: string[] = [...new Set<string>([...AIRLINES, ...AIRLINES_RETIRO])];

// Opciones de aerolínea que ofrece el filtro según el proceso.
export function airlinesFor(proceso: Proceso): readonly string[] {
  if (proceso === "Check in") return AIRLINES;
  if (proceso === "Retiro de equipajes") return AIRLINES_RETIRO;
  return [];
}

// Umbral / meta en MINUTOS por proceso. En Check in depende de la modalidad:
// quiosco (autoatención) 5 min, counter (mostrador) 20 min. Pasaporte y aduana
// no tienen estándar definido → sin línea de meta.
export function metaFor(proceso: Proceso, airline: string): number | null {
  if (proceso === "Check in") return airline === "LATAM Airlines - Quiosco" ? 5 : 20;
  if (proceso === "AVSEC") return 10;
  if (proceso === "Retiro de equipajes") return 15;
  return null;
}

// Aerolínea estructurada: Check in usa checkin_airline; Retiro de equipajes usa
// baggage_claim_airline (poblada desde el histórico Google Forms). La app no
// captura la aerolínea del retiro, así que esas filas quedan NULL (sólo aparecen
// cuando el filtro está en "Todas").
export function hasAirline(proceso: Proceso): boolean {
  return proceso === "Check in" || proceso === "Retiro de equipajes";
}
export function hasFase(proceso: Proceso): boolean {
  return proceso === "Retiro de equipajes";
}

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// 'YYYY-MM' -> 'abr 2026'
export function ymLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MES[Number(m) - 1]} ${y}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export type Periodo = { label: string; from: string; to: string };

// Temporada que contiene la fecha dada. Verano: 1 abr – 30 sep.
// Invierno: 1 oct – 31 mar del año siguiente.
export function seasonOf(d: Date): Periodo {
  const y = d.getFullYear();
  const m = d.getMonth(); // 0 = enero
  if (m >= 3 && m <= 8) return { label: `Verano ${y}`, from: `${y}-04-01`, to: `${y}-09-30` };
  if (m >= 9)
    return {
      label: `Invierno ${y}-${String(y + 1).slice(2)}`,
      from: `${y}-10-01`,
      to: `${y + 1}-03-31`,
    };
  return {
    label: `Invierno ${y - 1}-${String(y).slice(2)}`,
    from: `${y - 1}-10-01`,
    to: `${y}-03-31`,
  };
}

// Construye la temporada a partir de su fecha ancla (1 abr = verano, 1 oct =
// invierno), tal como la devuelve la consulta de temporadas con datos en BigQuery.
export function seasonFromAnchor(anchor: string): Periodo {
  const [ys, ms] = anchor.split("-");
  const y = Number(ys);
  if (Number(ms) === 4) return { label: `Verano ${y}`, from: `${y}-04-01`, to: `${y}-09-30` };
  const y2 = y + 1;
  return { label: `Invierno ${y}-${String(y2).slice(2)}`, from: `${y}-10-01`, to: `${y2}-03-31` };
}

// Lista de meses 'YYYY-MM' entre dos fechas 'YYYY-MM-DD' (inclusive).
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (d <= end) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}
