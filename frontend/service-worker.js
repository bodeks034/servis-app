// Service Worker — kešira samo statičke fajlove sa istog domena.
// Cross-origin API (Vercel backend) SE NE PREKIDA — inače telefon vidi lažnu poruku "nema interneta".

const CACHE_NAME = "servis-app-v8";
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

  // Ne diraj backend na drugom domenu (login, nalozi…)
  if (url.origin !== self.location.origin) return;

  // Service worker skriptu uvek sa mreže
  if (url.pathname.endsWith("service-worker.js")) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.method !== "GET") return;

  // Network-first za HTML/JS/config da telefon dobije novu verziju
  const jeAppFajl =
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname === "/" ||
    url.pathname.endsWith("/");

  if (jeAppFajl) {
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
