// Service worker: deixa o app abrir mesmo sem internet.
// Estratégia: arquivos do app vêm da rede (sempre a versão mais nova) e,
// sem internet, do cache. O SDK do Firebase (versão fixa) vem do cache.
const CACHE = 'financas-v1';
const ARQUIVOS = [
  './', 'index.html', 'styles.css', 'app.js', 'firebase-config.js', 'manifest.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mesmoSite = url.origin === location.origin;
  const sdkFirebase = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!mesmoSite && !sdkFirebase) return; // Firestore/Auth cuidam da própria rede

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const emCache = await cache.match(req, { ignoreSearch: mesmoSite });
      if (sdkFirebase && emCache) return emCache;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (emCache) return emCache;
        throw err;
      }
    })
  );
});
