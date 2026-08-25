// ---------------------------------------------------------------------------
// SERVICE WORKER — this is what makes the app work with no signal.
//
// It saves a copy of every file below onto your phone the first time you visit,
// then serves the app from that copy.
//
//   ⚠️  AFTER YOU EDIT ANY FILE, BUMP THE VERSION NUMBER BELOW.
//   That's how the phone knows to pick up your changes instead of the old copy.
// ---------------------------------------------------------------------------

const VERSION = 'v2';
const CACHE = `gym-tracker-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/ui.js',
  './js/defaults.js',
  './js/progression.js',
  './js/screens/home.js',
  './js/screens/workout.js',
  './js/screens/progress.js',
  './js/screens/calendar.js',
  './js/screens/day.js',
  './js/screens/settings.js',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/fonts/barlow-condensed-500.woff2',
  './assets/fonts/barlow-condensed-600.woff2',
  './assets/fonts/barlow-condensed-700.woff2',
  './assets/fonts/inter-400.woff2',
  './assets/fonts/inter-500.woff2',
  './assets/fonts/inter-600.woff2',
  './assets/fonts/inter-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Page loads: try the network so a fresh deploy is picked up, fall back to
  // the cached page when there's no signal (i.e. in the gym).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Everything else: cache first — instant, and works offline.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
