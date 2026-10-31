// Plantillas y ediciones de informes (Postgres).
//
// Plantilla: qué módulos lleva un aeropuerto en un tipo de informe (ReportTemplate; si
// no hay fila, la del código). Edición: lo que se decide y escribe para un periodo
// (ReportEdition): módulos encendidos/apagados, análisis por módulo, comentarios y estado.
//
// Server-only.

import { prisma } from "@/lib/prisma";
import type { ReportKind } from "@/lib/reports/period";
import {
  applyToggles,
  defaultTemplate,
  parseNotes,
  parseTemplate,
  parseToggles,
  type ModuleNotes,
  type ModuleToggles,
  type TemplateEntry,
} from "@/lib/reports/modules";

export type EditionStatus = "BORRADOR" | "EMITIDO";

export type EditionState = {
  id: string | null; // null = aún no se ha guardado
  airport: string;
  kind: ReportKind;
  periodKey: string;
  focusSeason: string | null;
  status: EditionStatus;
  template: TemplateEntry[]; // plantilla del aeropuerto (sin los toggles de la edición)
  toggles: ModuleToggles;
  entries: TemplateEntry[]; // plantilla con los toggles aplicados
  notes: ModuleNotes;
  comentarios: string;
  updatedAt: string | null; // ISO
  emittedAt: string | null; // ISO
};

export async function getTemplate(airport: string, kind: ReportKind): Promise<TemplateEntry[]> {
  const row = await prisma.reportTemplate.findUnique({ where: { airport_kind: { airport, kind } } });
  return (row && parseTemplate(row.modules, kind)) ?? defaultTemplate(kind);
}

type EditionRow = Awaited<ReturnType<typeof prisma.reportEdition.findUnique>>;

function toState(
  airport: string,
  kind: ReportKind,
  periodKey: string,
  template: TemplateEntry[],
  row: EditionRow
): EditionState {
  const toggles = parseToggles(row?.modules);
  return {
    id: row?.id ?? null,
    airport,
    kind,
    periodKey,
    focusSeason: row?.focusSeason ?? null,
    status: row?.status === "EMITIDO" ? "EMITIDO" : "BORRADOR",
    template,
    toggles,
    entries: applyToggles(template, toggles),
    notes: parseNotes(row?.notes),
    comentarios: row?.comentarios ?? "",
    updatedAt: row?.updatedAt.toISOString() ?? null,
    emittedAt: row?.emittedAt?.toISOString() ?? null,
  };
}

/** Edición de un aeropuerto + tipo + periodo (vacía si aún no se ha guardado). */
export async function loadEdition(airport: string, kind: ReportKind, periodKey: string): Promise<EditionState> {
  const [template, row] = await Promise.all([
    getTemplate(airport, kind),
    prisma.reportEdition.findUnique({ where: { airport_kind_periodKey: { airport, kind, periodKey } } }),
  ]);
  return toState(airport, kind, periodKey, template, row);
}

/** Ediciones de varios aeropuertos para un mismo tipo + periodo (tarjetas de la página). */
export async function loadEditions(
  airports: string[],
  kind: ReportKind,
  periodKey: string
): Promise<Map<string, EditionState>> {
  const [templates, rows] = await Promise.all([
    prisma.reportTemplate.findMany({ where: { airport: { in: airports }, kind } }),
    prisma.reportEdition.findMany({ where: { airport: { in: airports }, kind, periodKey } }),
  ]);
  const out = new Map<string, EditionState>();
  for (const a of airports) {
    const t = templates.find((x) => x.airport === a);
    const template = (t && parseTemplate(t.modules, kind)) ?? defaultTemplate(kind);
    out.set(a, toState(a, kind, periodKey, template, rows.find((r) => r.airport === a) ?? null));
  }
  return out;
}
