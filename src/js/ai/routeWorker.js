import { runRoutePlannerCore } from './routePlannerCore.js';

self.onmessage = function (e) {
  if (!e.data) return;
  try {
    const result = runRoutePlannerCore(e.data);
    self.postMessage(result);
  } catch (err) {
    self.postMessage({
      requestId: e.data.requestId,
      error: err.message || 'Route worker error',
      waypoints: [
        { x: e.data.ship.x, y: e.data.ship.y },
        { x: e.data.dest.x, y: e.data.dest.y }
      ]
    });
  }
};
