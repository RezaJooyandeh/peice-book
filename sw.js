const CACHE = "piecebook-v2";
const SCOPE = self.registration.scope;
const scopeUrl = (path) => new URL(path, SCOPE).href;
const APP_SHELL = ["./", "index.html", "assets/app.js", "assets/app.css", "manifest.webmanifest", "icon.svg"].map(scopeUrl);
const NAVIGATION_FALLBACK = scopeUrl("index.html");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && APP_SHELL.includes(url.href)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const refresh = fetch(event.request).then(async (response) => {
          if (response.ok) {
            try {
              const cache = await caches.open(CACHE);
              await cache.put(event.request, response.clone());
            } catch {
              // Keep serving the live response even if app-shell caching is unavailable.
            }
          }
          return response;
        }).catch((error) => {
          if (cached) return cached;
          throw error;
        });
        if (!cached) return refresh;
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }),
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          try {
            const cache = await caches.open(CACHE);
            await cache.put(event.request, copy);
          } catch {
            // Keep serving the live response even if runtime caching is unavailable.
          }
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return (await caches.match(NAVIGATION_FALLBACK)) || new Response("App unavailable offline", { status: 503 });
        }
        return new Response("Resource unavailable offline", { status: 503 });
      }),
  );
});
