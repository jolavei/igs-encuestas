// Base de respuestas: filtros y orden de la grilla (estilo Google Sheets). Lógica pura,
// compartida cliente/servidor. Cada columna se filtra por valores (lista con casillas),
// por condición, o por ambos a la vez.
import { CHILE_TZ, chileDayToUtc } from "@/lib/dates";

export type ColumnKind = "text" | "number" | "date" | "multi" | "file";

export type GridColumn = {
  key: string;
  label: string;
  section: string | null; // sección del cuestionario ("Envío" en las columnas del envío)
  kind: ColumnKind;
  wide?: boolean; // texto largo (párrafo)
  meta?: boolean; // dato del envío, no una pregunta
};

// date: epoch en ms. number: número, o texto si la respuesta es "N/A" (calificación).
// multi: etiquetas elegidas. file: rutas en GCS. Sin respuesta = la celda no viene.
export type CellValue = string | number | string[];
export type GridRow = { id: string; cells: Record<string, CellValue> };

export type ConditionOp =
  | "empty"
  | "notEmpty"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "equals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "neq"
  | "between"
  | "notBetween"
  | "dateOn"
  | "dateBefore"
  | "dateAfter"
  | "dateBetween";

export type Condition = { op: ConditionOp; a?: string; b?: string };
export type ColumnFilter = { excluded?: string[]; condition?: Condition };
export type GridFilters = Record<string, ColumnFilter>;
export type GridSort = { key: string; dir: "asc" | "desc" } | null;

const COMMON_OPS: ConditionOp[] = ["empty", "notEmpty"];

export const CONDITION_LABELS: Record<ConditionOp, string> = {
  empty: "Está vacía",
  notEmpty: "No está vacía",
  contains: "El texto contiene",
  notContains: "El texto no contiene",
  startsWith: "El texto empieza por",
  endsWith: "El texto termina en",
  equals: "El texto es exactamente",
  gt: "Mayor que",
  gte: "Mayor o igual que",
  lt: "Menor que",
  lte: "Menor o igual que",
  eq: "Igual a",
  neq: "Distinto de",
  between: "Está entre",
  notBetween: "No está entre",
  dateOn: "La fecha es",
  dateBefore: "La fecha es anterior a",
  dateAfter: "La fecha es posterior a",
  dateBetween: "La fecha está entre",
};

/** Condiciones disponibles según el tipo de columna. */
export function conditionsFor(kind: ColumnKind): ConditionOp[] {
  if (kind === "number") {
    return [...COMMON_OPS, "gt", "gte", "lt", "lte", "eq", "neq", "between", "notBetween"];
  }
  if (kind === "date") return [...COMMON_OPS, "dateOn", "dateBefore", "dateAfter", "dateBetween"];
  return [...COMMON_OPS, "contains", "notContains", "startsWith", "endsWith", "equals"];
}

/** Cuántos valores pide la condición (0, 1 o 2 campos). */
export function conditionArity(op: ConditionOp): 0 | 1 | 2 {
  if (op === "empty" || op === "notEmpty") return 0;
  if (op === "between" || op === "notBetween" || op === "dateBetween") return 2;
  return 1;
}

const parseNum = (s?: string) => {
  const t = (s ?? "").trim().replace(",", ".");
  if (t === "") return NaN;
  return Number(t);
};

/** Una condición sin sus valores (o con valores inválidos) no filtra nada. */
export function conditionIsComplete(c: Condition): boolean {
  const arity = conditionArity(c.op);
  if (arity === 0) return true;
  const fields = arity === 2 ? [c.a, c.b] : [c.a];
  if (c.op.startsWith("date")) return fields.every((f) => chileDayToUtc(f ?? "") !== null);
  if (["gt", "gte", "lt", "lte", "eq", "neq", "between", "notBetween"].includes(c.op)) {
    return fields.every((f) => Number.isFinite(parseNum(f)));
  }
  return fields.every((f) => (f ?? "").trim() !== "");
}

// ---- Presentación ---------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat("es-CL", {
  timeZone: CHILE_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const numFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

// Formatear fechas es lo más caro de recorrer la grilla, y se repiten en cada filtro.
const dateCache = new Map<number, string>();
function formatDate(ms: number): string {
  let s = dateCache.get(ms);
  if (s === undefined) {
    s = dateFmt.format(ms).replace(", ", " ");
    dateCache.set(ms, s);
  }
  return s;
}

/** Nombre visible de un archivo subido (la ruta en GCS termina en "__<nombre>"). */
export const fileNameOf = (path: string) => path.split("__").pop() || path;

/** Texto de cada valor de la celda (una opción por elemento en casillas y archivos). */
export function cellParts(col: GridColumn, v: CellValue | undefined): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v)) return col.kind === "file" ? v.map(fileNameOf) : v;
  if (typeof v === "number") return [col.kind === "date" ? formatDate(v) : numFmt.format(v)];
  return [v];
}

export function cellText(col: GridColumn, v: CellValue | undefined): string {
  return cellParts(col, v).join(", ");
}

// ---- Filtros ----------------------------------------------------------------------

/** Etiqueta interna de las celdas sin respuesta en la lista de valores. */
export const BLANK = "";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

function matchesCondition(col: GridColumn, c: Condition, v: CellValue | undefined): boolean {
  const isEmpty = v === undefined || (Array.isArray(v) && v.length === 0) || v === "";
  if (c.op === "empty") return isEmpty;
  if (c.op === "notEmpty") return !isEmpty;

  switch (c.op) {
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "eq":
    case "neq":
    case "between":
    case "notBetween": {
      if (typeof v !== "number") return false; // "N/A" y vacías no son números
      const a = parseNum(c.a);
      const b = parseNum(c.b);
      if (c.op === "gt") return v > a;
      if (c.op === "gte") return v >= a;
      if (c.op === "lt") return v < a;
      if (c.op === "lte") return v <= a;
      if (c.op === "eq") return v === a;
      if (c.op === "neq") return v !== a;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const inside = v >= lo && v <= hi;
      return c.op === "between" ? inside : !inside;
    }
    case "dateOn":
    case "dateBefore":
    case "dateAfter":
    case "dateBetween": {
      if (typeof v !== "number") return false;
      const startA = chileDayToUtc(c.a ?? "", "start")!.getTime();
      const endA = chileDayToUtc(c.a ?? "", "end")!.getTime();
      if (c.op === "dateOn") return v >= startA && v <= endA;
      if (c.op === "dateBefore") return v < startA;
      if (c.op === "dateAfter") return v > endA;
      const startB = chileDayToUtc(c.b ?? "", "start")!.getTime();
      const endB = chileDayToUtc(c.b ?? "", "end")!.getTime();
      return v >= Math.min(startA, startB) && v <= Math.max(endA, endB);
    }
    default: {
      const needle = fold((c.a ?? "").trim());
      const parts = cellParts(col, v).map(fold);
      if (c.op === "notContains") return !parts.some((p) => p.includes(needle));
      if (isEmpty) return false;
      if (c.op === "contains") return parts.some((p) => p.includes(needle));
      if (c.op === "startsWith") return parts.some((p) => p.startsWith(needle));
      if (c.op === "endsWith") return parts.some((p) => p.endsWith(needle));
      return parts.some((p) => p === needle); // equals
    }
  }
}

/** Una celda de casillas pasa si al menos una de sus opciones sigue marcada. */
function matchesValues(col: GridColumn, excluded: Set<string>, v: CellValue | undefined): boolean {
  const parts = cellParts(col, v);
  if (parts.length === 0) return !excluded.has(BLANK);
  return parts.some((p) => !excluded.has(p));
}

export function isFilterActive(f: ColumnFilter | undefined): boolean {
  return !!f && ((f.excluded?.length ?? 0) > 0 || (!!f.condition && conditionIsComplete(f.condition)));
}

export function activeFilterCount(filters: GridFilters): number {
  return Object.values(filters).filter(isFilterActive).length;
}

/** Filas que pasan todos los filtros; `exceptKey` ignora el de esa columna. */
export function applyFilters(
  rows: GridRow[],
  columns: GridColumn[],
  filters: GridFilters,
  exceptKey?: string
): GridRow[] {
  const checks = columns.flatMap((col) => {
    const f = filters[col.key];
    if (col.key === exceptKey || !isFilterActive(f)) return [];
    const excluded = new Set(f.excluded ?? []);
    const cond = f.condition && conditionIsComplete(f.condition) ? f.condition : null;
    return [{ col, excluded, cond }];
  });
  if (checks.length === 0) return rows;
  return rows.filter((row) =>
    checks.every(({ col, excluded, cond }) => {
      const v = row.cells[col.key];
      if (excluded.size > 0 && !matchesValues(col, excluded, v)) return false;
      return !cond || matchesCondition(col, cond, v);
    })
  );
}

export type ColumnValue = { value: string; count: number };

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function compareCells(col: GridColumn, a: CellValue, b: CellValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "number") return -1; // números antes que texto ("N/A")
  if (typeof b === "number") return 1;
  return collator.compare(cellText(col, a), cellText(col, b));
}

/** Valores distintos de la columna con su conteo, en orden; las vacías van al final. */
export function columnValues(rows: GridRow[], col: GridColumn): ColumnValue[] {
  const seen = new Map<string, { raw: CellValue; count: number }>();
  let blanks = 0;
  for (const row of rows) {
    const v = row.cells[col.key];
    const parts = cellParts(col, v);
    if (parts.length === 0) blanks++;
    for (const value of parts) {
      const entry = seen.get(value);
      if (entry) entry.count++;
      else seen.set(value, { raw: Array.isArray(v) ? value : (v as CellValue), count: 1 });
    }
  }
  const out = [...seen.entries()]
    .sort(([, x], [, y]) => compareCells(col, x.raw, y.raw))
    .map(([value, { count }]) => ({ value, count }));
  if (blanks > 0) out.push({ value: BLANK, count: blanks });
  return out;
}

/** Ordena sin mutar. Como en Sheets, las vacías quedan al final en ambos sentidos. */
export function sortRows(rows: GridRow[], col: GridColumn, dir: "asc" | "desc"): GridRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = x.cells[col.key];
    const b = y.cells[col.key];
    if (a === undefined) return b === undefined ? 0 : 1;
    if (b === undefined) return -1;
    return sign * compareCells(col, a, b);
  });
}

/** Etiqueta de un valor en la lista del filtro. */
export const valueLabel = (value: string) => (value === BLANK ? "(Vacías)" : value);

/** Búsqueda dentro de la lista de valores (sin distinguir mayúsculas ni tildes). */
export function matchesSearch(value: string, search: string): boolean {
  return fold(valueLabel(value)).includes(fold(search.trim()));
}
