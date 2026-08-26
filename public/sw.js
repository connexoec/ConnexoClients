// Connexo PWA Service Worker — mínimo para habilitar el install prompt
const CACHE = 'connexo-v3';
const PRECACHE = ['/connexo-iso-o.png', '/connexo-iso-word-o.png', '/connexo-badge.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Borra los cachés de versiones anteriores; sin esto `caches.match` seguiría
  // encontrando el ícono viejo en `connexo-v1` y el cambio nunca se vería.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Solo cachea recursos estáticos; todo lo demás pasa directo a la red
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});

// ── Web Push: muestra la notificación en el teléfono ──────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Connexo', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Connexo';
  const options = {
    body: data.body || '',
    // icon = imagen grande de la notificación: puede ir a todo color.
    icon: '/connexo-iso-o.png',
    // badge = ícono chico de la barra de estado. Android lo dibuja usando SOLO
    // el canal alfa y lo pinta de blanco: si se le pasa una imagen opaca (como
    // el logo con fondo negro) sale un cuadrado blanco. Por eso va la silueta
    // transparente.
    badge: '/connexo-badge.png',
    tag: data.tag || 'connexo',
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Al tocar la notificación: enfoca o abre la app en la URL indicada ─────────

// Convierte la URL guardada en la notificación (ej. '?tab=ecom_orders') en una
// URL ABSOLUTA del panel.
//
// Dos trampas que hacían que el clic terminara mostrando el código de este
// mismo archivo:
//  1. Dentro de un service worker, las URLs relativas NO se resuelven contra la
//     página sino contra el script del SW. Es decir, '?tab=x' se convertía en
//     '/sw.js?tab=x' y el navegador servía este código como texto.
//  2. Aunque se resolviera a '/?tab=x', la ruta '/' de la app hace
//     <Navigate to="/dashboard"> y eso DESCARTA el query string, así que la
//     pestaña pedida se perdía. Por eso se apunta directo a /dashboard.
function resolveNotificationTarget(raw) {
  const base = self.registration.scope; // p. ej. https://misitio.com/
  let u;
  try {
    u = new URL(raw || '/', base);
  } catch (_) {
    return new URL('/dashboard', base).href;
  }
  if (u.origin !== new URL(base).origin) {
    return new URL('/dashboard', base).href; // nunca salir del sitio
  }
  if (u.pathname === '/' || u.pathname.endsWith('/sw.js')) {
    u = new URL('/dashboard' + u.search + u.hash, base);
  }
  return u.href;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = resolveNotificationTarget(
    event.notification.data && event.notification.data.url
  );
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const origin = new URL(self.registration.scope).origin;
    for (const client of all) {
      if (new URL(client.url).origin !== origin) continue;
      if (!('focus' in client)) continue;
      await client.focus();
      // Si ya está exactamente en el destino no recargamos: se perdería el
      // estado del panel sin ninguna ganancia.
      if ('navigate' in client && client.url !== target) {
        try { await client.navigate(target); } catch (_) { /* ignore */ }
      }
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
