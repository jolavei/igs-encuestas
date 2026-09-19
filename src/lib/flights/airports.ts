// Catálogo mínimo de aeropuertos chilenos para los selectores rápidos y para dar
// nombres legibles a los destinos. No pretende ser exhaustivo: son los aeropuertos
// con operación comercial relevante donde IGS levanta (o podría levantar) encuestas.
// La identidad real de cada sede vive en la BD (Location.iataCode/timezone); esto es
// solo apoyo para el prototipo y para el proveedor mock.

export type AirportInfo = {
  iata: string;
  name: string; // ciudad / nombre corto
  timezone: string; // IANA
};

export const AIRPORTS: Record<string, AirportInfo> = {
  SCL: { iata: "SCL", name: "Santiago", timezone: "America/Santiago" },
  IQQ: { iata: "IQQ", name: "Iquique", timezone: "America/Santiago" },
  CJC: { iata: "CJC", name: "Calama", timezone: "America/Santiago" },
  ANF: { iata: "ANF", name: "Antofagasta", timezone: "America/Santiago" },
  PMC: { iata: "PMC", name: "Puerto Montt", timezone: "America/Santiago" },
  PUQ: { iata: "PUQ", name: "Punta Arenas", timezone: "America/Punta_Arenas" },
  BBA: { iata: "BBA", name: "Balmaceda", timezone: "America/Santiago" },
  LSC: { iata: "LSC", name: "La Serena", timezone: "America/Santiago" },
  CCP: { iata: "CCP", name: "Concepción", timezone: "America/Santiago" },
  ZCO: { iata: "ZCO", name: "Temuco", timezone: "America/Santiago" },
  ZOS: { iata: "ZOS", name: "Osorno", timezone: "America/Santiago" },
  ZAL: { iata: "ZAL", name: "Valdivia", timezone: "America/Santiago" },
};

/** Aeropuertos ofrecidos como "acceso rápido" en el módulo (orden norte→sur aprox.). */
export const QUICK_PICK_AIRPORTS = ["IQQ", "CJC", "ANF", "LSC", "SCL", "CCP", "ZCO", "PMC", "BBA", "PUQ"];

export function airportName(iata: string): string {
  return AIRPORTS[iata]?.name ?? iata;
}

export function airportLabel(iata: string): string {
  const a = AIRPORTS[iata];
  return a ? `${a.name} (${a.iata})` : iata;
}
