// Histórico AGA: mapeo del formulario antiguo (Google Forms → Google Sheets) a una
// versión histórica (v0) de cada cuestionario AGA en la web.
//
// La versión histórica se arma con la MISMA estructura que usa la agregación de los
// informes y del Dashboard (aggregateAga): atributos = RATING en "Experiencia general
// del aeropuerto"; servicios = sección "<Servicio>" con una pregunta Sí/No + sección
// "<Servicio> — evaluación" con sus RATING. Donde una pregunta antigua equivale 1:1 a
// una de la web se usa el mismo texto (y, al importar, su equivalenceKey); el resto
// conserva su propia etiqueta.
//
// El formulario antiguo no tenía NPS ni "Satisfacción general": en el histórico esos
// indicadores quedan vacíos. Escala: Muy Bueno 5 · Bueno 4 · Regular 3 · Malo 2 ·
// Muy Malo 1 · No opina = N/A (no entra en promedios).
//
// Puro (sin BD ni red): lo usan el script scripts/importar-aga-historico.ts y las pruebas.

export type HistoricAudience = "Pasajeros" | "Acompañantes";

export type ColumnSpec =
  | { kind: "timestamp" }
  | { kind: "skip" }
  | { kind: "rating"; section: string; text: string }
  | { kind: "gate"; section: string; text: string }
  | { kind: "choice"; section: string; text: string; normalize?: (v: string) => string }
  | { kind: "text"; section: string; text: string };

type Rule = { test: (h: string) => boolean; spec: ColumnSpec };

export const CORE = "Experiencia general del aeropuerto";
const ev = (s: string) => `${s} — evaluación`;

/** Encabezado normalizado: minúsculas, espacios/tabs colapsados. */
export const normHeader = (h: string) => h.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

// Encabezado de la forma "<pregunta> [<ítem>]": la regla exige ambos fragmentos.
const item = (prefix: string, bracket: string, spec: ColumnSpec): Rule => ({
  test: (h) => h.startsWith(prefix) && h.includes(`[${bracket}`),
  spec,
});
const starts = (prefix: string, spec: ColumnSpec): Rule => ({ test: (h) => h.startsWith(prefix), spec });

const rating = (section: string, text: string): ColumnSpec => ({ kind: "rating", section, text });
const gate = (section: string, text: string): ColumnSpec => ({ kind: "gate", section, text });
const choice = (section: string, text: string, normalize?: (v: string) => string): ColumnSpec => ({
  kind: "choice",
  section,
  text,
  normalize,
});
const text = (section: string, t: string): ColumnSpec => ({ kind: "text", section, text: t });
const SKIP: ColumnSpec = { kind: "skip" };

const AIRLINES: Record<string, string> = {
  "LATAM - LA/LU": "LATAM Airlines",
  "SKY - H2": "SKY Airline",
  "JetSMART - JA": "JetSMART",
};
const SEX: Record<string, string> = { hombre: "Masculino", mujer: "Femenino" };
export const normAirline = (v: string) => AIRLINES[v] ?? v;
export const normSex = (v: string) => SEX[v.toLowerCase()] ?? v;

// Prefijos (normalizados) de las preguntas de matriz del formulario antiguo.
const P = {
  term: "¿qué nivel de satisfacción tiene usted con los siguientes aspectos del edificio terminal?",
  sshh: "evaluación servicios higiénicos del recinto",
  mob: "¿cuán satisfecho está usted acerca de los siguientes aspectos del mobiliario del recinto?",
  chk: "¿cuán satisfecho está usted acerca de proceso e infraestructura de check-in?",
  loc: "evaluación locales comerciales",
  com: "evaluación comidas y/o bebidas",
  avsec: "evaluación avsec",
  fin: "evaluación servicios financieros",
  mes: "evaluación mesón de informaciones",
  sen: "¿cómo calificaría usted la señalética del recinto?",
  vue: "¿que tan satisfecho está con el servicio de información de vuelos",
  wifi: "evaluación servicio de internet wi-fi",
  vip: "evalución salón vip",
  tra: "evaluación transporte público",
  est: "evaluación estacionamiento",
  son: "evalución sistema de sonido",
  ret: "evaluación retiro de equipaje",
  acc: "evaluación accesos movilidad reducida",
  prot: "evaluación de protocolos y equipamiento sanitario",
  prot2: "evaluación de los protocolos y equipamiento sanitario",
  csan: "evaluación control sanitario",
};

// Reglas comunes a ambos públicos (columnas con el mismo texto en los dos formularios).
const common = (o: {
  sshh: string; // sección de baños en la web de ese público
  sshhGate: string;
  sshhItems: [string, string, string];
  loc: string;
  locGate: string;
  locItems: [string, string, string, string, string, string];
  comGate: string;
  comItems: [string, string, string, string, string, string];
  mesGate: string;
  est: string;
  estItems: [string, string, string, string];
  design: string;
  clean: string;
  climate: string;
  lift: string;
  security: string;
  seats: string;
}): Rule[] => [
  item(P.term, "diseño", rating(CORE, o.design)),
  item(P.term, "limpieza", rating(CORE, o.clean)),
  item(P.term, "iluminación", rating(CORE, "Iluminación del recinto")),
  item(P.term, "climatización", rating(CORE, o.climate)),
  item(P.term, "cantidad y disponibilidad de locales", rating(CORE, "Cantidad y disponibilidad de locales comerciales")),
  item(P.term, "servicio de ascensor", rating(CORE, o.lift)),
  item(P.term, "seguridad recinto", rating(CORE, o.security)),
  item(P.term, "anuncios y publicidad", rating(CORE, "Anuncios y publicidad en el recinto")),

  starts("¿ha utilizado alguno de los servicios higiénicos", gate(o.sshh, o.sshhGate)),
  item(P.sshh, "aseo e higiene", rating(ev(o.sshh), o.sshhItems[0])),
  item(P.sshh, "estado de instalaciones", rating(ev(o.sshh), o.sshhItems[1])),
  item(P.sshh, "disponibilidad de insumos", rating(ev(o.sshh), o.sshhItems[2])),

  item(P.mob, "cantidad y calidad de asientos", rating(CORE, o.seats)),
  item(P.mob, "cantidad y calidad de carros", rating(CORE, "Cantidad y calidad de carros para equipaje")),
  item(P.mob, "cantidad y calidad de basureros", rating(CORE, "Cantidad y calidad de basureros")),

  starts("¿ha utilizado usted alguno de los locales comerciales", gate(o.loc, o.locGate)),
  starts("el local se encontraba", SKIP), // se repite en todas las filas; no aporta
  item(P.loc, "amabilidad", rating(ev(o.loc), o.locItems[0])),
  item(P.loc, "rapidez", rating(ev(o.loc), o.locItems[1])),
  item(P.loc, "variedad", rating(ev(o.loc), o.locItems[2])),
  item(P.loc, "calidad", rating(ev(o.loc), o.locItems[3])),
  item(P.loc, "higiene", rating(ev(o.loc), o.locItems[4])),
  item(P.loc, "relación", rating(ev(o.loc), o.locItems[5])),
  starts("¿cuánto tiempo destina usted en visitar los locales", choice(ev(o.loc), "Tiempo destinado a los locales comerciales")),

  starts("¿ha utilizado usted alguno de los servicios de comidas", gate("Comidas y bebidas", o.comGate)),
  item(P.com, "amabilidad", rating(ev("Comidas y bebidas"), o.comItems[0])),
  item(P.com, "rapidez", rating(ev("Comidas y bebidas"), o.comItems[1])),
  item(P.com, "variedad", rating(ev("Comidas y bebidas"), o.comItems[2])),
  item(P.com, "calidad", rating(ev("Comidas y bebidas"), o.comItems[3])),
  item(P.com, "higiene", rating(ev("Comidas y bebidas"), o.comItems[4])),
  item(P.com, "relación", rating(ev("Comidas y bebidas"), o.comItems[5])),
  starts("¿cuánto tiempo destina usted en utilizar los servicios de comidas", choice(ev("Comidas y bebidas"), "Tiempo destinado a comidas y bebidas")),

  starts("¿ha utilizado cajero automático", gate("Servicios financieros", "¿Usó cajero automático u otro servicio financiero?")),
  item(P.fin, "ubicación", rating(ev("Servicios financieros"), "Ubicación y visibilidad")),
  item(P.fin, "funcionamiento", rating(ev("Servicios financieros"), "Funcionamiento y disponibilidad de dinero")),

  starts("¿ha requerido algún servicio en el mesón", gate("Mesón de informaciones", o.mesGate)),
  item(P.mes, "amabilidad", rating(ev("Mesón de informaciones"), "Amabilidad en la atención")),
  item(P.mes, "rapidez", rating(ev("Mesón de informaciones"), "Rapidez en la atención")),
  item(P.mes, "calidad de respuesta", rating(ev("Mesón de informaciones"), "Calidad de la respuesta a lo requerido")),
  item(P.mes, "ubicación", rating(ev("Mesón de informaciones"), "Ubicación del punto de información")),

  item(P.sen, "cantidad y ubicación", rating(CORE, "Señalética: cantidad y ubicación")),
  item(P.sen, "calidad", rating(CORE, "Señalética: calidad y eficacia de la información")),
  item(P.sen, "señaletica de las vías", rating(CORE, "Señalética de vías de evacuación")),

  item(P.vue, "cantidad y ubicación", rating(CORE, "Información de vuelos: cantidad y ubicación de pantallas")),
  item(P.vue, "calidad de la información", rating(CORE, "Información de vuelos: legibilidad")),
  item(P.vue, "precisión de la información", rating(CORE, "Información de vuelos: precisión y actualización")),

  starts("¿ha utilizado el estacionamiento", gate(o.est, "¿Usó el estacionamiento del aeropuerto?")),
  item(P.est, "cantidad de estacionamientos", rating(ev(o.est), o.estItems[0])),
  item(P.est, "estado de pavimentos", rating(ev(o.est), o.estItems[1])),
  item(P.est, "seguridad recinto", rating(ev(o.est), o.estItems[2])),
  item(P.est, "relación precio", rating(ev(o.est), o.estItems[3])),

  ...[P.prot, P.prot2].flatMap((p) => [
    item(p, "disponibilidad y ubicación insumos", rating(CORE, "Insumos sanitarios: disponibilidad y ubicación")),
    item(p, "señálética", rating(CORE, "Señalética sanitaria")),
    item(p, "anuncios e información preventiva", rating(CORE, "Anuncios e información preventiva sanitaria")),
  ]),

  starts("¿cuál de los siguientes aspectos ud. valora positivamente", choice("Lo más importante para usted", "Aspecto que valora positivamente")),
  starts("¿cuál de los siguientes aspectos ud. valora negativamente", choice("Lo más importante para usted", "Aspecto que valora negativamente")),
];

const PAX_PROFILE = "Perfil del pasajero";

const PAX_RULES: Rule[] = [
  starts("timestamp", { kind: "timestamp" }),
  starts("compañia", choice("Registro del vuelo", "Aerolínea", normAirline)),
  starts("número de vuelo", text("Registro del vuelo", "Número de vuelo")),
  starts("destino", choice("Registro del vuelo", "Destino")),
  ...common({
    sshh: "Baños",
    sshhGate: "¿Usó los baños del aeropuerto?",
    sshhItems: ["Aseo e higiene de los baños", "Estado de las instalaciones y artefactos", "Disponibilidad de insumos (jabón y papel)"],
    loc: "Tiendas y comercio",
    locGate: "¿Compró o recorrió tiendas del aeropuerto?",
    locItems: [
      "Amabilidad del personal de ventas",
      "Rapidez en la atención",
      "Variedad de productos ofrecidos",
      "Calidad de productos ofrecidos",
      "Higiene del local",
      "Relación precio–calidad",
    ],
    comGate: "¿Consumió en cafeterías o servicios de comida?",
    comItems: [
      "Amabilidad en la atención",
      "Rapidez en la atención",
      "Variedad de productos ofrecidos",
      "Calidad de los productos",
      "Higiene y aseo del local",
      "Relación precio–calidad",
    ],
    mesGate: "¿Requirió atención en el mesón de informaciones al público?",
    est: "Estacionamiento",
    estItems: ["Disponibilidad de espacios", "Estado de pavimentos, aceras y señalización", "Seguridad del recinto", "Relación precio–calidad"],
    design: "Diseño, arquitectura y paisajismo del recinto",
    clean: "Limpieza general del terminal",
    climate: "Climatización",
    lift: "Servicio de ascensor y escala mecánica",
    security: "Sensación de seguridad dentro del recinto",
    seats: "Cantidad y calidad de asientos",
  }),

  // Check-in, AVSEC y control sanitario no tenían pregunta Sí/No: quien no los usó marcó "No opina".
  item(P.chk, "estado de los mesones", rating(ev("Check-in"), "Estado de los mesones de check-in")),
  item(P.chk, "disponibilidad de kioskos", rating(ev("Check-in"), "Disponibilidad de kioscos de autoatención")),
  item(P.chk, "amabilidad del personal", rating(ev("Check-in"), "Amabilidad del personal")),
  item(P.chk, "eficiencia del proceso", rating(ev("Check-in"), "Eficiencia del proceso")),

  item(P.avsec, "amabilidad", rating(ev("Control de seguridad"), "Amabilidad y formalidad del personal")),
  item(P.avsec, "prolijidad", rating(ev("Control de seguridad"), "Prolijidad en el control")),
  item(P.avsec, "eficiencia", rating(ev("Control de seguridad"), "Eficiencia del proceso de control")),

  starts("¿ha utilizado el servicio de internet wi-fi", gate("Wi-Fi", "¿Usó el Wi-Fi del aeropuerto?")),
  item(P.wifi, "facilidad", rating(ev("Wi-Fi"), "Facilidad para conectarse")),
  item(P.wifi, "velocidad", rating(ev("Wi-Fi"), "Velocidad de navegación")),

  starts("¿ha utilizado algún servicio del salón vip", gate("Salón VIP", "¿Usó el Salón VIP (CIP)?")),
  item(P.vip, "ambientación", rating(ev("Salón VIP"), "Confort y ambiente del salón")),
  item(P.vip, "amabilidad", rating(ev("Salón VIP"), "Amabilidad en la atención")),
  item(P.vip, "calidad y variedad", rating(ev("Salón VIP"), "Variedad y calidad de los servicios")),
  item(P.vip, "aseo", rating(ev("Salón VIP"), "Aseo e higiene del salón")),
  starts("¿cuánto tiempo destina usted en utilizar el salón vip", choice(ev("Salón VIP"), "Tiempo destinado al salón VIP")),

  starts("para llegar al aeropuerto ¿ha utilizado algún servicio de transporte público", gate("Transporte al aeropuerto", "¿Usó transporte público para llegar al aeropuerto?")),
  item(P.tra, "variedad", rating(ev("Transporte al aeropuerto"), "Variedad de transportes")),
  item(P.tra, "disponibilidad", rating(ev("Transporte al aeropuerto"), "Disponibilidad del transporte")),
  item(P.tra, "comodidad", rating(ev("Transporte al aeropuerto"), "Comodidad del transporte")),
  item(P.tra, "seguridad", rating(ev("Transporte al aeropuerto"), "Seguridad y puntualidad del transporte")),
  item(P.tra, "amabilidad", rating(ev("Transporte al aeropuerto"), "Amabilidad del personal del transporte")),
  item(P.tra, "relación", rating(ev("Transporte al aeropuerto"), "Relación precio–calidad")),
  item(P.tra, "aseo", rating(ev("Transporte al aeropuerto"), "Aseo e higiene del transporte")),

  item(P.son, "calidad del sonido", rating(CORE, "Sistema de sonido: calidad")),
  item(P.son, "precisión", rating(CORE, "Sistema de sonido: precisión de la información")),

  starts("¿ha utilizado los servicios de retiro de equipaje", gate("Retiro de equipaje", "¿Retiró equipaje en este aeropuerto?")),
  item(P.ret, "ambientación", rating(ev("Retiro de equipaje"), "Estado y ambiente de la sala de retiro")),
  item(P.ret, "eficiencia", rating(ev("Retiro de equipaje"), "Tiempo de entrega del equipaje")),

  starts("¿dispone usted de alguna discapacidad", gate("Accesibilidad", "¿Requiere facilidades de movilidad reducida o posee algún tipo de discapacidad?")),
  item(P.acc, "", rating(ev("Accesibilidad"), "Satisfacción con las facilidades para movilidad reducida")),

  item(P.csan, "amabilidad", rating(ev("Control sanitario"), "Amabilidad y atención del personal")),
  item(P.csan, "prolijidad", rating(ev("Control sanitario"), "Prolijidad en el control")),
  item(P.csan, "eficiencia", rating(ev("Control sanitario"), "Eficiencia del control sanitario")),

  starts("¿cuál es su motivo de viaje", choice(PAX_PROFILE, "Motivo principal de su viaje")),
  starts("edad", choice(PAX_PROFILE, "Edad")),
  starts("¿cuál es su sexo", choice(PAX_PROFILE, "Sexo", normSex)),
  starts("¿cuál es su nacionalidad", choice(PAX_PROFILE, "Nacionalidad")),
  starts("¿en cuánto tiempo calcula ud. su permanencia", choice(PAX_PROFILE, "Tiempo de permanencia en el aeropuerto")),
  starts("¿cuántas veces en el año viaja usted en avión", choice(PAX_PROFILE, "¿Con qué frecuencia viaja en avión?")),

  starts("¿qué destino visitó en la región de los lagos", text("Turismo regional (opcional)", "¿Qué destino visitó o visitará en la región del aeropuerto?")),
  starts("¿qué destino recomendaría en la región de los lagos", text("Turismo regional (opcional)", "¿Qué lugar recomendaría como imperdible en la región del aeropuerto?")),
  starts("¿cómo se enteró de la existencia del lugar", text("Turismo regional (opcional)", "¿Cómo se enteró del lugar imperdible?")),
];

const ACOMP_PROFILE = "Perfil del acompañante";

const ACOMP_RULES: Rule[] = [
  starts("marca temporal", { kind: "timestamp" }),
  ...common({
    sshh: "Servicios higiénicos",
    sshhGate: "¿Usó los servicios higiénicos del aeropuerto?",
    sshhItems: [
      "Aseo e higiene de los baños",
      "Estado de las instalaciones y artefactos sanitarios",
      "Disponibilidad de insumos (jabón y papel)",
    ],
    loc: "Locales comerciales",
    locGate: "¿Visitó o compró en los locales comerciales del aeropuerto?",
    locItems: [
      "Amabilidad del personal de ventas",
      "Rapidez en la atención",
      "Variedad de productos ofrecidos",
      "Calidad de los productos ofrecidos",
      "Higiene del local",
      "Relación precio–calidad",
    ],
    comGate: "¿Consumió en cafeterías o servicios de comida y bebida?",
    comItems: [
      "Amabilidad en la atención",
      "Rapidez en la atención",
      "Variedad de productos ofrecidos",
      "Calidad de los productos ofrecidos",
      "Higiene y aseo del local",
      "Relación precio–calidad",
    ],
    mesGate: "¿Requirió atención en el mesón de informaciones al público?",
    est: "Estacionamientos",
    estItems: [
      "Cantidad y disponibilidad de estacionamientos",
      "Estado de pavimentos, aceras y señalización",
      "Seguridad del recinto",
      "Relación precio–calidad",
    ],
    design: "Diseño, arquitectura y ambientación del terminal",
    clean: "Limpieza y aseo general de las instalaciones",
    climate: "Climatización (temperatura del terminal)",
    lift: "Funcionamiento de ascensores y escaleras mecánicas",
    security: "Sensación de seguridad en el recinto (personal de seguridad)",
    seats: "Confort del área de espera: cantidad y calidad de asientos",
  }),
  starts("edad", choice(ACOMP_PROFILE, "Edad")),
  starts("¿cuál es su sexo", choice(ACOMP_PROFILE, "Sexo", normSex)),
  starts("¿cuál es su nacionalidad", choice(ACOMP_PROFILE, "Nacionalidad")),
  starts("¿con qué concepto relaciona usted este aeropuerto", choice("Percepción de marca", "¿Con qué concepto relaciona usted este aeropuerto?")),
];

export const HISTORIC_RULES: Record<HistoricAudience, Rule[]> = { Pasajeros: PAX_RULES, Acompañantes: ACOMP_RULES };

/** Especificación de cada columna (null = sin regla: el importador la reporta y se detiene). */
export function mapColumns(audience: HistoricAudience, headers: string[]): (ColumnSpec | null)[] {
  const rules = HISTORIC_RULES[audience];
  return headers.map((h) => {
    const n = normHeader(h);
    if (!n) return SKIP; // columnas vacías al final de la hoja
    return rules.find((r) => r.test(n))?.spec ?? null;
  });
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

const SCALE: Record<string, number> = { "muy bueno": 5, bueno: 4, regular: 3, malo: 2, "muy malo": 1 };
const NO_OPINION = /^-?\s*no opina\s*-?$/i;

export type RatingValue = { num: number } | { na: true } | null; // null = sin respuesta

/** Texto de la escala antigua → nota 1–5, N/A ("No opina") o sin respuesta. undefined = valor desconocido. */
export function ratingOf(raw: string): RatingValue | undefined {
  const v = raw.trim().toLowerCase();
  if (!v || v === "-") return null;
  if (NO_OPINION.test(v)) return { na: true };
  const n = SCALE[v];
  return n == null ? undefined : { num: n };
}

/** Sí/No del formulario → "Sí" | "No" | null. */
export function gateOf(raw: string): "Sí" | "No" | null {
  const v = raw.trim().toLowerCase();
  if (v === "sí" || v === "si") return "Sí";
  if (v === "no") return "No";
  return null;
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const TZ = "America/Santiago";

/** Desfase (ms) de Chile respecto de UTC en un instante dado. */
function tzOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - utcMs;
}

/** Hora de reloj de Chile → instante UTC. */
export function chileWallToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = wall - tzOffsetMs(wall);
  utc = wall - tzOffsetMs(utc); // segunda pasada: corrige en los cambios de horario
  return new Date(utc);
}

/**
 * Marca temporal de Google Forms (hora de Chile) → instante UTC. Acepta el número de
 * serie de Sheets (días desde 1899-12-30) o texto "D/M/AAAA H:MM:SS" / "M/D/AAAA …"
 * (la hoja de pasajeros mezcla ambos formatos). En texto ambiguo (día y mes ≤ 12) se
 * asume D/M, el formato chileno.
 */
export function parseFormTimestamp(raw: unknown): Date | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = Math.round(raw * 86400000);
    const t = new Date(Date.UTC(1899, 11, 30) + ms);
    return chileWallToUtc(
      t.getUTCFullYear(),
      t.getUTCMonth() + 1,
      t.getUTCDate(),
      t.getUTCHours(),
      t.getUTCMinutes(),
      t.getUTCSeconds()
    );
  }
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const [day, month] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return chileWallToUtc(Number(m[3]), month, day, Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}

/** Día de Chile "YYYY-MM-DD" de un instante. */
export const chileDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

export type HistoricAnswer = { col: number; num: number | null; text: string | null };
export type HistoricRow = { createdAt: Date; answers: HistoricAnswer[] };
export type RowIssue = { row: number; col: number; value: string; reason: string };

/**
 * Convierte una fila de la hoja en respuestas. Si un servicio dice "No", sus notas se
 * descartan (igual que la web). Devuelve null si la fila no tiene fecha válida.
 */
export function convertRow(
  specs: (ColumnSpec | null)[],
  row: unknown[],
  rowNumber: number,
  issues: RowIssue[]
): HistoricRow | null {
  const tsCol = specs.findIndex((s) => s?.kind === "timestamp");
  const createdAt = parseFormTimestamp(row[tsCol]);
  if (!createdAt) {
    issues.push({ row: rowNumber, col: tsCol, value: String(row[tsCol] ?? ""), reason: "fecha inválida" });
    return null;
  }

  const closed = new Set<string>(); // servicios con gate "No"
  specs.forEach((s, i) => {
    if (s?.kind === "gate" && gateOf(String(row[i] ?? "")) === "No") closed.add(s.section);
  });

  const answers: HistoricAnswer[] = [];
  specs.forEach((s, i) => {
    if (!s || s.kind === "timestamp" || s.kind === "skip") return;
    const raw = String(row[i] ?? "").trim();
    if (!raw || raw === "-") return;
    if (s.kind === "rating") {
      const base = s.section.replace(/\s*—\s*evaluación$/, "");
      if (base !== s.section && closed.has(base)) return;
      const r = ratingOf(raw);
      if (r === undefined) issues.push({ row: rowNumber, col: i, value: raw, reason: "valor fuera de escala" });
      else if (r && "num" in r) answers.push({ col: i, num: r.num, text: null });
      else if (r) answers.push({ col: i, num: null, text: "N/A" });
      return;
    }
    if (s.kind === "gate") {
      const g = gateOf(raw);
      if (g) answers.push({ col: i, num: null, text: g });
      else issues.push({ row: rowNumber, col: i, value: raw, reason: "Sí/No inválido" });
      return;
    }
    if (s.kind === "choice") {
      answers.push({ col: i, num: null, text: s.normalize ? s.normalize(raw) : raw });
      return;
    }
    answers.push({ col: i, num: null, text: raw });
  });
  return { createdAt, answers };
}

/** Secciones de la versión histórica, en el orden en que aparecen las columnas. */
export function sectionsOf(specs: (ColumnSpec | null)[]): string[] {
  const out: string[] = [];
  for (const s of specs) {
    if (!s || s.kind === "timestamp" || s.kind === "skip") continue;
    if (!out.includes(s.section)) out.push(s.section);
  }
  return out;
}
