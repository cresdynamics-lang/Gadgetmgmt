/* This worker never caches authenticated pages or API responses. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Use generic content. */ }
  event.waitUntil(self.registration.showNotification(data.title || "GadgetHub alert", {
    body: data.body || "Open Messages & alerts for an update.", tag: data.tag || "gadgethub-alert",
    icon: "/notifications-icon.svg", data: { url: "/notifications" },
  }));
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
