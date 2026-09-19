// Adaptador a AeroDataBox (vía RapidAPI) — la ruta para "datos reales".
//
// NO se activa sin la variable de entorno AERODATABOX_API_KEY (ver getFlightScheduleProvider).
// AeroDataBox expone el itinerario de un aeropuerto por ventanas de máx. 12 horas:
//   GET /flights/airports/iata/{IATA}/{fromLocal}/{toLocal}?direction=Departure
// con {fromLocal}/{toLocal} en hora LOCAL del aeropuerto (YYYY-MM-DDTHH:MM).
// Para una ventana de varios días encadenamos tramos de 12 h (con un tope de
// seguridad para no dispararnos el consumo del plan de RapidAPI).
//
// Doc: https://doc.aerodatabox.com/  ·  RapidAPI: https://rapidapi.com/aerodatabox/api/aerodatabox

import type { FlightScheduleProvider, FlightScheduleQuery, ScheduledFlight } from "./types";
import { airportName } from "./airports";

const HOST = "aerodatabox.p.rapidapi.com";
const CHUNK_HOURS = 12; // límite del endpoint
const MAX_CHUNKS = 62; // ~31 días; tope de seguridad de llamadas por consulta
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 h: recargas/re-aperturas de la misma ventana no gastan units

type AdbMovement = {
  scheduledTime?: { local?: string; utc?: string };
  terminal?: string;
  airport?: { iata?: string; icao?: string; name?: string };
};
type AdbFlight = {
  number?: string;
  status?: string;
  airline?: { name?: string; iata?: string };
  aircraft?: { model?: string };
  departure?: AdbMovement; // salida desde el aeropuerto consultado (origen)
  arrival?: AdbMovement; // llegada = aeropuerto de DESTINO (verificado en la respuesta real)
};

// "2026-09-19 08:30+02:00" | "2026-09-19T08:30" → { date, time }
function parseLocal(local?: string): { date: string; time: string } | null {
  if (!local) return null;
  const m = local.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? { date: m[1], time: m[2] } : null;
}

function normFlightNumber(raw?: string): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}
function airlineCodeFrom(number: string, iata?: string): string {
  if (iata) return iata.toUpperCase();
  const m = number.match(/^[A-Z0-9]{2}/);
  return m ? m[0] : "";
}

// Genera los tramos [inicio, fin) de CHUNK_HOURS que cubren [from 00:00, to+1 00:00).
function chunks(from: string, to: string): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z").getTime() + 86400000; // fin de día `to`
  for (let t = start.getTime(); t < end && out.length < MAX_CHUNKS; t += CHUNK_HOURS * 3600000) {
    const a = new Date(t);
    const b = new Date(Math.min(t + CHUNK_HOURS * 3600000, end));
    const fmt = (d: Date) => d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    out.push({ start: fmt(a), end: fmt(b) });
  }
  return out;
}

export function aeroDataBoxProvider(apiKey: string): FlightScheduleProvider {
  return {
    name: "aerodatabox",
    async getFlights({ origin, from, to }: FlightScheduleQuery): Promise<ScheduledFlight[]> {
      const iata = origin.toUpperCase();
      const seen = new Set<string>();
      const flights: ScheduledFlight[] = [];

      for (const { start, end } of chunks(from, to)) {
        const url =
          `https://${HOST}/flights/airports/iata/${iata}/${start}/${end}` +
          `?direction=Departure&withLeg=true&withCancelled=false&withCodeshared=false&withLocation=false`;
        // Caché de datos de Next: reusa la misma ventana durante CACHE_TTL_SECONDS
        // sin volver a gastar API units (clave para el plan gratis de 400/mes).
        // El chunking está alineado a 00:00/12:00, así que ventanas que se solapan
        // comparten los tramos de días ya consultados → aciertos de caché.
        const res = await fetch(url, {
          headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": HOST },
          next: { revalidate: CACHE_TTL_SECONDS },
        });
        if (!res.ok) {
          throw new Error(`AeroDataBox ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300));
        }
        const data = (await res.json()) as { departures?: AdbFlight[] };
        for (const f of data.departures ?? []) {
          const when = parseLocal(f.departure?.scheduledTime?.local);
          if (!when) continue;
          const flightNumber = normFlightNumber(f.number);
          const key = `${flightNumber}@${when.date}T${when.time}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const dest = f.arrival?.airport?.iata?.toUpperCase();
          flights.push({
            flightNumber,
            airlineCode: airlineCodeFrom(flightNumber, f.airline?.iata),
            airlineName: f.airline?.name ?? "",
            direction: "salida",
            origin: iata,
            originName: airportName(iata),
            destination: dest ?? "",
            destinationName: dest ? (f.arrival?.airport?.name ?? airportName(dest)) : f.arrival?.airport?.name,
            date: when.date,
            time: when.time,
            status: f.status ?? "scheduled",
            aircraft: f.aircraft?.model,
          });
        }
      }
      flights.sort((a, b) => {
        const ka = `${a.date}T${a.time}`;
        const kb = `${b.date}T${b.time}`;
        return ka < kb ? -1 : ka > kb ? 1 : a.flightNumber.localeCompare(b.flightNumber);
      });
      return flights;
    },
  };
}
