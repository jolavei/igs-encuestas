// Mapeo declarativo de los 3 Google Sheets (Google Forms de tiempos de procesos)
// al esquema de la tabla `mediciones_de_tiempos` de la app.
//
// Los 3 formularios divergieron: IQQ y PMC tienen encabezados DUPLICADOS (una
// sección del form por proceso), así que cada campo se ubica por NOMBRE de
// encabezado + número de OCURRENCIA (occ, 1-based). CJC ya usa snake_case único.
// El script resuelve el índice real leyendo la fila 1 de cada hoja en tiempo de
// ejecución, así que si se agregan columnas antes/después el mapeo aguanta.
//
// Solo se consolidan Check-in, AVSEC y Retiro de equipaje (se excluye "Reporte
// Diario"). Los datos que no tienen columna destino (N° de counters, N° de
// máquinas de rayos X, aerolínea del retiro) se guardan en los `*_comments`.

export const SEDES = [
  {
    code: "IQQ",
    spreadsheetId: "138YVePO7RHs96iLrSbwFcNEfdzhlx7FC9kUkDwxtedA",
    tab: "Respuestas de formulario 2",
    location_name: "Aeropuerto Diego Aracena",
    company_name: "Aeropuerto Diego Aracena - Iquique",
    cols: {
      timestamp: { name: "Marca temporal" },
      process: { name: "Qué estás midiendo/ingresando?" },
      // Check-in
      checkin_airline: { name: "Aerolinea", occ: 1 },
      checkin_counters: { name: "Cantidad de counters de check in de la aerolínea atendiendo" },
      checkin_t1: { name: "Hora inicio medición", occ: 1 },
      checkin_t2: { name: "Hora fin medición", occ: 1 },
      // Retiro de equipaje
      retiro_airline: { name: "Aerolinea", occ: 2 },
      baggage_t1: { name: "Hora primer pasajero" },
      baggage_t2: { name: "Hora primera maleta" },
      baggage_t3: { name: "Hora ultima maleta" },
      // AVSEC
      avsec_xray: { name: "Cantidad de máquinas de rayos x abiertas" },
      avsec_t1: { name: "Hora inicio medición", occ: 2 },
      avsec_t2: { name: "Hora fin medición", occ: 2 },
      // General
      obs: { name: "Observaciones del día" },
    },
  },
  {
    code: "CJC",
    spreadsheetId: "1x5TD2j-2JqXcsnq25V6NNsf9-mU3LJODaYOIPCE74VQ",
    tab: "Respuestas de formulario 1",
    location_name: "Aeropuerto El Loa",
    company_name: "Aeropuerto El Loa - Calama",
    cols: {
      timestamp: { name: "timestamp" },
      process: { name: "proceso" },
      checkin_airline: { name: "aerolinea_check_in" },
      checkin_counters: { name: "Cantidad de counters de check in de la aerolínea atendiendo" },
      checkin_t1: { name: "inicio_check_in" },
      checkin_t2: { name: "fin_check_in" },
      retiro_airline: { name: "aerolinea_retiro_equipaje" },
      baggage_t1: { name: "hora_primer_pasajero" },
      baggage_t2: { name: "hora_primera_maleta" },
      baggage_t3: { name: "hora_ultima_maleta" },
      avsec_xray: { name: "Cantidad de máquinas de rayos x abiertas" },
      avsec_t1: { name: "inicio_avsec" },
      avsec_t2: { name: "fin_avsec" },
      obs: { name: "obesrvaciones" }, // (typo original en la hoja)
    },
  },
  {
    code: "PMC",
    spreadsheetId: "1T_TM6zZSceqRkKoDd6GlWhhmHtV-X0GX2fOtLRpxCtE",
    tab: "Respuestas de formulario 1",
    location_name: "Aeropuerto El Tepual",
    company_name: "Aeropuerto El Tepual - Puerto Montt",
    cols: {
      timestamp: { name: "Marca temporal" },
      process: { name: "Qué estás midiendo/ingresando?" },
      checkin_airline: { name: "Aerolinea CI" },
      checkin_t1: { name: "Hora inicio medición CI" },
      checkin_t2: { name: "Hora fin medición", occ: 1 }, // check-in fin (bare, 1ª ocurrencia)
      retiro_airline: { name: "Aerolinea RE" },
      baggage_t1: { name: "Hora primer pasajero RE" },
      baggage_t2: { name: "Hora primera maleta RE" },
      baggage_t3: { name: "Hora ultima maleta" },
      avsec_t1: { name: "Hora inicio medición AVSEC" },
      avsec_t2: { name: "Hora fin medición AVSEC" },
      obs: { name: "Observaciones del día" },
    },
  },
];

// --- Normalizadores de valores (para que el UNION calce con la app) ---

/** Devuelve el valor `process` de la app, o null si la fila se debe excluir. */
export function normalizeProcess(raw) {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return null;
  if (s.includes("check")) return "Check in";
  if (s.includes("avsec")) return "AVSEC";
  if (s.includes("retiro") || s.includes("equipaj")) return "Retiro de equipajes";
  return null; // "Reporte Diario" y cualquier otro -> fuera de alcance
}

// Opciones de aerolínea de la app (cuestionario "Mediciones de tiempos"):
//   LATAM Airlines - Counter | LATAM Airlines - Quiosco | SKY Airline |
//   JetSmart | Aerovías DAP | Boliviana de Aviación
/** Normaliza la aerolínea cruda de la hoja a la opción de la app (o null). */
export function normalizeAirline(raw) {
  const s = (raw || "").toLowerCase();
  if (!s.trim()) return null;
  if (s.includes("latam")) {
    if (s.includes("kiosko") || s.includes("kiosco") || s.includes("quiosco") || s.includes("self"))
      return "LATAM Airlines - Quiosco";
    // "bagdrop"/"counter" o sin modalidad -> Counter (supuesto: mostrador atendido)
    return "LATAM Airlines - Counter";
  }
  if (s.includes("sky")) return "SKY Airline";
  if (s.includes("jetsm") || s.includes("jestm") || s.includes("(ja)")) return "JetSmart";
  if (s.includes("dap")) return "Aerovías DAP";
  if (s.includes("boa") || s.includes("boliviana")) return "Boliviana de Aviación";
  return null; // desconocida -> se preserva el texto original en los comentarios
}
