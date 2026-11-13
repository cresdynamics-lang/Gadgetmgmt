/* Only public offline assets are cached. Authenticated pages and APIs are never cached. */
const STATIC_CACHE = "gadgethub-notifications-static-v2";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(["/notifications-offline.html", "/notifications-icon-192.png", "/notifications-icon-512.png"])));
  if (!self.registration.active) self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("gadgethub-notifications-static-") && key !== STATIC_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === "GET" && ["/notifications-offline.html", "/notifications-icon-192.png", "/notifications-icon-512.png"].includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match("/notifications-offline.html")) || new Response("You are offline. Reconnect to open GadgetHub.", { headers: { "Content-Type": "text/plain" } })));
});
self.addEventListener("push", (event) => {
  let data = {};
  try { const parsed = event.data?.json(); data = parsed && typeof parsed === "object" ? parsed : {}; } catch { /* Use generic content. */ }
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || "GadgetHub alert", {
      body: data.body || "Open Messages & alerts for an update.", tag: data.tag || "gadgethub-alert",
      icon: "/notifications-icon-192.png", badge: "/notifications-icon-192.png", data: { url: "/notifications" },
    });
    for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) client.postMessage({ type: "NOTIFICATIONS_CHANGED" });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/notifications", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === url && "focus" in client) return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener("message", event => { if (event.data?.type === "APPLY_UPDATE") self.skipWaiting(); });
