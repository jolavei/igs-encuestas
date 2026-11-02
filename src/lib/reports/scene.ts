// Escena de una diapositiva: primitivas en un lienzo de 1280 × 720 px que dibujan igual el
// deck HTML (components/reports/ReportDeck) y el PPTX (lib/reports/pptx). Las diapositivas
// nuevas del semestral/anual se escriben una sola vez aquí, sin duplicar la geometría.

export type Run = { text: string; color?: string; bold?: boolean; mono?: boolean; size?: number };

// Íconos del recorrido del pasajero: public/report/icons/<ícono>.png (HTML) e iconAssets.ts (PPTX).
export type ReportIcon = "accesos" | "checkin" | "avsec" | "migracion" | "tiendas" | "puertas" | "equipaje" | "transito" | "terminal";

const ICON_BY_LABEL: [RegExp, ReportIcon][] = [
  [/equipaje|maleta/i, "equipaje"],
  [/check.?in|mes[oó]n/i, "checkin"],
  [/filtro|seguridad|avsec/i, "avsec"],
  [/migrat|pasaporte|aduana|sag\b/i, "migracion"],
  [/restaurant|tienda|locales|financier/i, "tiendas"],
  [/puertas|embarque|sal[oó]n vip|pantallas/i, "puertas"],
  [/accesos|accesibilidad|estacionamiento|transporte/i, "accesos"],
  [/a trav[eé]s|señal[eé]tica|sonido/i, "transito"],
  [/atm[oó]sfera|instalaciones|terminal/i, "terminal"],
];

/** Ícono de una categoría o proceso, por su nombre. */
export function iconFor(label: string): ReportIcon | null {
  return ICON_BY_LABEL.find(([re]) => re.test(label))?.[1] ?? null;
}

export type Prim =
  | {
      k: "box";
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      strokeW?: number;
      radius?: number;
      text?: string | Run[];
      size?: number;
      color?: string;
      bold?: boolean;
      italic?: boolean;
      mono?: boolean;
      align?: "left" | "center" | "right";
      valign?: "top" | "middle" | "bottom";
      nowrap?: boolean;
      tip?: string; // ayuda al pasar el mouse (solo HTML)
    }
  | { k: "img"; x: number; y: number; w: number; h: number; icon: ReportIcon }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width?: number; dash?: boolean }
  | { k: "dot"; cx: number; cy: number; r: number; fill: string; stroke?: string; tip?: string };

export type Scene = { title: string; subtitle?: string; prims: Prim[] };

/** Factor del lienzo: 1280 px = 20" del PPTX. */
export const PX_PER_IN = 64;
/** Tamaño de letra: px del lienzo → pt del PPTX (mismo tamaño relativo a la diapositiva). */
export const PT_PER_PX = 72 / PX_PER_IN;

/** Lienzo útil bajo el título (el pie izquierdo lo ocupa el logo). */
export const AREA = { x: 72, y: 132, w: 1136, r: 1208, b: 668 } as const;
