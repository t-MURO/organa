self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    self.registration
      .unregister()
      .then(function () {
        return self.clients.matchAll({ type: "window" });
      })
      .then(function (clients) {
        return Promise.all(
          clients.map(function (client) {
            return client.navigate(client.url);
          }),
        );
      }),
  );
});
