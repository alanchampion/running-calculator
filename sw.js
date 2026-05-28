var CACHE_NAME = "running-calculator-v1";
var APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./calculator.js",
  "./script.js",
  "./manifest.webmanifest",
  "./favicon.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(APP_SHELL_ASSETS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function (cacheName) {
              return cacheName !== CACHE_NAME;
            })
            .map(function (cacheName) {
              return caches.delete(cacheName);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isCacheableRequest(request) {
  var requestUrl = new URL(request.url);

  return request.method === "GET" && requestUrl.origin === self.location.origin;
}

self.addEventListener("fetch", function (event) {
  var request = event.request;

  if (!isCacheableRequest(request)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var responseCopy = response.clone();

          caches.open(CACHE_NAME).then(function (cache) {
            cache.put("./index.html", responseCopy);
          });

          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then(function (response) {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }

        var responseCopy = response.clone();

        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, responseCopy);
        });

        return response;
      });
    })
  );
});
