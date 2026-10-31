// Secuencia de diapositivas de un informe, a partir de los módulos encendidos (en el
// orden de la plantilla) y de lo que hay en los datos. La comparten el deck HTML, el
// PPTX y la vista previa del editor, así los tres muestran siempre lo mismo.
//
// Puro (sin BD). Semestral y anual reutilizan las diapositivas del mensual (con la
// temporada de detalle en lugar del mes) y agregan las propias: resumen ejecutivo,
// resumen de tiempos vs Estándar IATA, histórico por temporada, franjas horarias,
// evolución AGA y recomendaciones.

import { moduleDef, type ModuleKey, type ModuleNotes } from "@/lib/reports/modules";
import type { ReportKind } from "@/lib/reports/period";

export type OutlineInput = {
  kind: ReportKind;
  modules: ModuleKey[]; // encendidos, en orden
  notes: ModuleNotes;
  comentarios: string;
  photosCount: number;
  processes: { label: string }[]; // una diapositiva por proceso/fase de tiempos
  aga: { audience: "Pasajeros" | "Acompañantes"; hasVoice: boolean }[]; // planes AGA vigentes
  // Semestral/anual: si hay histórico por temporada y franjas horarias de tiempos, y
  // si hay resultados ACI ASQ de la temporada.
  season?: { history: boolean; hours: boolean; asq: boolean };
};

export type SlideSpec =
  | { type: "cover" }
  | { type: "section"; module: string; title: string }
  | { type: "asq" }
  | { type: "tiempos-empty" }
  | { type: "proceso"; index: number }
  | { type: "aga-guide" }
  | { type: "aga"; index: number } // índice en el arreglo `aga` de los datos
  | { type: "voice"; index: number }
  | { type: "text"; role: "note" | "analisis" | "recomendaciones" | "comentarios"; title: string; body: string }
  | { type: "exec-summary"; body: string }
  | { type: "tiempos-summary" }
  | { type: "tiempos-history" }
  | { type: "tiempos-hours" }
  | { type: "aga-evolution"; index: number }
  | { type: "asq-overall" }
  | { type: "asq-ranking" }
  | { type: "asq-categories" }
  | { type: "asq-matrix" }
  | { type: "asq-attributes" }
  | { type: "asq-profile" }
  | { type: "asq-empty" }
  | { type: "photos"; start: number; count: number; index: number; total: number }
  | { type: "closing" };

export const PHOTOS_PER_SLIDE = 4;

const ASQ_SLIDES = ["asq-overall", "asq-ranking", "asq-categories", "asq-matrix", "asq-attributes", "asq-profile"] as const;

export function buildOutline(input: OutlineInput): SlideSpec[] {
  const out: SlideSpec[] = [{ type: "cover" }];
  const seasonal = input.kind !== "MENSUAL";
  let section = 0;
  const addSection = (title: string) =>
    out.push({ type: "section", module: `Módulo ${String(++section).padStart(2, "0")}`, title });
  const addNote = (key: ModuleKey) => {
    const body = input.notes[key];
    if (body) out.push({ type: "text", role: "note", title: `Análisis · ${moduleDef(key)!.label}`, body });
  };

  const mods = input.modules;
  for (let i = 0; i < mods.length; i++) {
    const key = mods[i];
    switch (key) {
      case "asq-avance":
        addSection("Encuestas ASQ");
        out.push({ type: "asq" });
        addNote(key);
        break;

      case "tiempos":
        addSection("Mediciones de tiempos");
        if (input.processes.length === 0) out.push({ type: "tiempos-empty" });
        else {
          if (seasonal) out.push({ type: "tiempos-summary" });
          input.processes.forEach((_, index) => out.push({ type: "proceso", index }));
          if (seasonal && input.season?.history) out.push({ type: "tiempos-history" });
          if (seasonal && input.season?.hours) out.push({ type: "tiempos-hours" });
        }
        addNote(key);
        break;

      case "aga-pasajeros":
      case "aga-acompanantes": {
        // Los módulos AGA seguidos comparten divisor y guía de lectura.
        const group: ModuleKey[] = [key];
        while (i + 1 < mods.length && moduleDef(mods[i + 1])?.group === "aga") group.push(mods[++i]);
        const blocks = group.map((k) => ({
          key: k,
          surveys: input.aga
            .map((a, index) => ({ ...a, index }))
            .filter((a) => a.audience === moduleDef(k)!.survey!.audience),
        }));
        if (blocks.every((b) => b.surveys.length === 0)) break; // sin plan AGA: no aplica
        addSection("Encuestas AGA · Experiencia");
        out.push({ type: "aga-guide" });
        for (const b of blocks) {
          for (const s of b.surveys) {
            out.push({ type: "aga", index: s.index });
            if (seasonal) out.push({ type: "aga-evolution", index: s.index });
            if (s.hasVoice) out.push({ type: "voice", index: s.index });
          }
          if (b.surveys.length > 0) addNote(b.key);
        }
        break;
      }

      case "analisis": {
        // Semestral/anual: resumen ejecutivo (cifras del informe + texto del consultor).
        if (seasonal) {
          out.push({ type: "exec-summary", body: input.notes.analisis ?? "" });
          break;
        }
        const body = input.notes.analisis;
        if (body) out.push({ type: "text", role: "analisis", title: "Análisis y recomendaciones", body });
        break;
      }

      case "fotos-comentarios": {
        const body = input.comentarios.trim();
        if (body) out.push({ type: "text", role: "comentarios", title: "Comentarios y sugerencias", body });
        const total = Math.ceil(input.photosCount / PHOTOS_PER_SLIDE);
        for (let g = 0; g < total; g++) {
          const start = g * PHOTOS_PER_SLIDE;
          out.push({
            type: "photos",
            start,
            count: Math.min(PHOTOS_PER_SLIDE, input.photosCount - start),
            index: g,
            total,
          });
        }
        break;
      }

      case "recomendaciones": {
        const body = input.notes.recomendaciones;
        if (body) out.push({ type: "text", role: "recomendaciones", title: "Recomendaciones", body });
        break;
      }

      case "asq-resultados":
        if (!seasonal) break;
        addSection("Encuestas ACI ASQ · Resultados");
        if (input.season?.asq) {
          for (const type of ASQ_SLIDES) out.push({ type });
        } else out.push({ type: "asq-empty" });
        addNote(key);
        break;
    }
  }

  out.push({ type: "closing" });
  return out;
}

/** Título legible de cada diapositiva (vista previa del editor). */
export function slideLabel(s: SlideSpec, input: OutlineInput): string {
  switch (s.type) {
    case "cover":
      return "Portada";
    case "section":
      return `${s.module} · ${s.title}`;
    case "asq":
      return input.kind === "MENSUAL" ? "Encuestas ACI ASQ · avance de la temporada" : "Encuestas ACI ASQ · cumplimiento";
    case "tiempos-empty":
      return "Mediciones de tiempos · sin mediciones en la temporada";
    case "proceso":
      return input.processes[s.index]?.label ?? "Proceso";
    case "aga-guide":
      return "Cómo leer las Encuestas AGA";
    case "aga":
      return `Encuesta AGA · ${input.aga[s.index]?.audience ?? ""}`;
    case "voice":
      return `Voz del ${input.aga[s.index]?.audience === "Acompañantes" ? "acompañante" : "pasajero"}`;
    case "text":
      return s.title;
    case "photos":
      return s.total > 1 ? `Fotografías (${s.index + 1}/${s.total})` : "Fotografías";
    case "closing":
      return "Cierre";
    case "exec-summary":
      return "Resumen ejecutivo";
    case "tiempos-summary":
      return "Tiempos vs Estándar IATA";
    case "tiempos-history":
      return "Tiempos · evolutivo por temporada";
    case "tiempos-hours":
      return "Tiempos · por franja horaria";
    case "aga-evolution":
      return `Encuesta AGA · ${input.aga[s.index]?.audience ?? ""} · evolución`;
    case "asq-overall":
      return "ACI ASQ · satisfacción general y evolutivo";
    case "asq-ranking":
      return "ACI ASQ · ranking en Chile y en la base";
    case "asq-categories":
      return "ACI ASQ · categorías e índices";
    case "asq-matrix":
      return "ACI ASQ · matriz importancia–desempeño";
    case "asq-attributes":
      return "ACI ASQ · mejores y peores atributos";
    case "asq-profile":
      return "ACI ASQ · perfil del pasajero";
    case "asq-empty":
      return "ACI ASQ · base de la temporada sin cargar";
  }
}

/** Arma la entrada del outline desde los datos del informe mensual (o el deck serializado). */
export function outlineInputFrom(
  data: {
    kind?: ReportKind;
    processes: { proceso: string; faseLabel: string | null }[];
    aga: { audience: string; voice: { appraisal: string | null; quotes: unknown[] } }[];
    seasonal?: { tiemposHistory: { seasons: unknown[] }; tiemposHours: { rows: unknown[] }; asq: unknown };
  },
  edition: { modules: ModuleKey[]; notes: ModuleNotes; comentarios: string; photosCount: number }
): OutlineInput {
  return {
    ...edition,
    kind: data.kind ?? "MENSUAL",
    season: data.seasonal
      ? {
          history: data.seasonal.tiemposHistory.seasons.length > 1,
          hours: data.seasonal.tiemposHours.rows.length > 0,
          asq: !!data.seasonal.asq,
        }
      : undefined,
    processes: data.processes.map((p) => ({ label: `${p.proceso}${p.faseLabel ? ` — ${p.faseLabel}` : ""}` })),
    aga: data.aga.map((a) => ({
      audience: a.audience === "Acompañantes" ? "Acompañantes" : "Pasajeros",
      hasVoice: !!a.voice.appraisal || a.voice.quotes.length > 0,
    })),
  };
}
