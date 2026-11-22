/* ==========================================================================
   WM_CHECKLIST — SERVICE WORKER (PWA ОФЛАЙН-РЕЖИМ)
   ========================================================================== */
const CACHE_NAME = 'wm-checklist-v24-0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/styles.css',
  './privacy.html',
  './terms.html',
  './locales/ru.json',
  './locales/en.json',
  './locales/az.json',
  './js/i18n.js',
  './js/config.js',
  './js/storage.js',
  './js/sync.js',
  './js/photos.js',
  './js/render.js',
  './js/app.js',
  './assets/fonts/Finlandica-VariableFont_wght.ttf',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Никогда не кэшируем запросы к GitHub API и сторонним доменам
  if (url.origin !== self.location.origin) return;

  // Network-First с откатом в кэш: онлайн всегда свежая версия, офлайн — из кэша
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
