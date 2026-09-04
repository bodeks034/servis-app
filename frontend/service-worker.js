// Service Worker — kešira app shell da se aplikacija otvori i bez mreže.
// API pozivi se ne keširaju.

const CACHE_NAME = "servis-app-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./config.js",
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

  if (jeApiPoziv) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(JSON.stringify({ greska: "Nema internet konekcije. Pokušajte ponovo kad se povežete." }), {
            headers: { "Content-Type": "application/json" },
            status: 503,
          })
      )
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
