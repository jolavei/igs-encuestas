"use client";

// Permite pausar temporalmente la recarga completa de FreshnessGuard (ver ese
// componente) mientras hay una operación sensible en curso — p. ej. seleccionar
// y subir un archivo, donde el diálogo nativo del sistema operativo le quita y
// devuelve el foco a la pestaña, que es justo lo que dispara el chequeo de
// versión nueva. Sin esto, un deploy que aterriza en ese instante recargaría la
// página y se perdería la selección/el formulario en curso.
let pauseCount = 0;

/** Marca el inicio de una operación sensible. Llamar a la función devuelta al terminar (o cancelar). */
export function pauseAutoReload(): () => void {
  pauseCount++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pauseCount = Math.max(0, pauseCount - 1);
  };
}

export function isAutoReloadPaused(): boolean {
  return pauseCount > 0;
}
