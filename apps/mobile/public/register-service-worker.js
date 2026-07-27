if ("serviceWorker" in navigator) {
  var localDevelopmentHosts = ["localhost", "127.0.0.1", "::1"];
  var localDevelopment = localDevelopmentHosts.includes(
    window.location.hostname,
  );

  if (localDevelopment) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach(function (registration) {
        registration.unregister();
      });
    });
  } else {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then(function (registration) {
          function announceWaitingWorker() {
            if (registration.waiting && navigator.serviceWorker.controller) {
              window.dispatchEvent(new Event("organa:update-ready"));
            }
          }

          announceWaitingWorker();
          registration.addEventListener("updatefound", function () {
            var worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", function () {
              if (worker.state === "installed") announceWaitingWorker();
            });
          });
        })
        .catch(function () {
          // The app remains usable online if registration is unavailable.
        });
    });
  }
}
