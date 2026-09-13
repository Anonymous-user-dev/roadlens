const CACHE = "roadlens-shell-v5";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request, { cache: event.request.mode === "navigate" ? "no-store" : "default" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return (await caches.match("/")) || new Response("RoadLens is offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        return new Response("Offline resource unavailable.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }),
  );
});
