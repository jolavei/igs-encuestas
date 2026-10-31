// Resultados ACI ASQ (microdata Departures en BigQuery) para los informes semestral y
// anual: satisfacción general y su evolutivo, ranking en el panel, categorías e índices,
// atributos con su importancia declarada y perfil del pasajero.
//
// Reglas (codebook "Variable Value Tablet" del Excel de ACI):
//  - Promedios simples por encuesta: no se aplica el factor de ponderación de ACI (`Weight`).
//  - Atributos Q10 en escala 1–5; 0 = "no lo notó / no lo usó" → fuera del promedio.
//  - Benchmarks = promedio simple de los aeropuertos (cada aeropuerto pesa igual):
//    "Chile" = aeropuertos chilenos de la base; "Base" = todos los aeropuertos de la temporada.
//
// Server-only.

import { bqQuery } from "@/lib/bigquery";
import { asqTableRef } from "@/lib/asq/ingestDepartures";
import { ASQ_AIRPORTS } from "@/lib/asq/airportList";
import { seasonFromCode, seasonOrder } from "@/lib/reports/period";

// Atributos Q10: columna, letra de la lista de importancia y etiqueta.
export const ASQ_ATTRIBUTES = [
  { key: "Access_Ease", letter: "A", label: "Facilidad para llegar al aeropuerto" },
  { key: "Access_Signs", letter: "B", label: "Señalización para acceder al terminal" },
  { key: "Transport_VFM", letter: "C", label: "Relación precio-calidad del transporte" },
  { key: "Checkin_Ease", letter: "D", label: "Facilidad para encontrar el check-in" },
  { key: "Checkin_Wait", letter: "E", label: "Espera en check-in y entrega de equipaje" },
  { key: "Checkin_Staff", letter: "F", label: "Amabilidad del personal de check-in" },
  { key: "Security_Ease", letter: "G", label: "Facilidad del control de seguridad" },
  { key: "Security_Wait", letter: "H", label: "Espera en el control de seguridad" },
  { key: "Security_Staff", letter: "I", label: "Amabilidad del personal de seguridad" },
  { key: "Border_Wait", letter: "J", label: "Espera en control migratorio" },
  { key: "Border_Staff", letter: "K", label: "Amabilidad del personal migratorio" },
  { key: "Restaurants", letter: "L", label: "Restaurantes, bares y cafeterías" },
  { key: "Restaurants_VFM", letter: "M", label: "Relación precio-calidad de restaurantes" },
  { key: "Shops", letter: "N", label: "Tiendas" },
  { key: "Shops_VFM", letter: "O", label: "Relación precio-calidad de tiendas" },
  { key: "RestShops_Staff", letter: "P", label: "Amabilidad del personal de tiendas y comida" },
  { key: "Gates_Comfort", letter: "Q", label: "Comodidad en las salas de embarque" },
  { key: "Seats_Availability", letter: "R", label: "Asientos disponibles en salas de embarque" },
  { key: "Way_Ease", letter: "S", label: "Facilidad para orientarse" },
  { key: "FlightInfo_Availability", letter: "T", label: "Información de vuelos (puerta y hora)" },
  { key: "Walking", letter: "U", label: "Distancias a pie dentro del terminal" },
  { key: "Connect_Ease", letter: "V", label: "Facilidad para hacer conexiones" },
  { key: "Airport_Staff", letter: "W", label: "Amabilidad del personal del aeropuerto" },
  { key: "WiFi", letter: "X", label: "Calidad del Wi-Fi" },
  { key: "Charging_Availability", letter: "Y", label: "Puntos de carga disponibles" },
  { key: "Entertainement", letter: "Z", label: "Entretención y ocio" },
  { key: "Washrooms_Availability", letter: "AA", label: "Disponibilidad de baños" },
  { key: "Washrooms_Clean", letter: "BB", label: "Limpieza de los baños" },
  { key: "Health", letter: "CC", label: "Seguridad sanitaria" },
  { key: "Clean", letter: "DD", label: "Limpieza del terminal" },
  { key: "Ambience", letter: "EE", label: "Ambiente del terminal" },
] as const;

// Categorías e índices (promedios que ACI ya calcula por encuesta).
export const ASQ_CATEGORIES = [
  { key: "Arrival_Category", label: "Llegada al aeropuerto", kind: "Categoría" },
  { key: "Checkin_Category", label: "Check-in", kind: "Categoría" },
  { key: "Security_Category", label: "Control de seguridad", kind: "Categoría" },
  { key: "Border_Category", label: "Control migratorio", kind: "Categoría" },
  { key: "RestShops_Category", label: "Tiendas y comida", kind: "Categoría" },
  { key: "Gates_Category", label: "Salas de embarque", kind: "Categoría" },
  { key: "Throughout_Category", label: "Recorrido por el aeropuerto", kind: "Categoría" },
  { key: "Atmosphere_Category", label: "Ambiente", kind: "Categoría" },
  { key: "Ease_Index", label: "Facilidad de viaje", kind: "Índice" },
  { key: "Waiting_Index", label: "Tiempos de espera", kind: "Índice" },
  { key: "Staff_Index", label: "Personal", kind: "Índice" },
] as const;

// Perfil del pasajero: dimensión → etiquetas de sus códigos.
const PROFILE: { key: string; title: string; expr: string; labels: Record<string, string> }[] = [
  { key: "reason", title: "Motivo del viaje", expr: "CAST(Reason AS STRING)", labels: { "1": "Trabajo", "2": "Placer", "3": "Personal" } },
  {
    key: "trips",
    title: "Viajes en avión al año",
    expr: "CAST(Number_Trip AS STRING)",
    labels: { "1": "1–2", "2": "3–5", "3": "6–10", "4": "11–20", "5": "21 o más" },
  },
  {
    key: "age",
    title: "Edad",
    expr: "CAST(Age AS STRING)",
    labels: { "1": "16–24", "2": "25–34", "3": "35–44", "4": "45–54", "5": "55–64", "6": "65–74", "7": "75 o más" },
  },
  { key: "gender", title: "Género", expr: "CAST(Gender AS STRING)", labels: { "1": "Hombre", "2": "Mujer", "3": "Otro" } },
  { key: "group", title: "Viaja", expr: "CAST(`Group` AS STRING)", labels: { "1": "Solo", "2": "Acompañado" } },
  {
    key: "residency",
    title: "Residencia",
    expr: "IF(Residency IS NULL, NULL, IF(Residency = 'CL', 'CL', 'X'))",
    labels: { CL: "Chile", X: "Extranjero" },
  },
];

export type AsqRankRow = { code: string; name: string; country: string; chile: boolean; own: boolean; avg: number; n: number };
export type AsqBench = { airport: number | null; chile: number | null; all: number | null; rankChile: number | null; totalChile: number };

export type AsqResults = {
  season: { code: string; label: string };
  n: number;
  overall: AsqBench & { top2: number | null; rankAll: number | null; totalAll: number };
  history: { code: string; airport: number | null; chile: number | null; all: number | null; n: number }[];
  rankingChile: AsqRankRow[];
  rankingAll: AsqRankRow[];
  categories: ({ key: string; label: string; kind: string } & AsqBench)[];
  attributes: { key: string; label: string; airport: number | null; chile: number | null; n: number; importance: number | null }[];
  profile: { title: string; rows: { label: string; pct: number }[] }[];
};

// Promedio simple (AVG ignora los NULL).
const avg = (x: string) => `AVG(${x})`;
const val = (v: unknown): number | null => {
  const x = (v as { value?: unknown })?.value ?? v;
  return x == null ? null : Number(x);
};
const round2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
const mean = (xs: (number | null)[]) => {
  const ok = xs.filter((x): x is number => x != null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
};
const isChile = (code: string) => ASQ_AIRPORTS[code]?.country === "CL";

/** Posición (1 = mejor) de `code` entre `rows` por `get`, o null si no tiene valor. */
function rankOf<T extends { Airport: string }>(rows: T[], code: string, get: (r: T) => number | null): number | null {
  const own = rows.find((r) => r.Airport === code);
  const v = own ? get(own) : null;
  if (v == null) return null;
  return 1 + rows.filter((r) => (get(r) ?? -Infinity) > v).length;
}

/** Resultados ACI ASQ de un aeropuerto en una temporada ("SU26"). null si no hay encuestas. */
export async function getAsqResults(code: string, season: string): Promise<AsqResults | null> {
  const T = `\`${asqTableRef()}\``;
  const s = seasonFromCode(season);
  if (!s) return null;

  const perAirportSql = `
    SELECT Airport, COUNT(*) AS n,
      ${avg("Overall_Sat")} AS sat,
      SAFE_DIVIDE(COUNTIF(Overall_Sat >= 4), COUNT(Overall_Sat)) AS top2,
      ${ASQ_CATEGORIES.map((c) => `${avg(c.key)} AS ${c.key}`).join(",\n      ")},
      ${ASQ_ATTRIBUTES.map((a) => `${avg(`NULLIF(${a.key}, 0)`)} AS ${a.key}, COUNTIF(${a.key} > 0) AS n_${a.key}`).join(",\n      ")}
    FROM ${T}
    WHERE Quarter = @q
    GROUP BY Airport`;

  const historySql = `
    SELECT Quarter, Airport, COUNT(*) AS n, ${avg("Overall_Sat")} AS sat
    FROM ${T}
    GROUP BY Quarter, Airport`;

  const importanceSql = `
    SELECT letter, COUNT(*) AS n,
      (SELECT COUNTIF(Important_1 IS NOT NULL) FROM ${T} WHERE Airport = @a AND Quarter = @q) AS total
    FROM ${T}, UNNEST([Important_1, Important_2, Important_3]) AS letter
    WHERE Airport = @a AND Quarter = @q AND letter IS NOT NULL AND letter != ''
    GROUP BY letter`;

  const profileSql = `
    SELECT dim, v, SUM(w) AS w FROM (
      ${PROFILE.map((p) => `SELECT '${p.key}' AS dim, ${p.expr} AS v, 1 AS w FROM ${T} WHERE Airport = @a AND Quarter = @q`).join("\n      UNION ALL ")}
    )
    WHERE v IS NOT NULL
    GROUP BY dim, v`;

  type Row = Record<string, unknown> & { Airport: string };
  const [perAirport, history, importance, profile] = await Promise.all([
    bqQuery<Row>(perAirportSql, { q: season }),
    bqQuery<Record<string, unknown>>(historySql),
    bqQuery<Record<string, unknown>>(importanceSql, { a: code, q: season }),
    bqQuery<Record<string, unknown>>(profileSql, { a: code, q: season }),
  ]);

  const own = perAirport.find((r) => r.Airport === code);
  if (!own || !val(own.n)) return null;
  const chileRows = perAirport.filter((r) => isChile(r.Airport));
  const num = (r: Row, k: string) => val(r[k]);

  const bench = (k: string): AsqBench => ({
    airport: round2(num(own, k)),
    chile: round2(mean(chileRows.map((r) => num(r, k)))),
    all: round2(mean(perAirport.map((r) => num(r, k)))),
    rankChile: rankOf(chileRows, code, (r) => num(r, k)),
    totalChile: chileRows.filter((r) => num(r, k) != null).length,
  });

  const toRank = (rows: Row[]): AsqRankRow[] =>
    rows
      .filter((r) => num(r, "sat") != null)
      .map((r) => ({
        code: r.Airport,
        name: ASQ_AIRPORTS[r.Airport]?.name ?? r.Airport,
        country: ASQ_AIRPORTS[r.Airport]?.country ?? "",
        chile: isChile(r.Airport),
        own: r.Airport === code,
        avg: round2(num(r, "sat"))!,
        n: num(r, "n") ?? 0,
      }))
      .sort((a, b) => b.avg - a.avg);

  // Evolutivo: temporadas hasta la del informe con datos del aeropuerto o del panel.
  const byQuarter = new Map<string, { code: string; sat: number | null; n: number }[]>();
  for (const h of history) {
    const q = String(h.Quarter);
    if (!byQuarter.has(q)) byQuarter.set(q, []);
    byQuarter.get(q)!.push({ code: String(h.Airport), sat: val(h.sat), n: val(h.n) ?? 0 });
  }
  const hist = [...byQuarter.entries()]
    .map(([q, rows]) => ({ q, s: seasonFromCode(q), rows }))
    .filter((x) => x.s && seasonOrder(x.s) <= seasonOrder(s))
    .sort((a, b) => seasonOrder(a.s!) - seasonOrder(b.s!))
    .map(({ q, rows }) => {
      const mine = rows.find((r) => r.code === code);
      return {
        code: q,
        airport: round2(mine?.sat ?? null),
        chile: round2(mean(rows.filter((r) => isChile(r.code)).map((r) => r.sat))),
        all: round2(mean(rows.map((r) => r.sat))),
        n: mine?.n ?? 0,
      };
    });

  const impTotal = val(importance[0]?.total) ?? 0;
  const impByLetter = new Map(importance.map((r) => [String(r.letter).trim().toUpperCase(), val(r.n) ?? 0]));

  const profiles = PROFILE.map((p) => {
    // Códigos fuera del codebook (p. ej. edad 8) no se cuentan.
    const rows = profile.filter((r) => r.dim === p.key && p.labels[String(r.v)]);
    const total = rows.reduce((a, r) => a + (val(r.w) ?? 0), 0);
    const acc = new Map<string, number>();
    for (const r of rows) {
      const label = p.labels[String(r.v)];
      acc.set(label, (acc.get(label) ?? 0) + (val(r.w) ?? 0));
    }
    const order = [...new Set(Object.values(p.labels))];
    return {
      title: p.title,
      rows: [...acc.entries()]
        .map(([label, w]) => ({ label, pct: total > 0 ? Math.round((w / total) * 100) : 0 }))
        .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)),
    };
  }).filter((p) => p.rows.length > 0);

  const overall = bench("sat");
  return {
    season: { code: season, label: s.label },
    n: num(own, "n") ?? 0,
    overall: {
      ...overall,
      top2: num(own, "top2") != null ? Math.round(num(own, "top2")! * 100) : null,
      rankAll: rankOf(perAirport, code, (r) => num(r, "sat")),
      totalAll: perAirport.filter((r) => num(r, "sat") != null).length,
    },
    history: hist,
    rankingChile: toRank(chileRows),
    rankingAll: toRank(perAirport),
    categories: ASQ_CATEGORIES.map((c) => ({ key: c.key, label: c.label, kind: c.kind, ...bench(c.key) })).filter(
      (c) => c.airport != null
    ),
    attributes: ASQ_ATTRIBUTES.map((a) => ({
      key: a.key,
      label: a.label,
      airport: round2(num(own, a.key)),
      chile: round2(mean(chileRows.map((r) => num(r, a.key)))),
      n: num(own, `n_${a.key}`) ?? 0,
      importance: impTotal > 0 ? Math.round(((impByLetter.get(a.letter) ?? 0) / impTotal) * 100) : null,
    })).filter((a) => a.airport != null && a.n >= 10),
    profile: profiles,
  };
}
