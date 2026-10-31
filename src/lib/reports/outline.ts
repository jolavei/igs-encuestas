// Secuencia de diapositivas de un informe, a partir de los módulos encendidos (en el
// orden de la plantilla) y de lo que hay en los datos. La comparten el deck HTML, el
// PPTX y la vista previa del editor, así los tres muestran siempre lo mismo.
//
// Puro (sin BD). Hoy cubre el informe mensual; los módulos de semestral/anual
// agregan aquí sus diapositivas cuando se construyan.

import { moduleDef, type ModuleKey, type ModuleNotes } from "@/lib/reports/modules";

export type OutlineInput = {
  modules: ModuleKey[]; // encendidos, en orden
  notes: ModuleNotes;
  comentarios: string;
  photosCount: number;
  processes: { label: string }[]; // una diapositiva por proceso/fase de tiempos
  aga: { audience: "Pasajeros" | "Acompañantes"; hasVoice: boolean }[]; // planes AGA vigentes
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
  | { type: "text"; role: "note" | "analisis" | "comentarios"; title: string; body: string }
  | { type: "photos"; start: number; count: number; index: number; total: number }
  | { type: "closing" };

export const PHOTOS_PER_SLIDE = 4;

export function buildOutline(input: OutlineInput): SlideSpec[] {
  const out: SlideSpec[] = [{ type: "cover" }];
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
        else input.processes.forEach((_, index) => out.push({ type: "proceso", index }));
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
            if (s.hasVoice) out.push({ type: "voice", index: s.index });
          }
          if (b.surveys.length > 0) addNote(b.key);
        }
        break;
      }

      case "analisis": {
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

      case "asq-resultados":
        // Semestral/anual: se construye en la fase 3.
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
      return "Encuestas ACI ASQ · avance de la temporada";
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
  }
}

/** Arma la entrada del outline desde los datos del informe mensual (o el deck serializado). */
export function outlineInputFrom(
  data: {
    processes: { proceso: string; faseLabel: string | null }[];
    aga: { audience: string; voice: { appraisal: string | null; quotes: unknown[] } }[];
  },
  edition: { modules: ModuleKey[]; notes: ModuleNotes; comentarios: string; photosCount: number }
): OutlineInput {
  return {
    ...edition,
    processes: data.processes.map((p) => ({ label: `${p.proceso}${p.faseLabel ? ` — ${p.faseLabel}` : ""}` })),
    aga: data.aga.map((a) => ({
      audience: a.audience === "Acompañantes" ? "Acompañantes" : "Pasajeros",
      hasVoice: !!a.voice.appraisal || a.voice.quotes.length > 0,
    })),
  };
}
