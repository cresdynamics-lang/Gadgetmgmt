export function notifyInboxChanged() {
  window.dispatchEvent(new Event("notifications-changed"));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("gadgethub-notifications");
    channel.postMessage("changed");
    channel.close();
  }
}

export function registerNotificationWorker() {
  return navigator.serviceWorker.register("/notifications-sw.js", { scope: "/", updateViaCache: "none" });
}
