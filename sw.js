/*
 * SpendDesk app-shell service worker.
 *
 * Why this exists: the interface itself must survive a dead connection. Once
 * the site has run in a browser, a later open with no network still paints the
 * same UI from this cache instead of a blank tab - the ledger keeps working on
 * local storage until the connection comes back (the app treats offline as a
 * paused sync, never as a sign-out).
 *
 * Strategy, chosen to keep "which bundle runs" honest:
 *   - Navigations are NETWORK-FIRST with a cache fallback. The deployed
 *     index.html always decides which hashed bundle is served, so a fresh
 *     deploy is picked up immediately; only a genuinely unreachable network
 *     falls back to the stored shell.
 *   - Hashed/immutable assets (scripts, styles, fonts, images) are
 *     CACHE-FIRST: their names change on every build, so a cached copy can
 *     never shadow a newer one.
 *   - Everything else (the update checker's index.html fetch, Supabase,
 *     Google, avatars) is passed straight through untouched.
 *
 * The cache name is versioned; anything not on the keep list is dropped on
 * activate, so an old shell can never outlive its own code.
 */

const SHELL_CACHE = 'spenddesk-shell-v1';
const ASSET_CACHE = 'spenddesk-assets-v1';
const KEEP_CACHES = [SHELL_CACHE, ASSET_CACHE];
const SHELL_URLS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !KEEP_CACHES.includes(key)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

const isImmutableAsset = (request, url) => {
  const destination = request.destination;
  if (destination === 'script' || destination === 'style' || destination === 'font') return true;
  return url.pathname.includes('/assets/');
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Cross-origin (Supabase, Google, Telegram, remote avatars) is never ours to
  // cache or answer for.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match('./'))
        )
    );
    return;
  }

  if (isImmutableAsset(request, url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
  }
  // Anything else goes to the network untouched.
});
