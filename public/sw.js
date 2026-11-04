const CACHE = "gadgethub-shell-v2";
const SHELL = ["/brand/icon-black.png", "/brand/apple-icon.png"];
// Signed-in pages are never stored. A stored redirect also cannot answer a page request, which left the app unable to open.
const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GadgetHub is offline</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font:16px system-ui,sans-serif;text-align:center"><main style="padding:24px"><img src="/brand/apple-icon.png" alt="" width="72" height="72" style="border-radius:16px"><h1 style="font-size:20px;margin:16px 0 8px">No internet connection</h1><p style="margin:0 0 20px;color:#bbb">GadgetHub needs the internet to open. Check your connection and try again.</p><button onclick="location.reload()" style="min-height:44px;padding:0 20px;border:0;border-radius:12px;background:#fff;color:#111;font:600 14px system-ui,sans-serif">Try again</button></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
    return;
  }
  if (!url.pathname.startsWith("/_next/static/") && !url.pathname.startsWith("/brand/")) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
