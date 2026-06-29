// Service worker minimo para soporte offline del levantamiento en campo.
// La cola de respuestas vive en localStorage (ver SurveyRunner); aqui solo
// cacheamos el app-shell para que la pagina cargue sin conexion.
const CACHE = "igs-shell-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // No interceptar APIs ni POST: deben ir a la red (o fallar y encolar en cliente).
  if (req.method !== "GET" || req.url.includes("/api/")) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
