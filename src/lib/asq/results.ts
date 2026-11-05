// Resultados ACI ASQ (microdata Departures en BigQuery) para los informes semestral y
// anual: satisfacción general y su evolutivo, ranking en el panel, categorías e índices,
// atributos con su distribución e importancia, apertura por aerolínea, estado emocional y
// perfil del pasajero.
//
// Reglas (codebook "Variable Value Tablet" del Excel de ACI):
//  - Promedios simples por encuesta: no se aplica el factor de ponderación de ACI (`Weight`).
//  - Atributos Q10 en escala 1–5; 0 = "no lo notó / no lo usó" → fuera del promedio.
//  - Benchmarks = promedio simple de los aeropuertos (cada aeropuerto pesa igual):
//    "Chile" = aeropuertos chilenos de la base; "América Latina" = los de esa región;
//    "Programa regional" = todos los aeropuertos de la temporada (el archivo Regional de ACI).
//
// Server-only.

import { bqQuery } from "@/lib/bigquery";
import { asqTableRef } from "@/lib/asq/ingestDepartures";
import { ASQ_AIRPORTS } from "@/lib/asq/airportList";
import { seasonFromCode, seasonOrder } from "@/lib/reports/period";

// Categorías de atributos, en el orden del viaje del pasajero.
export const ASQ_GROUPS = [
  { key: "Arrival_Category", label: "Accesos al aeropuerto" },
  { key: "Checkin_Category", label: "Check in" },
  { key: "Security_Category", label: "Filtro de Seguridad" },
  { key: "Border_Category", label: "Control migratorio" },
  { key: "RestShops_Category", label: "Restaurantes y tiendas" },
  { key: "Gates_Category", label: "Zona de puertas" },
  { key: "Throughout_Category", label: "A través del aeropuerto" },
  { key: "Atmosphere_Category", label: "Atmósfera del aeropuerto" },
] as const;
type GroupKey = (typeof ASQ_GROUPS)[number]["key"];

// Atributos Q10: columna, letra de la lista de importancia, categoría y etiqueta.
export const ASQ_ATTRIBUTES: { key: string; letter: string; group: GroupKey; label: string }[] = [
  { key: "Access_Ease", letter: "A", group: "Arrival_Category", label: "Facilidad de accesos" },
  { key: "Access_Signs", letter: "B", group: "Arrival_Category", label: "Señalética de accesos" },
  { key: "Transport_VFM", letter: "C", group: "Arrival_Category", label: "Relación calidad-precio de accesos" },
  { key: "Checkin_Ease", letter: "D", group: "Checkin_Category", label: "Facilidad de check in" },
  { key: "Checkin_Wait", letter: "E", group: "Checkin_Category", label: "Espera de check in" },
  { key: "Checkin_Staff", letter: "F", group: "Checkin_Category", label: "Personal de check in" },
  { key: "Security_Ease", letter: "G", group: "Security_Category", label: "Facilidad de filtro de seguridad" },
  { key: "Security_Wait", letter: "H", group: "Security_Category", label: "Espera de filtro de seguridad" },
  { key: "Security_Staff", letter: "I", group: "Security_Category", label: "Personal de filtro de seguridad" },
  { key: "Border_Wait", letter: "J", group: "Border_Category", label: "Espera de control migratorio" },
  { key: "Border_Staff", letter: "K", group: "Border_Category", label: "Personal de control migratorio" },
  { key: "Restaurants", letter: "L", group: "RestShops_Category", label: "Restaurantes" },
  { key: "Restaurants_VFM", letter: "M", group: "RestShops_Category", label: "Relación calidad-precio de restaurantes" },
  { key: "Shops", letter: "N", group: "RestShops_Category", label: "Tiendas" },
  { key: "Shops_VFM", letter: "O", group: "RestShops_Category", label: "Relación calidad-precio de tiendas" },
  { key: "RestShops_Staff", letter: "P", group: "RestShops_Category", label: "Personal de tiendas y restaurantes" },
  { key: "Gates_Comfort", letter: "Q", group: "Gates_Category", label: "Comodidad de salas de embarque" },
  { key: "Seats_Availability", letter: "R", group: "Gates_Category", label: "Disponibilidad de asientos" },
  { key: "Way_Ease", letter: "S", group: "Throughout_Category", label: "Facilidad de ubicarse en el terminal" },
  { key: "FlightInfo_Availability", letter: "T", group: "Throughout_Category", label: "Disponibilidad de información de vuelo" },
  { key: "Walking", letter: "U", group: "Throughout_Category", label: "Distancias a pie en el terminal" },
  { key: "Connect_Ease", letter: "V", group: "Throughout_Category", label: "Facilidad para hacer conexiones" },
  { key: "Airport_Staff", letter: "W", group: "Throughout_Category", label: "Personal del aeropuerto" },
  { key: "WiFi", letter: "X", group: "Throughout_Category", label: "Wifi" },
  { key: "Charging_Availability", letter: "Y", group: "Throughout_Category", label: "Disponibilidad de enchufes" },
  { key: "Entertainement", letter: "Z", group: "Throughout_Category", label: "Entretenimiento" },
  { key: "Washrooms_Availability", letter: "AA", group: "Throughout_Category", label: "Disponibilidad de baños" },
  { key: "Washrooms_Clean", letter: "BB", group: "Throughout_Category", label: "Limpieza de baños" },
  { key: "Health", letter: "CC", group: "Atmosphere_Category", label: "Condiciones higiénicas del terminal" },
  { key: "Clean", letter: "DD", group: "Atmosphere_Category", label: "Limpieza del terminal" },
  { key: "Ambience", letter: "EE", group: "Atmosphere_Category", label: "Ambiente del terminal" },
];

// Índices de calidad (promedios que ACI ya calcula por encuesta).
export const ASQ_INDICES = [
  { key: "Waiting_Index", label: "Índice de sensaciones de espera" },
  { key: "Ease_Index", label: "Índice de facilidad de procesos" },
  { key: "Staff_Index", label: "Índice de amabilidad del personal" },
] as const;

// Estado emocional del pasajero (escala 1–5).
export const ASQ_EMOTIONS = [
  { key: "Safe_Secure", label: "Seguridad" },
  { key: "Happy", label: "Felicidad" },
  { key: "Confident", label: "Confianza" },
  { key: "Excited", label: "Emoción" },
  { key: "Relaxed", label: "Tranquilidad" },
] as const;

// Satisfacción general + experiencia general, como categoría comparable con las demás.
const GENERAL_KEY = "General_Category";
const GENERAL_LABEL = "Satisfacción general";
const GENERAL_SQL = "(AVG(Overall_Sat) + AVG(NULLIF(Overall_Ex, 0))) / 2";

// Perfil del pasajero: dimensión → etiquetas de sus códigos (en orden).
const PROFILE: { key: AsqProfileKey; title: string; expr: string; labels: Record<string, string> }[] = [
  { key: "gender", title: "Género", expr: "CAST(Gender AS STRING)", labels: { "2": "Mujer", "1": "Hombre", "3": "Otro" } },
  { key: "reason", title: "Motivo del viaje", expr: "CAST(Reason AS STRING)", labels: { "1": "Trabajo", "2": "Placer", "3": "Personal" } },
  {
    key: "age",
    title: "Edad",
    expr: "CAST(Age AS STRING)",
    labels: { "1": "16–24", "2": "25–34", "3": "35–44", "4": "45–54", "5": "55–64", "6": "65–74", "7": "75 o más" },
  },
  {
    key: "anticipation",
    title: "Anticipación al vuelo",
    expr: "CAST(Time_Departure AS STRING)",
    labels: { "1": "< 1:00", "2": "1:00–1:30", "3": "1:31–2:00", "4": "2:01–3:00", "5": "3:01–5:00", "6": "5:01 o más" },
  },
  {
    key: "trips",
    title: "Viajes en avión al año",
    expr: "CAST(Number_Trip AS STRING)",
    labels: { "1": "1–2", "2": "3–5", "3": "6–10", "4": "11–20", "5": "21 o más" },
  },
];

const AIRLINE_LABEL: Record<string, string> = { LA: "LATAM (LA)", H2: "SKY (H2)", JA: "JetSMART (JA)", V5: "DAP (V5)" };
const airlineLabel = (c: string) => AIRLINE_LABEL[c] ?? c;

const countryName = (() => {
  const dn = new Intl.DisplayNames(["es"], { type: "region" });
  return (c: string) => {
    try {
      return dn.of(c) ?? c;
    } catch {
      return c;
    }
  };
})();

export type AsqProfileKey = "gender" | "reason" | "age" | "anticipation" | "trips" | "nationality";
export type AsqRankRow = { code: string; name: string; country: string; chile: boolean; own: boolean; avg: number; n: number };
export type AsqBench = { airport: number | null; chile: number | null; all: number | null; rankChile: number | null; totalChile: number };
export type AsqBest = { code: string; avg: number } | null;

export type AsqAttribute = {
  key: string;
  group: string;
  label: string;
  airport: number | null;
  chile: number | null;
  latam: number | null;
  all: number | null;
  bestChile: AsqBest;
  bestAll: AsqBest;
  n: number;
  importance: number | null;
  dist: number[]; // % de notas 1..5
  byAirline: Record<string, number | null>; // promedio por aerolínea (n ≥ 10)
};

export type AsqResults = {
  season: { code: string; label: string };
  n: number;
  overall: AsqBench & { top2: number | null; rankAll: number | null; totalAll: number };
  // Desde la primera temporada con encuestas del aeropuerto hasta la del informe.
  history: { code: string; airport: number | null; chile: number | null; all: number | null; n: number }[];
  rankingChile: AsqRankRow[];
  rankingAll: AsqRankRow[];
  categories: ({ key: string; label: string } & AsqBench)[]; // incluye Satisfacción general
  // Solo categorías con atributos respondidos (Control migratorio no aplica en domésticos).
  groups: { key: string; label: string; avg: number | null; attributes: AsqAttribute[] }[];
  attributes: AsqAttribute[];
  indices: ({ key: string; label: string } & AsqBench)[];
  emotions: ({ key: string; label: string } & AsqBench)[];
  categoryHistory: { key: string; label: string; airport: (number | null)[]; chile: (number | null)[]; all: (number | null)[] }[];
  airlines: { code: string; label: string; n: number; sat: number | null }[];
  profile: { key: AsqProfileKey; title: string; rows: { label: string; pct: number }[] }[];
  // Destino × aerolínea (% del total de encuestas).
  routes: { airlines: { code: string; label: string }[]; rows: { dest: string; cells: number[]; total: number }[] };
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

const MIN_N = 10; // bajo esto, un promedio de atributo no se informa ni compite como "mejor"

/** Resultados ACI ASQ de un aeropuerto en una temporada ("SU26"). null si no hay encuestas. */
export async function getAsqResults(code: string, season: string): Promise<AsqResults | null> {
  const T = `\`${asqTableRef()}\``;
  const s = seasonFromCode(season);
  if (!s) return null;

  const attrAvgs = ASQ_ATTRIBUTES.map((a) => `${avg(`NULLIF(${a.key}, 0)`)} AS ${a.key}`).join(",\n      ");
  // Promedio de todas las respuestas de la categoría, como en los informes de referencia.
  const groupAvgs = ASQ_GROUPS.map((g) => {
    const keys = ASQ_ATTRIBUTES.filter((a) => a.group === g.key).map((a) => a.key);
    const sum = keys.map((k) => `COALESCE(NULLIF(${k}, 0), 0)`).join(" + ");
    const count = keys.map((k) => `COUNTIF(${k} > 0)`).join(" + ");
    return `SAFE_DIVIDE(SUM(${sum}), ${count}) AS ${g.key}`;
  }).join(",\n      ");

  const perAirportSql = `
    SELECT Airport, ANY_VALUE(Airp_Region) AS region, COUNT(*) AS n,
      ${avg("Overall_Sat")} AS sat,
      SAFE_DIVIDE(COUNTIF(Overall_Sat >= 4), COUNT(Overall_Sat)) AS top2,
      ${GENERAL_SQL} AS ${GENERAL_KEY},
      ${groupAvgs},
      ${[...ASQ_INDICES].map((c) => `${avg(c.key)} AS ${c.key}`).join(",\n      ")},
      ${[...ASQ_EMOTIONS].map((c) => `${avg(`NULLIF(${c.key}, 0)`)} AS ${c.key}`).join(",\n      ")},
      ${attrAvgs},
      ${ASQ_ATTRIBUTES.map((a) => `COUNTIF(${a.key} > 0) AS n_${a.key}`).join(", ")}
    FROM ${T}
    WHERE Quarter = @q
    GROUP BY Airport`;

  const historySql = `
    SELECT Quarter, Airport, COUNT(*) AS n, ${avg("Overall_Sat")} AS sat,
      ${GENERAL_SQL} AS ${GENERAL_KEY},
      ${groupAvgs}
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
      UNION ALL SELECT 'nationality' AS dim, Nationality AS v, 1 AS w FROM ${T} WHERE Airport = @a AND Quarter = @q
    )
    WHERE v IS NOT NULL AND v != ''
    GROUP BY dim, v`;

  const distSql = `
    SELECT ${ASQ_ATTRIBUTES.flatMap((a) => [1, 2, 3, 4, 5].map((k) => `COUNTIF(${a.key} = ${k}) AS ${a.key}_${k}`)).join(", ")}
    FROM ${T}
    WHERE Airport = @a AND Quarter = @q`;

  const airlineSql = `
    SELECT Flight_Letters AS airline, COUNT(*) AS n, ${avg("Overall_Sat")} AS sat,
      ${attrAvgs},
      ${ASQ_ATTRIBUTES.map((a) => `COUNTIF(${a.key} > 0) AS n_${a.key}`).join(", ")}
    FROM ${T}
    WHERE Airport = @a AND Quarter = @q AND Flight_Letters IS NOT NULL AND Flight_Letters != ''
    GROUP BY airline`;

  const routesSql = `
    SELECT Flight_Destination AS dest, Flight_Letters AS airline, COUNT(*) AS n
    FROM ${T}
    WHERE Airport = @a AND Quarter = @q AND Flight_Destination IS NOT NULL AND Flight_Letters IS NOT NULL
    GROUP BY dest, airline`;

  type Row = Record<string, unknown> & { Airport: string };
  type Any = Record<string, unknown>;
  const params = { a: code, q: season };
  const [perAirport, history, importance, profile, distRows, airlineRows, routeRows] = await Promise.all([
    bqQuery<Row>(perAirportSql, { q: season }),
    bqQuery<Any>(historySql),
    bqQuery<Any>(importanceSql, params),
    bqQuery<Any>(profileSql, params),
    bqQuery<Any>(distSql, params),
    bqQuery<Any>(airlineSql, params),
    bqQuery<Any>(routesSql, params),
  ]);

  const own = perAirport.find((r) => r.Airport === code);
  if (!own || !val(own.n)) return null;
  const chileRows = perAirport.filter((r) => isChile(r.Airport));
  const latamRows = perAirport.filter((r) => r.region === "LA");
  const num = (r: Any, k: string) => val(r[k]);

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

  // Evolutivo: desde la primera temporada con encuestas del aeropuerto hasta la del informe
  // (las temporadas intermedias sin encuestas quedan vacías para el aeropuerto).
  const byQuarter = new Map<string, Any[]>();
  for (const h of history) {
    const q = String(h.Quarter);
    if (!byQuarter.has(q)) byQuarter.set(q, []);
    byQuarter.get(q)!.push(h);
  }
  const sorted = [...byQuarter.entries()]
    .map(([q, rows]) => ({ q, s: seasonFromCode(q), rows }))
    .filter((x) => x.s && seasonOrder(x.s) <= seasonOrder(s))
    .sort((a, b) => seasonOrder(a.s!) - seasonOrder(b.s!));
  const first = sorted.findIndex((x) => x.rows.some((r) => r.Airport === code));
  const hist = sorted.slice(Math.max(first, 0));
  const mineOf = (rows: Any[]) => rows.find((r) => r.Airport === code);
  const chileOf = (rows: Any[]) => rows.filter((r) => isChile(String(r.Airport)));
  const historyRows = hist.map(({ q, rows }) => {
    const mine = mineOf(rows);
    return {
      code: q,
      airport: round2(mine ? num(mine, "sat") : null),
      chile: round2(mean(chileOf(rows).map((r) => num(r, "sat")))),
      all: round2(mean(rows.map((r) => num(r, "sat")))),
      n: mine ? (num(mine, "n") ?? 0) : 0,
    };
  });
  const categoryHistory = [{ key: GENERAL_KEY, label: GENERAL_LABEL }, ...ASQ_GROUPS]
    .map((g) => ({
      key: g.key,
      label: g.label,
      airport: hist.map(({ rows }) => {
        const mine = mineOf(rows);
        return round2(mine ? num(mine, g.key) : null);
      }),
      chile: hist.map(({ rows }) => round2(mean(chileOf(rows).map((r) => num(r, g.key))))),
      all: hist.map(({ rows }) => round2(mean(rows.map((r) => num(r, g.key))))),
    }))
    .filter((g) => g.airport.some((v) => v != null));

  const impTotal = val(importance[0]?.total) ?? 0;
  const impByLetter = new Map(importance.map((r) => [String(r.letter).trim().toUpperCase(), val(r.n) ?? 0]));

  const airlines = airlineRows
    .map((r) => ({ code: String(r.airline), label: airlineLabel(String(r.airline)), n: num(r, "n") ?? 0, sat: round2(num(r, "sat")) }))
    .filter((x) => x.n >= MIN_N)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  const bestOf = (rows: Row[], k: string): AsqBest => {
    let best: AsqBest = null;
    for (const r of rows) {
      const v = num(r, k);
      if (v != null && (num(r, `n_${k}`) ?? 0) >= MIN_N && (!best || v > best.avg)) best = { code: r.Airport, avg: round2(v)! };
    }
    return best;
  };

  const dist = distRows[0] ?? {};
  const attributes: AsqAttribute[] = ASQ_ATTRIBUTES.map((a) => {
    const counts = [1, 2, 3, 4, 5].map((k) => num(dist, `${a.key}_${k}`) ?? 0);
    const total = counts.reduce((x, y) => x + y, 0);
    return {
      key: a.key,
      group: a.group,
      label: a.label,
      airport: round2(num(own, a.key)),
      chile: round2(mean(chileRows.map((r) => num(r, a.key)))),
      latam: round2(mean(latamRows.map((r) => num(r, a.key)))),
      all: round2(mean(perAirport.map((r) => num(r, a.key)))),
      bestChile: bestOf(chileRows, a.key),
      bestAll: bestOf(perAirport, a.key),
      n: num(own, `n_${a.key}`) ?? 0,
      importance: impTotal > 0 ? Math.round(((impByLetter.get(a.letter) ?? 0) / impTotal) * 100) : null,
      dist: counts.map((c) => (total > 0 ? Math.round((c / total) * 100) : 0)),
      byAirline: Object.fromEntries(
        airlines.map((al) => {
          const r = airlineRows.find((x) => String(x.airline) === al.code)!;
          return [al.code, (num(r, `n_${a.key}`) ?? 0) >= MIN_N ? round2(num(r, a.key)) : null];
        })
      ),
    };
  }).filter((a) => a.airport != null && a.n >= MIN_N);

  const groups = ASQ_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    avg: round2(num(own, g.key)),
    attributes: attributes.filter((a) => a.group === g.key),
  })).filter((g) => g.attributes.length > 0);

  const profiles = PROFILE.map((p) => {
    // Códigos fuera del codebook (p. ej. edad 8) no se cuentan.
    const rows = profile.filter((r) => r.dim === p.key && p.labels[String(r.v)]);
    const total = rows.reduce((a, r) => a + (val(r.w) ?? 0), 0);
    const order = Object.keys(p.labels);
    return {
      key: p.key,
      title: p.title,
      rows: rows
        .sort((a, b) => order.indexOf(String(a.v)) - order.indexOf(String(b.v)))
        .map((r) => ({ label: p.labels[String(r.v)], pct: total > 0 ? Math.round(((val(r.w) ?? 0) / total) * 100) : 0 })),
    };
  }).filter((p) => p.rows.length > 0);

  // Nacionalidad: las 4 principales + el resto.
  const nat = profile.filter((r) => r.dim === "nationality").sort((a, b) => (val(b.w) ?? 0) - (val(a.w) ?? 0));
  const natTotal = nat.reduce((a, r) => a + (val(r.w) ?? 0), 0);
  if (natTotal > 0) {
    const pctOf = (w: number) => Math.round((w / natTotal) * 100);
    const rest = nat.slice(4).reduce((a, r) => a + (val(r.w) ?? 0), 0);
    profiles.push({
      key: "nationality",
      title: "Nacionalidad",
      rows: [
        ...nat.slice(0, 4).map((r) => ({ label: countryName(String(r.v)), pct: pctOf(val(r.w) ?? 0) })),
        ...(rest > 0 ? [{ label: "Otras", pct: pctOf(rest) }] : []),
      ],
    });
  }

  // Destino × aerolínea: 6 destinos y 4 aerolíneas principales; el resto se agrupa.
  const routeTotal = routeRows.reduce((a, r) => a + (val(r.n) ?? 0), 0);
  const totalBy = (k: "dest" | "airline") => {
    const m = new Map<string, number>();
    for (const r of routeRows) m.set(String(r[k]), (m.get(String(r[k])) ?? 0) + (val(r.n) ?? 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  };
  const destAll = totalBy("dest");
  const airAll = totalBy("airline");
  const topAir = airAll.slice(0, 4);
  const destKeys = destAll.length > 6 ? [...destAll.slice(0, 5), "Otros"] : destAll;
  const airKeys = airAll.length > 4 ? [...topAir, "Otras"] : topAir;
  const destOf = (d: string) => (destKeys.includes(d) ? d : "Otros");
  const airOf = (a: string) => (airKeys.includes(a) ? a : "Otras");
  const routePct = (d: string, al: string | null) =>
    routeTotal === 0
      ? 0
      : Math.round(
          (routeRows
            .filter((r) => destOf(String(r.dest)) === d && (al == null || airOf(String(r.airline)) === al))
            .reduce((a, r) => a + (val(r.n) ?? 0), 0) /
            routeTotal) *
            1000
        ) / 10;
  const routes = {
    airlines: airKeys.map((c) => ({ code: c, label: c === "Otras" ? c : airlineLabel(c) })),
    rows: destKeys.map((d) => ({ dest: d, cells: airKeys.map((al) => routePct(d, al)), total: routePct(d, null) })),
  };

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
    history: historyRows,
    rankingChile: toRank(chileRows),
    rankingAll: toRank(perAirport),
    categories: [{ key: GENERAL_KEY, label: GENERAL_LABEL }, ...ASQ_GROUPS]
      .map((c) => ({ key: c.key, label: c.label, ...bench(c.key) }))
      .filter((c) => c.airport != null),
    groups,
    attributes,
    indices: ASQ_INDICES.map((c) => ({ key: c.key, label: c.label, ...bench(c.key) })),
    emotions: ASQ_EMOTIONS.map((c) => ({ key: c.key, label: c.label, ...bench(c.key) })),
    categoryHistory,
    airlines,
    profile: profiles,
    routes,
  };
}
