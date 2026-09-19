// Aerolíneas usadas por el proveedor mock y ofrecidas como filtro en la UI.
// Son las que concentran la operación doméstica chilena.

export type AirlineInfo = {
  code: string; // IATA, ej. "LA"
  name: string;
  /** Peso relativo de participación (para repartir los vuelos en el mock). */
  weight: number;
};

export const AIRLINES: AirlineInfo[] = [
  { code: "LA", name: "LATAM Airlines", weight: 5 },
  { code: "H2", name: "SKY Airline", weight: 3 },
  { code: "JA", name: "JetSMART", weight: 2 },
];

export function airlineName(code: string): string {
  return AIRLINES.find((a) => a.code === code)?.name ?? code;
}
