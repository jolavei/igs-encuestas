"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene la vista fresca sin refresh manual del usuario:
 *  - Al volver a la pestaña (foco/visibilidad) o al volver con el botón Atrás
 *    (página restaurada desde bfcache), vuelve a pedir los datos del servidor
 *    con router.refresh() -> la lista/dashboard se actualiza sola.
 *  - Si detecta que se publicó una versión nueva del sitio, recarga la página
 *    completa (location.reload) para cargar el código nuevo; router.refresh()
 *    no basta porque el JavaScript ya cargado sigue siendo el viejo.
 *
 * `version` = identificador del deploy en el momento en que cargó esta pestaña.
 */
export default function FreshnessGuard({ version }: { version: string }) {
  const router = useRouter();
  // Se fija en el primer render y no cambia aunque el prop cambie luego.
  const loadedVersion = useRef(version).current;
  const lastRun = useRef(0);

  useEffect(() => {
    // En local (dev) no hay deploys ni caché agresiva: el HMR ya refresca.
    if (loadedVersion === "dev") return;

    let cancelled = false;

    // Devuelve true si detectó versión nueva y disparó la recarga completa.
    async function checkVersion(): Promise<boolean> {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return false;
        const data = (await r.json()) as { version?: string };
        if (!cancelled && data.version && data.version !== loadedVersion) {
          window.location.reload();
          return true;
        }
      } catch {
        /* sin red o error transitorio: ignorar */
      }
      return false;
    }

    async function onActive() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRun.current < 1500) return; // anti-rebote (foco+visibilidad juntos)
      lastRun.current = now;
      const reloading = await checkVersion();
      if (!reloading && !cancelled) router.refresh();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void onActive();
    }
    function onFocus() {
      void onActive();
    }
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) void onActive(); // restaurada desde bfcache (botón Atrás)
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);

    // Mientras la pestaña sigue abierta y visible, chequea deploys nuevos.
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") void checkVersion();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router, loadedVersion]);

  return null;
}
