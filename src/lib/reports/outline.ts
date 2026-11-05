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
import { procLabel } from "@/lib/reports/seasonSlides";

/** Nombre del módulo en las diapositivas: las encuestas AGA se presentan como "Complementarias". */
const deckModuleLabel = (key: ModuleKey) => moduleDef(key)!.label.replace(/^AGA\b/, "Complementarias");

export type OutlineInput = {
  kind: ReportKind;
  modules: ModuleKey[]; // encendidos, en orden
  notes: ModuleNotes;
  comentarios: string;
  photosCount: number;
  processes: { label: string }[]; // una diapositiva por proceso/fase de tiempos
  // Planes AGA vigentes. `hasData` = false: sin encuestas en el periodo (semestral/anual).
  aga: { audience: "Pasajeros" | "Acompañantes"; hasVoice: boolean; hasData?: boolean }[];
  // Desde oct-2026: algún proceso trae tiempo de atención (diapositiva "fila vs atención").
  service?: boolean;
  // Semestral/anual: histórico por temporada de tiempos, mapas de hotspots (uno por proceso
  // y modalidad) y resultados ACI ASQ (categorías con subatributos; histórico si hay más de
  // una temporada; comparación pasajeros vs acompañantes si ambos públicos tienen encuestas).
  season?: { history: boolean; hotspots: number; asq: boolean; asqGroups?: number; asqHistory?: boolean; agaCompare?: boolean };
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
  | { type: "tiempos-split" }
  | { type: "tiempos-history" }
  | { type: "tiempos-hotspot"; index: number }
  | { type: "aga-evolution"; index: number }
  | { type: "aga-map"; index: number }
  | { type: "aga-compare" }
  | { type: "asq-guide" }
  | { type: "asq-overall" }
  | { type: "asq-profile" }
  | { type: "asq-categories" }
  | { type: "asq-group"; index: number }
  | { type: "asq-general" }
  | { type: "asq-airlines" }
  | { type: "asq-indices" }
  | { type: "asq-benchmark" }
  | { type: "asq-ranking" }
  | { type: "asq-matrix" }
  | { type: "asq-history" }
  | { type: "asq-history-bench" }
  | { type: "asq-empty" }
  | { type: "photos"; start: number; count: number; index: number; total: number }
  | { type: "closing" };

export const PHOTOS_PER_SLIDE = 4;

export function buildOutline(input: OutlineInput): SlideSpec[] {
  const out: SlideSpec[] = [{ type: "cover" }];
  const seasonal = input.kind !== "MENSUAL";
  let section = 0;
  const addSection = (title: string) =>
    out.push({ type: "section", module: `Módulo ${String(++section).padStart(2, "0")}`, title });
  const addNote = (key: ModuleKey) => {
    const body = input.notes[key];
    if (body) out.push({ type: "text", role: "note", title: `Análisis · ${deckModuleLabel(key)}`, body });
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
          if (input.service) out.push({ type: "tiempos-split" });
          // Semestral/anual: mapa de hotspots con su tabla resumen por proceso; mensual: evolutivo.
          if (seasonal) for (let index = 0; index < (input.season?.hotspots ?? 0); index++) out.push({ type: "tiempos-hotspot", index });
          else input.processes.forEach((_, index) => out.push({ type: "proceso", index }));
          if (seasonal && input.season?.history) out.push({ type: "tiempos-history" });
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
        addSection("Encuestas Complementarias · Experiencia");
        out.push({ type: "aga-guide" });
        for (const b of blocks) {
          for (const s of b.surveys) {
            out.push({ type: "aga", index: s.index });
            if (seasonal && s.hasData !== false) out.push({ type: "aga-map", index: s.index });
            if (seasonal) out.push({ type: "aga-evolution", index: s.index });
            if (s.hasVoice) out.push({ type: "voice", index: s.index });
          }
          if (b.surveys.length > 0) addNote(b.key);
        }
        if (seasonal && input.season?.agaCompare && blocks.every((b) => b.surveys.length > 0) && blocks.length > 1)
          out.push({ type: "aga-compare" });
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
          out.push({ type: "asq-guide" }, { type: "asq-overall" }, { type: "asq-profile" }, { type: "asq-categories" });
          for (let index = 0; index < (input.season.asqGroups ?? 0); index++) out.push({ type: "asq-group", index });
          out.push(
            { type: "asq-general" },
            { type: "asq-airlines" },
            { type: "asq-indices" },
            { type: "asq-benchmark" },
            { type: "asq-ranking" },
            { type: "asq-matrix" }
          );
          if (input.season.asqHistory) out.push({ type: "asq-history" }, { type: "asq-history-bench" });
        } else out.push({ type: "asq-empty" });
        addNote(key);
        break;
    }
  }

  // El mensual termina en su último contenido (sin diapositiva de cierre).
  if (seasonal) out.push({ type: "closing" });
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
      return "Cómo leer las Encuestas Complementarias";
    case "aga":
      return `Encuesta Complementaria · ${input.aga[s.index]?.audience ?? ""}`;
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
    case "tiempos-split":
      return "Tiempos · fila vs atención";
    case "tiempos-history":
      return "Tiempos · evolutivo por temporada";
    case "tiempos-hotspot":
      return `Tiempos · mapa de hotspots ${s.index + 1}`;
    case "aga-evolution":
      return `Encuesta Complementaria · ${input.aga[s.index]?.audience ?? ""} · resultados históricos`;
    case "aga-map":
      return `Encuesta Complementaria · ${input.aga[s.index]?.audience ?? ""} · nota vs alcance`;
    case "aga-compare":
      return "Encuesta Complementaria · pasajeros vs acompañantes";
    case "asq-guide":
      return "ACI ASQ · qué evalúa el programa";
    case "asq-overall":
      return "ACI ASQ · puntos clave";
    case "asq-profile":
      return "ACI ASQ · contexto y perfil del pasajero";
    case "asq-categories":
      return "ACI ASQ · promedios y comparación con la industria";
    case "asq-group":
      return `ACI ASQ · apertura por subatributos ${s.index + 1}`;
    case "asq-general":
      return "ACI ASQ · apertura general";
    case "asq-airlines":
      return "ACI ASQ · apertura por aerolínea";
    case "asq-indices":
      return "ACI ASQ · índices de calidad y estado emocional";
    case "asq-benchmark":
      return "ACI ASQ · comparación con la industria";
    case "asq-ranking":
      return "ACI ASQ · ranking en Chile y en el programa regional";
    case "asq-matrix":
      return "ACI ASQ · importancia vs puntaje";
    case "asq-history":
      return "ACI ASQ · resultados históricos";
    case "asq-history-bench":
      return "ACI ASQ · resultados históricos vs la industria";
    case "asq-empty":
      return "ACI ASQ · base de la temporada sin cargar";
  }
}

/** Arma la entrada del outline desde los datos del informe mensual (o el deck serializado). */
export function outlineInputFrom(
  data: {
    kind?: ReportKind;
    processes: { proceso: string; faseLabel: string | null; service?: { kpi: unknown } | null }[];
    aga: { audience: string; month?: { n: number }; voice: { appraisal: string | null; quotes: unknown[] } }[];
    seasonal?: {
      tiemposHistory: { seasons: unknown[] };
      tiemposHot: unknown[];
      asq: { groups: unknown[]; history: unknown[] } | null;
    };
  },
  edition: { modules: ModuleKey[]; notes: ModuleNotes; comentarios: string; photosCount: number }
): OutlineInput {
  return {
    ...edition,
    kind: data.kind ?? "MENSUAL",
    service: data.processes.some((p) => !!p.service?.kpi),
    season: data.seasonal
      ? {
          history: data.seasonal.tiemposHistory.seasons.length > 1,
          hotspots: data.seasonal.tiemposHot.length,
          asq: !!data.seasonal.asq,
          asqGroups: data.seasonal.asq?.groups.length ?? 0,
          asqHistory: (data.seasonal.asq?.history.length ?? 0) > 1,
          agaCompare: data.aga.length > 1 && data.aga.every((a) => (a.month?.n ?? 0) > 0),
        }
      : undefined,
    processes: data.processes.map((p) => ({ label: procLabel(p) })),
    aga: data.aga.map((a) => ({
      audience: a.audience === "Acompañantes" ? "Acompañantes" : "Pasajeros",
      hasVoice: !!a.voice.appraisal || a.voice.quotes.length > 0,
      ...(a.month ? { hasData: a.month.n > 0 } : {}),
    })),
  };
}
