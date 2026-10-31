// Catálogo de módulos de los informes y plantillas por defecto.
//
// Un informe = tipo (periodo) × plantilla del aeropuerto (qué módulos y en qué orden)
// × edición (lo que se escribe para ese periodo: análisis, comentarios, fotos y qué
// módulos se encienden o apagan). Este archivo define el catálogo y cómo se combinan
// plantilla y edición; cada módulo produce sus diapositivas en src/lib/reports/outline.ts.
//
// Puro (sin BD): lo usan el servidor, el editor (cliente) y las pruebas.

import type { ReportKind } from "@/lib/reports/period";

export type ModuleKey =
  | "asq-avance"
  | "asq-resultados"
  | "tiempos"
  | "aga-pasajeros"
  | "aga-acompanantes"
  | "fotos-comentarios"
  | "analisis";

export type ModuleDef = {
  key: ModuleKey;
  label: string;
  source: string; // de dónde salen los datos (se muestra en el editor)
  supports: ReportKind[]; // tipos en que el módulo puede aparecer
  ready: ReportKind[]; // tipos en que ya genera diapositivas (el resto: próxima fase)
  defaultOn: Partial<Record<ReportKind, boolean>>;
  notes: boolean; // admite un texto de análisis propio
  // Módulos con el mismo grupo y seguidos en la plantilla comparten divisor de sección.
  group?: string;
  // Encuesta propia: vista del cuestionario en src/lib/surveys/views.ts. Sumar otra
  // encuesta (Hotel, ARI…) es agregar una entrada con su vista.
  survey?: { view: "aga-pasajeros" | "aga-acompanantes"; audience: "Pasajeros" | "Acompañantes" };
};

const ALL: ReportKind[] = ["MENSUAL", "SEMESTRAL", "ANUAL"];

export const MODULES: ModuleDef[] = [
  {
    key: "analisis",
    label: "Análisis y recomendaciones",
    source: "Texto del consultor",
    supports: ALL,
    ready: ["MENSUAL"],
    defaultOn: { MENSUAL: false, SEMESTRAL: true, ANUAL: true },
    notes: true,
  },
  {
    key: "asq-avance",
    label: "ACI ASQ · Avance",
    source: "Scraper diario del portal ACI (Encuestas ASQ)",
    supports: ALL,
    ready: ["MENSUAL"],
    defaultOn: { MENSUAL: true, SEMESTRAL: false, ANUAL: false },
    notes: true,
  },
  {
    key: "asq-resultados",
    label: "ACI ASQ · Resultados",
    source: "Base semestral ACI (Ingesta ASQ → BigQuery)",
    supports: ["SEMESTRAL", "ANUAL"],
    ready: [],
    defaultOn: { SEMESTRAL: true, ANUAL: true },
    notes: true,
  },
  {
    key: "tiempos",
    label: "Mediciones de tiempos",
    source: "Cuestionario «Mediciones de tiempos» + histórico Sheets",
    supports: ALL,
    ready: ["MENSUAL"],
    defaultOn: { MENSUAL: true, SEMESTRAL: true, ANUAL: true },
    notes: true,
  },
  {
    key: "aga-pasajeros",
    label: "AGA Pasajeros",
    source: "«Encuesta AGA - Pasajeros»",
    supports: ALL,
    ready: ["MENSUAL"],
    defaultOn: { MENSUAL: true, SEMESTRAL: true, ANUAL: true },
    notes: true,
    group: "aga",
    survey: { view: "aga-pasajeros", audience: "Pasajeros" },
  },
  {
    key: "aga-acompanantes",
    label: "AGA Acompañantes",
    source: "«Encuesta AGA - Acompañantes»",
    supports: ALL,
    ready: ["MENSUAL"],
    defaultOn: { MENSUAL: true, SEMESTRAL: true, ANUAL: true },
    notes: true,
    group: "aga",
    survey: { view: "aga-acompanantes", audience: "Acompañantes" },
  },
  {
    key: "fotos-comentarios",
    label: "Fotos y comentarios",
    source: "Carga manual en esta edición",
    supports: ALL,
    ready: ["MENSUAL"],
    defaultOn: { MENSUAL: true, SEMESTRAL: false, ANUAL: false },
    notes: false,
  },
];

export const moduleDef = (key: string): ModuleDef | null => MODULES.find((m) => m.key === key) ?? null;

export type TemplateEntry = { key: ModuleKey; enabled: boolean };

// Orden por defecto de cada tipo. En el mensual, el análisis va al final (antes de
// comentarios); en semestral/anual abre el informe como resumen ejecutivo.
const DEFAULT_ORDER: Record<ReportKind, ModuleKey[]> = {
  MENSUAL: ["asq-avance", "tiempos", "aga-pasajeros", "aga-acompanantes", "analisis", "fotos-comentarios"],
  SEMESTRAL: ["analisis", "asq-resultados", "tiempos", "aga-pasajeros", "aga-acompanantes", "asq-avance", "fotos-comentarios"],
  ANUAL: ["analisis", "asq-resultados", "tiempos", "aga-pasajeros", "aga-acompanantes", "asq-avance", "fotos-comentarios"],
};

/**
 * Plantilla por defecto. Incluye los módulos de encuesta propia (AGA) para todos los
 * aeropuertos: si el aeropuerto no tiene plan de esa encuesta, el módulo no genera
 * diapositivas y la página lo muestra como "no aplica".
 */
export function defaultTemplate(kind: ReportKind): TemplateEntry[] {
  return DEFAULT_ORDER[kind].map((key) => ({ key, enabled: moduleDef(key)!.defaultOn[kind] ?? false }));
}

/** Normaliza una plantilla guardada en BD (JSON): descarta claves desconocidas o de otro tipo. */
export function parseTemplate(raw: unknown, kind: ReportKind): TemplateEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: TemplateEntry[] = [];
  for (const e of raw) {
    const key = (e as { key?: unknown })?.key;
    if (typeof key !== "string" || seen.has(key)) continue;
    const def = moduleDef(key);
    if (!def || !def.supports.includes(kind)) continue;
    seen.add(key);
    out.push({ key: def.key, enabled: (e as { enabled?: unknown }).enabled !== false });
  }
  return out.length > 0 ? out : null;
}

export type ModuleToggles = Partial<Record<ModuleKey, boolean>>;
export type ModuleNotes = Partial<Record<ModuleKey, string>>;

/** Lee el JSON de toggles de una edición. */
export function parseToggles(raw: unknown): ModuleToggles {
  const out: ModuleToggles = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (moduleDef(k) && typeof v === "boolean") out[k as ModuleKey] = v;
  return out;
}

/** Lee el JSON de análisis por módulo de una edición (solo módulos que admiten texto). */
export function parseNotes(raw: unknown): ModuleNotes {
  const out: ModuleNotes = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (moduleDef(k)?.notes && typeof v === "string" && v.trim()) out[k as ModuleKey] = v.trim();
  }
  return out;
}

/** Plantilla con los toggles de la edición aplicados (mismo orden). */
export function applyToggles(template: TemplateEntry[], toggles: ModuleToggles): TemplateEntry[] {
  return template.map((e) => ({ key: e.key, enabled: toggles[e.key] ?? e.enabled }));
}

/** Claves encendidas, en orden. */
export const enabledKeys = (entries: TemplateEntry[]): ModuleKey[] => entries.filter((e) => e.enabled).map((e) => e.key);
