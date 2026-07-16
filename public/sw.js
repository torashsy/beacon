/* via-mi service worker: installability and update checks only.
   App pages are intentionally not cached, so every launch gets the latest version. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* invalid payload */ }
  const handle = /^[a-z0-9_]{3,20}$/.test(data.handle ?? "") ? data.handle : "";
  const url = handle ? `/@${handle}` : "/?tab=follows";
  const promises = [self.registration.showNotification("via-mi", {
    body: typeof data.body === "string" ? data.body : "フォロー中の相手が更新しました",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: handle ? `follow-update-${handle}` : "follow-update",
    renotify: true,
    data: { url },
  })];
  if ("setAppBadge" in self.navigator) promises.push(self.navigator.setAppBadge(1));
  event.waitUntil(Promise.all(promises));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/?tab=follows", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(target);
      return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
