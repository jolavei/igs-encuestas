// Proveedor MOCK de itinerarios de salida.
//
// Genera un cuadro de salidas verosímil y DETERMINÍSTICO por (aeropuerto, día): la
// misma consulta siempre devuelve lo mismo, para que el calendario sea estable.
// No llama a ninguna API ni requiere credenciales — es lo que hace demostrable la
// propuesta en local. Modela patrones reales de la operación doméstica chilena:
// olas de salida matinal y vespertina, hub en Santiago (SCL) y 2-3 rutas regionales.

import type { FlightScheduleProvider, FlightScheduleQuery, ScheduledFlight } from "./types";
import { AIRLINES } from "./airlines";
import { airportName } from "./airports";

// --- PRNG determinístico (xfnv1a + mulberry32) -----------------------------
function seedFrom(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Distribución horaria de salidas (índice = hora local 0..23) ------------
// Dos olas: mañana (06-09) y tarde (18-21), con actividad media al mediodía.
const HOUR_WEIGHTS = [
  0, 0, 0, 0, 1, 2, // 00-05
  7, 9, 8, 6, 5, 4, // 06-11
  4, 5, 4, 4, 5, 6, // 12-17
  8, 9, 7, 4, 2, 1, // 18-23
];

// Tamaño típico de operación por aeropuerto (vuelos de salida al día).
const DAILY_VOLUME: Record<string, { base: number; spread: number }> = {
  SCL: { base: 28, spread: 10 },
  IQQ: { base: 10, spread: 5 },
  CJC: { base: 11, spread: 5 },
  ANF: { base: 12, spread: 5 },
  PMC: { base: 12, spread: 6 },
  PUQ: { base: 7, spread: 4 },
  LSC: { base: 6, spread: 3 },
  CCP: { base: 10, spread: 4 },
  ZCO: { base: 6, spread: 3 },
  BBA: { base: 4, spread: 3 },
};
const DEFAULT_VOLUME = { base: 8, spread: 4 };

// Rutas de salida por aeropuerto (destinos IATA). Casi todo pasa por SCL + regional.
const ROUTES: Record<string, string[]> = {
  SCL: ["IQQ", "CJC", "ANF", "PMC", "PUQ", "LSC", "CCP", "ZCO", "BBA"],
  IQQ: ["SCL", "ANF", "CJC"],
  CJC: ["SCL", "ANF", "IQQ"],
  ANF: ["SCL", "IQQ", "CJC"],
  PMC: ["SCL", "PUQ", "BBA"],
  PUQ: ["SCL", "PMC", "BBA"],
  LSC: ["SCL", "ANF"],
  CCP: ["SCL"],
  ZCO: ["SCL"],
  BBA: ["SCL", "PMC"],
};
const DEFAULT_ROUTES = ["SCL"];

// Pondera el destino: el hub (SCL) concentra la mayoría de las frecuencias.
function pickDestination(origin: string, rnd: () => number): string {
  const dests = (ROUTES[origin] ?? DEFAULT_ROUTES).filter((d) => d !== origin);
  if (dests.length === 0) return "SCL";
  const weights = dests.map((d) => (d === "SCL" ? 4 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < dests.length; i++) {
    r -= weights[i];
    if (r <= 0) return dests[i];
  }
  return dests[dests.length - 1];
}

function pickWeighted<T extends { weight: number }>(items: T[], rnd: () => number): T {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let r = rnd() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function pickHour(rnd: () => number): number {
  const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let h = 0; h < 24; h++) {
    r -= HOUR_WEIGHTS[h];
    if (r <= 0) return h;
  }
  return 12;
}

// Itera días YYYY-MM-DD desde `from` hasta `to` inclusive (en UTC para no depender
// del huso del servidor; solo importan las fechas de calendario).
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function departuresForDay(origin: string, date: string): ScheduledFlight[] {
  const rnd = mulberry32(seedFrom(`${origin}|${date}`));
  const vol = DAILY_VOLUME[origin] ?? DEFAULT_VOLUME;
  const n = vol.base + Math.floor(rnd() * (vol.spread + 1));

  const seen = new Set<string>();
  const flights: ScheduledFlight[] = [];
  for (let i = 0; i < n; i++) {
    const airline = pickWeighted(AIRLINES, rnd);
    const hour = pickHour(rnd);
    const minute = Math.floor(rnd() * 12) * 5; // múltiplos de 5
    const num = 100 + Math.floor(rnd() * 900); // 100..999
    const flightNumber = `${airline.code}${num}`;
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const key = `${flightNumber}@${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const destination = pickDestination(origin, rnd);
    flights.push({
      flightNumber,
      airlineCode: airline.code,
      airlineName: airline.name,
      direction: "salida",
      origin,
      originName: airportName(origin),
      destination,
      destinationName: airportName(destination),
      date,
      time,
      status: "scheduled",
    });
  }
  flights.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.flightNumber.localeCompare(b.flightNumber)));
  return flights;
}

export function mockProvider(): FlightScheduleProvider {
  return {
    name: "mock",
    async getFlights({ origin, from, to }: FlightScheduleQuery): Promise<ScheduledFlight[]> {
      const iata = origin.toUpperCase();
      const all: ScheduledFlight[] = [];
      for (const day of eachDay(from, to)) all.push(...departuresForDay(iata, day));
      return all;
    },
  };
}
