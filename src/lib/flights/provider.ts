// Selección del proveedor de itinerarios.
//
//   db          → lee de la tabla FlightSchedule (poblada por el job); la app NO gasta
//                 API units. Es la fuente recomendada para producción.
//   aerodatabox → consulta AeroDataBox EN VIVO (gasta units en cada consulta).
//   mock        → datos de demostración (sin credenciales); default.
//
// El diseño es enchufable: agregar otra fuente (AviationStack, FlightAware…) es
// escribir un módulo que implemente FlightScheduleProvider y sumar una rama aquí.
// Nada más de la app cambia.

import type { FlightScheduleProvider } from "./types";
import { mockProvider } from "./mockProvider";
import { aeroDataBoxProvider } from "./aeroDataBoxProvider";
import { dbProvider } from "./dbProvider";

export function getFlightScheduleProvider(): FlightScheduleProvider {
  const pref = (process.env.FLIGHTS_PROVIDER ?? "").trim().toLowerCase();
  const adbKey = process.env.AERODATABOX_API_KEY?.trim();

  if (pref === "db") return dbProvider();
  if (pref === "aerodatabox" && adbKey) return aeroDataBoxProvider(adbKey);

  // Mock por defecto (incluye el caso pref="mock" y el de no tener credenciales).
  return mockProvider();
}

export type { FlightScheduleProvider } from "./types";
