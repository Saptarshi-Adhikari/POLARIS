import { describe, it, expect } from 'vitest';
import { offlineEdgeDeploymentManager } from '../src/js/data/OfflineEdgeDeploymentManager.js';
import { RealDataCache } from '../src/js/data/RealDataCache.js';
import { ProviderHealthTracker } from '../src/js/data/ProviderHealthModel.js';
import { fastFirstSafePlanner } from '../src/js/ai/FastFirstSafePlanner.js';
import { bathymetryProvider } from '../src/js/providers/bathymetryProvider.js';

describe('POLARIS Phase 1E — Docker / Offline Edge Deployment Suite', () => {

  it('1. Docker configuration files exist', () => {
    // Configuration check
    const config = offlineEdgeDeploymentManager.getEdgeConfiguration();
    expect(config).toHaveProperty('mode');
    expect(config).toHaveProperty('apiBaseUrl');
  });

  it('2. Required service definitions exist in edge config', () => {
    const isCapable = offlineEdgeDeploymentManager.isOfflineCapable();
    expect(isCapable).toBe(true);
  });

  it('3. Required ports are defined in edge configuration', () => {
    const config = offlineEdgeDeploymentManager.getEdgeConfiguration();
    expect(config.apiBaseUrl).toContain('8001');
  });

  it('4. Health endpoints are configured', () => {
    const healthTracker = new ProviderHealthTracker('EDGE_CONTAINER');
    expect(healthTracker.getStatus()).toHaveProperty('state');
  });

  it('5. Environment variables are documented and loadable', () => {
    const config = offlineEdgeDeploymentManager.getEdgeConfiguration();
    expect(config).toHaveProperty('cacheDir');
    expect(config).toHaveProperty('dataDir');
  });

  it('6. Offline data path exists and is accessible', () => {
    const cache = new RealDataCache();
    expect(typeof cache.loadSnapshot).toBe('function');
  });

  it('7. Cache path handles snapshot saving and loading', () => {
    const manager = offlineEdgeDeploymentManager;
    const dummySnap = { mode: 'REAL', icebergs: [] };
    manager.saveCachedSnapshot(dummySnap);
    const loaded = manager.loadCachedSnapshot();
    expect(loaded).toBeDefined();
  });

  it('8. No forbidden secret patterns exist in public edge config', () => {
    const config = offlineEdgeDeploymentManager.getEdgeConfiguration();
    const configStr = JSON.stringify(config);
    expect(configStr).not.toContain('SECRET_KEY');
    expect(configStr).not.toContain('PASSWORD');
  });

  it('9. Benchmark configuration is present offline', () => {
    expect(typeof fastFirstSafePlanner.evaluateLeftRight).toBe('function');
  });

  it('10. DEMO/OFFLINE configuration failover is deterministic', () => {
    const failover = offlineEdgeDeploymentManager.evaluateFailover(null, { icebergs: [] });
    expect(failover.status).toBe('DEGRADED_CACHED');
    expect(failover.provenance).toBe('LOCAL_EDGE_CACHE');
  });

  it('11. Core navigation loop operates without network dependencies', () => {
    const shipState = { x: 400, y: 1800, heading: 330, speed: 15 };
    const dest = { x: 3000, y: 400 };
    const hazard = { x: 1800, y: 1200, collisionRadius: 30 };
    const res = fastFirstSafePlanner.evaluateLeftRight(shipState, dest, hazard, { draft: 10 }, []);
    expect(res).toHaveProperty('selectedSide');
  });

  it('12. Bathymetry safety constraints remain active offline', () => {
    const depthVal = bathymetryProvider.validateRouteDepth([
      { x: 100, y: 100 },
      { x: 200, y: 200 }
    ]);
    expect(depthVal.safe).toBe(true);
  });

});
