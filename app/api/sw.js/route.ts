// GET /api/sw.js — Service Worker for offline caching
export function GET() {
    const sw = `
const CACHE_NAME = 'gitmaps-v1';
const PRECACHE = [
    '/',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Skip non-GET, WebSocket, and API requests (except manifest)
    if (e.request.method !== 'GET') return;
    if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
    if (url.pathname.startsWith('/api/') && !url.pathname.includes('manifest')) return;

    // Network-first for HTML pages (always get fresh content)
    if (e.request.headers.get('accept')?.includes('text/html')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // Cache-first for static assets (CSS, JS, fonts, images)
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res.ok && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            });
        })
    );
});
`;

    return new Response(sw, {
        headers: {
            'Content-Type': 'application/javascript',
            'Service-Worker-Allowed': '/',
            'Cache-Control': 'no-cache',
        },
    });
}
