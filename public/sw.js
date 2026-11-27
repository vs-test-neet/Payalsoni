const APP_CACHE_NAME = 'vs-test-app-v13';
const PAPERS_CACHE_NAME = 'vs-test-papers-offline-v1';
const VALID_CACHES = [APP_CACHE_NAME, PAPERS_CACHE_NAME];

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.webmanifest?v=3',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/assets/aistudio/Screenshot_2026-11-11-14-19-47-09_40deb401b9ffe8e1df2f1cc5ba480b12_d6e28b87.jpg',
  '/assets/aistudio/Screenshot_2026-11-11-14-19-47-09_40deb401b9ffe8e1df2f1cc5ba480b12_d6e28b87.jpg?v=3',
  '/assets/aistudio/Vs_PRAYAS_Minor_Test_06__02_11_2026__NEET_CBT_Test_e42702d3.html',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_URLS.map((u) =>
          fetch(u, { cache: 'reload' })
            .then((res) => {
              if (res && res.ok) return cache.put(u, res);
            })
            .catch(() => {})
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!VALID_CACHES.includes(key)) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

function isTestPaperOrAssetPath(pathname) {
  return (
    pathname.endsWith('/paper.html') ||
    pathname.endsWith('/html') ||
    pathname.startsWith('/api/store/test/') ||
    pathname.startsWith('/api/store/pdf/') ||
    pathname.startsWith('/static-store/paper/') ||
    pathname.startsWith('/static-store/test/') ||
    pathname.startsWith('/static-store/pdf/') ||
    pathname.startsWith('/assets/aistudio/')
  );
}

function isBootstrapPath(pathname) {
  return (
    pathname === '/api/store/bootstrap' ||
    pathname === '/static-store/bootstrap.json' ||
    pathname === '/api/store/students'
  );
}

self.addEventListener('fetch', (event) => {
  const method = event.request.method;
  if (method !== 'GET' && method !== 'HEAD') return;
  const url = new URL(event.request.url);

  // Never intercept Server-Sent Events stream
  if (url.pathname === '/api/store/stream') {
    return;
  }

  // 1. Test papers, HTML, questions JSON, PDFs, and question images (/qimg):
  //    Cache-first + background refresh (for GET), and instant cached 200 OK for HEAD so offline iframes NEVER abort!
  if (isTestPaperOrAssetPath(url.pathname)) {
    const canonicalPathKey = url.origin + url.pathname;
    const isExplicitOfflineInline = url.searchParams.get('offline') === '1';

    if (method === 'HEAD') {
      event.respondWith(
        caches.open(PAPERS_CACHE_NAME).then(async (cache) => {
          const cached =
            (await cache.match(canonicalPathKey)) ||
            (await cache.match(event.request.url, { ignoreSearch: true })) ||
            (await caches.match(canonicalPathKey));
          if (cached) {
            return new Response(null, {
              status: 200,
              headers: {
                'Content-Type': cached.headers.get('content-type') || 'text/html; charset=utf-8',
                'X-VS-Offline-Cache': '1',
              },
            });
          }
          try {
            return await fetch(event.request);
          } catch {
            return new Response(null, { status: 503 });
          }
        })
      );
      return;
    }

    event.respondWith(
      caches.open(PAPERS_CACHE_NAME).then(async (cache) => {
        const exactMatch = !isExplicitOfflineInline ? await cache.match(event.request) : undefined;
        const pathMatch =
          exactMatch ||
          (!isExplicitOfflineInline ? await cache.match(canonicalPathKey) : undefined) ||
          (!isExplicitOfflineInline ? await cache.match(event.request, { ignoreSearch: true }) : undefined);

        const networkFetch = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const ct = (response.headers.get('content-type') || '').toLowerCase();
            if (
              ct.includes('html') ||
              ct.includes('json') ||
              ct.includes('image') ||
              ct.includes('pdf') ||
              ct.includes('octet-stream')
            ) {
              // Always save under both the exact URL and canonical path key.
              // If an explicit ?offline=1 full-inline paper is fetched, save it as the canonical paper so offline mode has 100% inline images!
              cache.put(event.request, response.clone()).catch(() => {});
              if (isExplicitOfflineInline || !url.search.includes('skipHtml=1')) {
                cache.put(canonicalPathKey, response.clone()).catch(() => {});
              } else if (url.search.includes('skipHtml=1')) {
                cache.put(canonicalPathKey + '?skipHtml=1', response.clone()).catch(() => {});
              }
            }
          }
          return response;
        });

        if (pathMatch) {
          // Serve cached test paper immediately in 0ms (works 100% offline!).
          // Only background-refresh if online AND we don't overwrite an inline offline copy with a qimg-stripped version.
          if (!url.pathname.endsWith('/paper.html') || !pathMatch.headers.get('X-VS-Offline-Inline')) {
            networkFetch.catch(() => {});
          }
          return pathMatch;
        }

        try {
          return await networkFetch;
        } catch {
          const fallbackAny =
            (await cache.match(canonicalPathKey)) ||
            (await cache.match(event.request, { ignoreSearch: true })) ||
            (await caches.match(event.request, { ignoreSearch: true }));
          if (fallbackAny) return fallbackAny;

          if (url.search.includes('skipHtml=1') || url.pathname.endsWith('.json')) {
            return new Response(JSON.stringify({ offline: true, questions: [] }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          return new Response(
            '<!doctype html><html><body style="font-family:system-ui;padding:24px;text-align:center;"><h3>Offline Mode — Checking saved test on device...</h3><script>try{window.parent.postMessage({type:"VS_CBT_HTML_NOT_FOUND"},"*")}catch(e){}</script></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })
    );
    return;
  }

  if (method !== 'GET') return;

  // 2. Portal Bootstrap (/api/store/bootstrap & /static-store/bootstrap.json):
  //    Network-first when online (stores latest full snapshot under canonical key), falls back to cached snapshot offline.
  if (isBootstrapPath(url.pathname)) {
    const canonicalKey = url.origin + url.pathname;
    event.respondWith(
      caches.open(APP_CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response && response.status === 200) {
            if (!url.search.includes('sinceVersion=')) {
              cache.put(canonicalKey, response.clone()).catch(() => {});
            }
          }
          return response;
        } catch {
          const cachedFull =
            (await cache.match(canonicalKey)) ||
            (await cache.match(event.request, { ignoreSearch: true }));
          if (cachedFull) return cachedFull;
          const staticBoot = await cache.match(url.origin + '/static-store/bootstrap.json');
          if (staticBoot) return staticBoot;
          return new Response(JSON.stringify({ unchanged: true, offline: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })
    );
    return;
  }

  // 3. Google Fonts & static CDN assets: Cache-first for offline typography
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(APP_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res && (res.status === 200 || res.type === 'opaque')) {
            cache.put(event.request, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          return new Response('', { status: 200 });
        }
      })
    );
    return;
  }

  // 4. App Shell, Vite bundles (/assets/*, /src/*, /node_modules/*) & Navigation:
  //    Network-first with full Cache Storage fallback so refreshing or opening the app offline always works!
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const responseClone = response.clone();
          caches.open(APP_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
            if (url.pathname === '/' || url.pathname === '/index.html') {
              cache.put(url.origin + '/', response.clone()).catch(() => {});
              cache.put(url.origin + '/index.html', response.clone()).catch(() => {});
            }
          });
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(APP_CACHE_NAME);
        const exact =
          (await cache.match(event.request)) ||
          (await cache.match(event.request, { ignoreSearch: true }));
        if (exact) return exact;
        if (event.request.mode === 'navigate') {
          const rootMatch =
            (await cache.match(url.origin + '/')) ||
            (await cache.match(url.origin + '/index.html')) ||
            (await caches.match('/'));
          if (rootMatch) return rootMatch;
        }
        return Response.error();
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
