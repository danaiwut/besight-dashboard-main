/* BeSight service worker — app shell stays installable + usable offline.
   - API/auth: network-only (never serve stale data).
   - Navigations: network-first, then cache, then the offline page.
   - Static assets (/_next/static, /img, /icons, manifest): stale-while-revalidate.
   - Google Fonts (Open Sans + Material Symbols): stale-while-revalidate, so
     icons still render offline instead of falling back to their ligature text. */

const STATIC_CACHE = "besight-static-v2";
const PAGES_CACHE = "besight-pages-v2";
const FONT_CACHE = "besight-fonts-v1";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const OFFLINE_URL = "/offline/";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => ![STATIC_CACHE, PAGES_CACHE, FONT_CACHE].includes(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never cache API or auth traffic.
  if (url.pathname.startsWith("/api/")) return;

  // Pages: network-first with offline fallback.
  if (request.mode === "navigate") {
    // Every sign-out and expired session lands here — drop the signed-in
    // pages so the next person on a shared device can't open them offline.
    if (url.pathname.startsWith("/login") || url.pathname.startsWith("/gate")) {
      event.waitUntil(caches.delete(PAGES_CACHE));
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only keep real pages — not error pages or login redirects.
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/img/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

function staleWhileRevalidate(request, cacheName) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((response) => {
        // type "opaque" = cross-origin no-cors (the icon-font stylesheet link).
        if (response.ok || response.type === "opaque") {
          const copy = response.clone();
          caches.open(cacheName).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached);
    return cached || network;
  });
}
