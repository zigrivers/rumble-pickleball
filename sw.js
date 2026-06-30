// App-specific cache prefix. github.io is a shared origin across all of the
// owner's project Pages, so cleanup must only touch THIS app's caches — never
// delete by "everything that isn't the current version".
const CACHE_PREFIX = "rumble-pickleball-";
// Bump VERSION on every deploy so clients pick up changes.
const VERSION = CACHE_PREFIX + "v46";
const SHELL = [
  "./",
  "index.html",
  "guide.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Do NOT skipWaiting here — the page decides when to activate (update chip).
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isMetadata = url.pathname.endsWith("/version-metadata.json") || url.pathname.endsWith("/version.json");
  if (isMetadata) {
    return; // Bypass service worker completely, letting browser fetch directly from network
  }

  // ignoreSearch so cached shell serves any query string (?test, ?simulate)
  // and update-induced reloads that preserve the query.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((cached) => cached || fetch(event.request))
  );
});

// The page posts this when the user taps "update".
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
