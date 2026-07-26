if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js")
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
