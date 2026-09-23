"use client";
import { useEffect } from "react";
import { isAutoReloadPaused } from "@/lib/freshnessGuardPause";
import { recordAutoReload } from "@/lib/reloadBreadcrumb";

// Red de seguridad para ChunkLoadError. Tras un deploy nuevo, un cliente que
// aun tiene HTML/JS viejo (pestaña abierta, SW en transicion, skew de CDN) puede
// pedir un chunk con hash que ya no existe -> 404 -> ChunkLoadError. Recargamos
// UNA vez para tomar el build nuevo. El guard por tiempo evita bucles de recarga
// si el chunk siguiera faltando por otra razon.
const RELOAD_KEY = "chunk-reload-ts";

const isChunkError = (msg?: string | null) =>
  !!msg &&
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    msg
  );

export default function ChunkErrorReload() {
  useEffect(() => {
    const maybeReload = (msg?: string | null) => {
      if (!isChunkError(msg)) return;
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < 10_000) return; // no recargar mas de 1 vez / 10 s
      // Hay una operación sensible en curso (p. ej. subiendo un archivo): no
      // recargar ahora. El siguiente error (si el chunk sigue faltando) sí recargará,
      // por el guard de tiempo de arriba.
      if (isAutoReloadPaused()) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      recordAutoReload(`error cargando un recurso de la página: ${msg}`);
      window.location.reload();
    };

    const onError = (e: ErrorEvent) =>
      maybeReload(e?.message || e?.error?.message);
    const onRejection = (e: PromiseRejectionEvent) =>
      maybeReload(e?.reason?.message || String(e?.reason));

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
