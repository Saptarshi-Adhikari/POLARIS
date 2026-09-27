import { runRoutePlannerCore } from './routePlannerCore.js';

self.onmessage = function (e) {
  if (!e.data) return;
  try {
    const result = runRoutePlannerCore(e.data);
    result.routeVersion = e.data.routeVersion || `v_${Date.now()}`;
    result.environmentVersion = e.data.environmentVersion || 1;
    result.predictionVersion = e.data.predictionVersion || 1;
    result.plannerVersion = e.data.plannerVersion || '3A_SPATIOTEMPORAL_1.0';
    self.postMessage(result);
  } catch (err) {
    self.postMessage({
      requestId: e.data.requestId,
      routeVersion: e.data.routeVersion || `v_${Date.now()}`,
      environmentVersion: e.data.environmentVersion || 1,
      predictionVersion: e.data.predictionVersion || 1,
      plannerVersion: e.data.plannerVersion || '3A_SPATIOTEMPORAL_1.0',
      error: err.message || 'Route worker error',
      waypoints: [
        { x: e.data.ship.x, y: e.data.ship.y },
        { x: e.data.dest.x, y: e.data.dest.y }
      ]
    });
  }
};
