"use client";

// Deja un rastro de por qué se disparó una recarga automática (FreshnessGuard o
// ChunkErrorReload) para poder mostrarlo tras la recarga — sessionStorage
// sobrevive un location.reload() de la misma pestaña. Sin esto, la recarga
// automática es invisible: el usuario solo ve que "la página se refrescó sola".
const KEY = "auto-reload-reason";

export function recordAutoReload(reason: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ reason, at: Date.now() }));
  } catch {
    // sessionStorage no disponible (privado/bloqueado): sin rastro, no bloquear la recarga
  }
}

/** Devuelve el motivo si hubo una recarga automática reciente, y lo consume (una sola vez). */
export function consumeAutoReloadReason(maxAgeMs = 15000): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const { reason, at } = JSON.parse(raw) as { reason: string; at: number };
    if (typeof at !== "number" || Date.now() - at > maxAgeMs) return null;
    return reason;
  } catch {
    return null;
  }
}
