const CACHE_NAME = 'order-app-v1';
const ASSETS = [
  './',
  './Index.html',
  './manual.html',
  './styles-redesign.css',
  './script.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
