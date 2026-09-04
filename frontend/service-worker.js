// Service Worker — kešira app shell da se aplikacija otvori i bez mreže.
// API pozivi i config.js se ne keširaju agresivno (network-first).

const CACHE_NAME = "servis-app-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.svg",
  "./icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const jeApiPoziv =
    url.pathname.startsWith("/api/") || url.port === "4000" || event.request.method !== "GET";
  const jeConfig = url.pathname.endsWith("/config.js") || url.pathname.endsWith("config.js");

  if (jeApiPoziv || jeConfig) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          jeConfig
            ? caches.match(event.request)
            : new Response(JSON.stringify({ greska: "Nema internet konekcije. Pokušajte ponovo kad se povežete." }), {
                headers: { "Content-Type": "application/json" },
                status: 503,
              })
      )
    );
    return;
  }

  // Network-first za HTML/JS da telefon ne ostane na staroj verziji
  if (url.pathname.endsWith(".html") || url.pathname.endsWith(".js") || url.pathname === "/" || url.pathname.endsWith("/")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
