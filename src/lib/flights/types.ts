// Tipos compartidos del módulo de Planificación → Aeropuertos.
// Modelamos SALIDAS y LLEGADAS de un aeropuerto (el que estamos planificando).

/** Sentido del vuelo respecto al aeropuerto consultado. */
export type FlightDirection = "salida" | "llegada";

export type ScheduledFlight = {
  /** Número de vuelo comercial normalizado, ej. "LA123". */
  flightNumber: string;
  /** Código IATA de la aerolínea, ej. "LA". */
  airlineCode: string;
  /** Nombre de la aerolínea, ej. "LATAM Airlines". */
  airlineName: string;
  /** Sentido respecto al aeropuerto consultado: sale de él o llega a él. */
  direction: FlightDirection;
  /** IATA del aeropuerto de origen. */
  origin: string;
  /** Nombre legible del origen. */
  originName?: string;
  /** IATA del aeropuerto de destino. */
  destination: string;
  /** Nombre legible del destino. */
  destinationName?: string;
  /** Fecha local en el aeropuerto consultado, YYYY-MM-DD. */
  date: string;
  /** Hora local en el aeropuerto consultado (salida o llegada según direction), HH:MM. */
  time: string;
  /** Estado informado por la fuente (scheduled | delayed | …). */
  status?: string;
  /** Modelo de aeronave si la fuente lo entrega. */
  aircraft?: string;
};

/** Consulta que la app le hace al proveedor: vuelos de un aeropuerto en una ventana. */
export type FlightScheduleQuery = {
  /** IATA del aeropuerto consultado (3 letras). */
  origin: string;
  /** Inicio de la ventana, YYYY-MM-DD (local en el aeropuerto), inclusivo. */
  from: string;
  /** Fin de la ventana, YYYY-MM-DD (local en el aeropuerto), inclusivo. */
  to: string;
};

/** Un proveedor de itinerarios: db (tabla), mock (local) o una API real (AeroDataBox…). */
export interface FlightScheduleProvider {
  /** Identificador corto de la fuente; se muestra en la UI ("db", "aerodatabox", "mock"). */
  readonly name: string;
  /** Devuelve TODOS los vuelos (salidas y llegadas) del aeropuerto en la ventana.
   *  El filtrado por sentido/aerolínea lo aplica la UI. */
  getFlights(q: FlightScheduleQuery): Promise<ScheduledFlight[]>;
}
