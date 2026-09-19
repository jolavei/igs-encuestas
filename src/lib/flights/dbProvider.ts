// Proveedor que lee los itinerarios YA GUARDADOS en la BD (tabla FlightSchedule),
// poblada por el job scripts/planificacion-flights-job.mjs. Es la fuente por defecto
// para la app: las consultas de la página no gastan API units (a diferencia de pegarle
// a AeroDataBox en vivo). El job es quien consume units, 1×/mes.
//
// Devuelve salidas Y llegadas (la UI filtra por sentido).

import type { FlightDirection, FlightScheduleProvider, FlightScheduleQuery, ScheduledFlight } from "./types";
import { prisma } from "@/lib/prisma";

export function dbProvider(): FlightScheduleProvider {
  return {
    name: "db",
    async getFlights({ origin, from, to }: FlightScheduleQuery): Promise<ScheduledFlight[]> {
      const iata = origin.toUpperCase();
      const rows = await prisma.flightSchedule.findMany({
        where: {
          airportIata: iata,
          date: { gte: from, lte: to }, // date es String YYYY-MM-DD (orden lexicográfico = cronológico)
        },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      });
      return rows.map((r) => ({
        flightNumber: r.flightNumber,
        airlineCode: r.airlineCode ?? "",
        airlineName: r.airlineName ?? "",
        direction: (r.direction as FlightDirection) ?? "salida",
        origin: r.origin,
        originName: r.originName ?? undefined,
        destination: r.destination,
        destinationName: r.destinationName ?? undefined,
        date: r.date,
        time: r.time,
        status: undefined,
        aircraft: r.aircraft ?? undefined,
      }));
    },
  };
}
