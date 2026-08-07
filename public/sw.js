// Service worker para soporte offline del levantamiento en campo.
// La cola de respuestas vive en localStorage (ver SurveyRunner); aqui solo
// cacheamos el app-shell para que la pagina cargue sin conexion.
//
// Estrategia (importante para evitar ChunkLoadError tras un deploy):
//  - HTML / navegacion  -> NETWORK-FIRST. El documento es el punto de entrada
//    que referencia los chunks con hash. Si servimos HTML viejo desde cache,
//    apunta a chunks que un deploy nuevo ya borro -> 404 -> ChunkLoadError.
//    Solo caemos a cache cuando NO hay red (offline real).
//  - Estaticos con hash (/_next/static/, iconos, etc.) -> CACHE-FIRST. Son
//    inmutables (el hash cambia con cada build), asi que servirlos desde cache
//    es seguro y rapido.
const CACHE = "igs-shell-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // No interceptar APIs, otros origenes ni metodos distintos de GET.
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isDocument =
    req.mode === "navigate" ||
    req.destination === "document" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isDocument) {
    // Network-first: siempre el HTML mas reciente; cache solo como fallback offline.
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || Response.error()))
    );
    return;
  }

  // Cache-first para estaticos con hash (inmutables).
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});
