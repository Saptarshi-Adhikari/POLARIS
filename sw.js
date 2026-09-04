// Cache First, Network Fallback Service Worker for ASTRALIS Nav-OS

const CACHE_NAME = 'astralis-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/css/style.css',
  '/src/js/main.js',
  '/src/js/simulation/vectorField.js',
  '/src/js/simulation/iceberg.js',
  '/src/js/simulation/ship.js',
  '/src/js/ai/aiNavigator.js',
  '/src/js/render/canvasRenderer.js',
  '/src/js/ui/uiController.js',
  '/src/js/ui/aiClient.js',
  '/src/js/ai/autonomousController.js',
  '/src/js/simulation/scenarioManager.js',
  '/src/js/simulation/validationEngine.js',
  '/src/js/ai/riskIntelligenceEngine.js',
  '/src/js/ai/missionPlanner.js',
  '/src/js/data/antarcticDataManager.js',
  '/src/js/ai/explainabilityEngine.js',
  '/src/js/ai/counterfactualSimulator.js',
  '/src/js/ai/confidenceIntelligenceEngine.js',
  '/src/js/ai/decisionIntelligenceEngine.js',
  '/src/js/ai/metricsRegistry.js',
  '/src/js/offlineManager.js',
  '/src/js/performanceMonitor.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[Service Worker] Static assets precaching warning/failure:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Let the browser handle chrome extension schemes or other non-http requests
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.startsWith('http')) {
    return;
  }

  // Handle local development or production backend API endpoints
  if (event.request.url.includes('/api/') || event.request.url.includes(':8000/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          const now = Date.now();
          if (!self._lastSwWarn || now - self._lastSwWarn > 30000) {
            self._lastSwWarn = now;
            console.info('[Service Worker] Backend API request failed, serving mock fallback');
          }
          return createMockApiResponse(event.request);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
            return networkResponse;
          });
      })
      .catch(() => {
        // Fallback for API endpoints if any slipped through
        if (event.request.url.includes('/api/') || event.request.url.includes(':8000/')) {
          return createMockApiResponse(event.request);
        }
      })
  );
});

function createMockApiResponse(request) {
  // Return safe defaults if backend is unreachable
  const mockData = {
    status: 'OFFLINE',
    predictions: [],
    iceberg_predictions: [],
    sea_ice_forecast: { concentration: 0 },
    explanation: "Offline mode: AI copilot unavailable",
    llm_explanation: "Offline mode: AI copilot unavailable"
  };
  return new Response(JSON.stringify(mockData), {
    headers: { 'Content-Type': 'application/json' }
  });
}
