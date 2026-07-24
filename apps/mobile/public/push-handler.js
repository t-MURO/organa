self.addEventListener("push", (event) => {
  const payload = readPayload(event.data);
  event.waitUntil(
    self.registration.showNotification("A gentle reminder", {
      badge: "/icons/organa-192.png",
      body: "Something in Organa is ready when you are.",
      data: { route: safeRoute(payload.route) },
      icon: "/icons/organa-192.png",
      silent: true,
      tag:
        typeof payload.tag === "string" && payload.tag.length <= 200
          ? `organa:${payload.tag}`
          : "organa:reminder",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = safeRoute(event.notification.data?.route);
  event.waitUntil(openOrgana(route));
});

function readPayload(data) {
  if (!data) return {};
  try {
    const value = data.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function safeRoute(value) {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    value.length <= 512
  ) {
    return value;
  }
  return "/";
}

async function openOrgana(route) {
  const url = new URL(route, self.location.origin).href;
  const windows = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  });
  const existing = windows[0];
  if (existing) {
    await existing.navigate(url);
    return existing.focus();
  }
  return self.clients.openWindow(url);
}
