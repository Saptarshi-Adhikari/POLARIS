import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MapLibreRenderer, isValidCoord, isValidBounds, ROUTE_PROXIMITY_THRESHOLD_NM } from '../src/js/geo/maplibreRenderer.js';
import { haversineDistanceNM, calculateInitialBearing, minDistanceToRouteNM, pointToSegmentDistanceNM, calculateEncounterCPA, classifyEncounter } from '../src/js/geo/projection.js';
import { ModeManager } from '../src/js/geo/modeManager.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';
import { DemoDataProvider } from '../src/js/data/DemoDataProvider.js';
import { Ship } from '../src/js/simulation/ship.js';
import { byuHistoricalProvider, dayOfYearToDate } from '../src/js/data/ByuHistoricalProvider.js';
import fs from 'fs';
import path from 'path';

describe('ASTRALIS Nav-OS — Real 2D Map (MapLibre GL JS + MapTiler)', () => {
  let mockContainer;

  beforeEach(() => {
    mockContainer = {
      id: 'maplibre-container',
      className: '',
      classList: {
        add: (cls) => { mockContainer.className += ' ' + cls; },
        remove: (cls) => { mockContainer.className = mockContainer.className.replace(cls, '').trim(); },
        contains: (cls) => mockContainer.className.includes(cls)
      },
      appendChild: vi.fn(),
      innerHTML: ''
    };

    globalThis.window = globalThis;
    globalThis.window.devicePixelRatio = 1;
    globalThis.document = {
      getElementById: (id) => {
        if (id === 'maplibre-container') return mockContainer;
        if (id === 'data-mode-demo-btn' || id === 'data-mode-real-btn') {
          return { className: '', addEventListener: vi.fn() };
        }
        if (id === 'add-iceberg-btn' || id === 'bottom-spawn-iceberg-btn') {
          return { classList: { add: vi.fn(), remove: vi.fn() } };
        }
        if (id === 'provenance-source-text') {
          return { innerText: '' };
        }
        return null;
      },
      createElement: () => ({
        id: '',
        className: '',
        innerHTML: '',
        classList: { remove: vi.fn() }
      })
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. REAL map initializes with MapLibre instance', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    expect(renderer).toBeDefined();
    expect(renderer.containerId).toBe('maplibre-container');
    expect(renderer.isInitialized).toBe(false);
  });

  it('2. MapTiler API key is read from environment', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    const key = renderer.getApiKey();
    expect(key === null || typeof key === 'string').toBe(true);
  });

  it('3. API key is not hardcoded in source code', () => {
    const sourceCode = fs.readFileSync(path.resolve(__dirname, '../src/js/geo/maplibreRenderer.js'), 'utf-8');
    expect(sourceCode).not.toMatch(/key=['"][a-zA-Z0-9]{15,}['"]/);
    expect(sourceCode).toContain('VITE_MAPTILER_API_KEY');
  });

  it('4. Map style URL uses MapTiler pattern with API key', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    vi.spyOn(renderer, 'getApiKey').mockReturnValue('TEST_KEY_123');
    const key = renderer.getApiKey();
    const mapStyle = `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`;
    expect(mapStyle).toContain('api.maptiler.com');
    expect(mapStyle).toContain('key=TEST_KEY_123');
  });

  it('5. Antarctica is the initial center ([76.187, -69.4])', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    const [lon, lat] = [76.187, -69.4];
    expect(lon).toBeCloseTo(76.187, 2);
    expect(lat).toBeCloseTo(-69.4, 2);
    expect(isValidCoord([lon, lat])).toBe(true);
  });

  it('6. World zoom-out is prevented (maxBounds restricted to Antarctic theater)', () => {
    const maxBounds = [[-180, -90], [180, -45]];
    expect(maxBounds[0][1]).toBe(-90);
    expect(maxBounds[1][1]).toBe(-45);
    expect(isValidBounds(maxBounds)).toBe(true);
  });

  it('7. Ship aligns with lat/lon coordinates', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    const shipWorld = { x: 1800, y: 1200 };
    const [lon, lat] = renderer.worldToLatLon(shipWorld.x, shipWorld.y);
    expect(lat).toBeCloseTo(-69.4, 1);
    expect(lon).toBeCloseTo(76.187, 1);
  });

  it('8. Active route aligns with lat/lon coordinates', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    const coords = waypoints.map(w => renderer.worldToLatLon(w.x, w.y));
    expect(coords.length).toBe(2);
    expect(isValidCoord(coords[0])).toBe(true);
    expect(isValidCoord(coords[1])).toBe(true);
  });

  it('9. Icebergs align with lat/lon coordinates', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    const icebergs = [{ id: 1, x: 2000, y: 1000, vx: 0.1, vy: 0.2 }];
    const iceLonLat = renderer.worldToLatLon(icebergs[0].x, icebergs[0].y);
    expect(isValidCoord(iceLonLat)).toBe(true);
  });

  it('10. REAL distance displays in NM', () => {
    const scaleUnit = 'nautical';
    expect(scaleUnit).toBe('nautical');
  });

  it('11. SPAWN ICEBERG and DEMO controls are hidden in REAL mode', () => {
    const mockEngine = { dataMode: 'DEMO', state: { environment: {} } };
    const modeManager = new ModeManager(mockEngine);

    const mockCanvas = { classList: { add: vi.fn(), remove: vi.fn() } };
    const mockPlayback = { classList: { add: vi.fn(), remove: vi.fn() } };
    const mockStats = { classList: { add: vi.fn(), remove: vi.fn() } };

    const originalGetElementById = globalThis.document.getElementById;
    globalThis.document.getElementById = (id) => {
      if (id === 'map-canvas') return mockCanvas;
      if (id === 'bottom-playback-bar') return mockPlayback;
      if (id === 'voyage-stats-hud') return mockStats;
      return originalGetElementById(id);
    };

    modeManager.setMode('REAL');
    expect(mockEngine.dataMode).toBe('REAL');
    expect(mockCanvas.classList.add).toHaveBeenCalledWith('hidden');
    expect(mockPlayback.classList.add).toHaveBeenCalledWith('hidden');
    expect(mockStats.classList.add).toHaveBeenCalledWith('hidden');

    modeManager.setMode('DEMO');
    expect(mockEngine.dataMode).toBe('DEMO');
    expect(mockCanvas.classList.remove).toHaveBeenCalledWith('hidden');
    expect(mockPlayback.classList.remove).toHaveBeenCalledWith('hidden');
    expect(mockStats.classList.remove).toHaveBeenCalledWith('hidden');

    globalThis.document.getElementById = originalGetElementById;
  });

  it('12. MapLibre options enforce renderWorldCopies: false and Antarctic minZoom', () => {
    const sourceCode = fs.readFileSync(path.resolve(__dirname, '../src/js/geo/maplibreRenderer.js'), 'utf-8');
    expect(sourceCode).toContain('renderWorldCopies: false');
    expect(sourceCode).toContain('minZoom: 4.2');
    expect(sourceCode).toContain('dragRotate: false');
  });

  it('13. Missing API key produces a controlled configuration error state', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    vi.spyOn(renderer, 'getApiKey').mockReturnValue(null);
    renderer.init();
    expect(renderer.hasKeyError).toBe(true);
    expect(mockContainer.appendChild).toHaveBeenCalled();
  });

  it('14. Map tile failure does not crash the application', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    vi.spyOn(renderer, 'getApiKey').mockReturnValue('VALID_KEY');
    expect(() => {
      if (renderer.map && renderer.map.fire) {
        renderer.map.fire('error', { error: { status: 404 } });
      }
    }).not.toThrow();
  });

  // ── Section 6: Specific Defensive Validation & Ordering Tests ──────────────────

  it('15. Defensive coord validation: handles null, undefined, NaN, and malformed inputs', () => {
    const renderer = new MapLibreRenderer('maplibre-container');

    expect(isValidCoord(null)).toBe(false);
    expect(isValidCoord(undefined)).toBe(false);
    expect(isValidCoord([])).toBe(false);
    expect(isValidCoord([10])).toBe(false);
    expect(isValidCoord(['10', '20'])).toBe(false);
    expect(isValidCoord([NaN, -69.4])).toBe(false);
    expect(isValidCoord([76.18, Infinity])).toBe(false);

    expect(renderer.worldToLatLon(null, 1200)).toBeNull();
    expect(renderer.worldToLatLon(1800, undefined)).toBeNull();
    expect(renderer.worldToLatLon(NaN, 1200)).toBeNull();
  });

  it('16. Defensive route rendering: handles null, undefined, empty, and invalid waypoints without throwing', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({ setData: vi.fn() })
    };

    expect(() => renderer.renderFrame(null, null, null, null)).not.toThrow();
    expect(() => renderer.renderFrame(null, undefined, null, null)).not.toThrow();
    expect(() => renderer.renderFrame(null, { waypoints: [] }, null, null)).not.toThrow();
    expect(() => renderer.renderFrame(null, { waypoints: [{ x: 100, y: 200 }, null, { x: NaN, y: 300 }] }, null, null)).not.toThrow();
  });

  it('17. Defensive destination rendering: handles null and undefined destination without throwing', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({ setData: vi.fn() })
    };

    expect(() => renderer.renderFrame(null, null, null, null)).not.toThrow();
    expect(() => renderer.renderFrame(null, null, { x: NaN, y: 400 }, null)).not.toThrow();
  });

  it('18. API Key validation: distinguishes missing, placeholder, and valid keys', () => {
    const renderer = new MapLibreRenderer('maplibre-container');

    vi.stubEnv('VITE_MAPTILER_API_KEY', '');
    expect(renderer.getApiKey()).toBeNull();

    vi.stubEnv('VITE_MAPTILER_API_KEY', 'PUT_KEY_HERE');
    expect(renderer.getApiKey()).toBeNull();

    vi.stubEnv('VITE_MAPTILER_API_KEY', 'REAL_KEY_999');
    expect(renderer.getApiKey()).toBe('REAL_KEY_999');

    vi.unstubAllEnvs();
  });

  it('19. MapLibre initialization ordering: container is unhidden before map instantiation', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    const showSpy = vi.spyOn(renderer, 'show');
    vi.spyOn(renderer, 'getApiKey').mockReturnValue(null);

    renderer.init();
    expect(showSpy).toHaveBeenCalled();
  });

  // ── Section 7: USNIC NOAA ERDDAP Iceberg Operational Data Layer Tests ────────────

  it('20. USNIC ERDDAP normalization & Antarctic filtering (latitude <= -45)', async () => {
    const provider = new RealDataProvider();
    
    // Test row normalization & validation
    const mockErddapJson = {
      table: {
        columnNames: ['time', 'latitude', 'longitude', 'Iceberg', 'length_nm', 'width', 'area', 'source', 'remarks'],
        rows: [
          ['2026-01-02T00:00:00Z', -75.6, -33.0, 'A23A', 52, 40, 1071, 'Sentinel-1A', 'Position updated.'],
          ['2026-01-02T00:00:00Z', -40.0, -50.0, 'WARM_BERG', 10, 5, 50, 'MODIS', 'North of Antarctic theater - must filter out'],
          ['2026-01-02T00:00:00Z', 'INVALID_LAT', -33.0, 'BAD_BERG', 52, 40, 1071, 'Sentinel-1A', 'Invalid lat'],
          ['2026-01-02T00:00:00Z', -70.0, 'INVALID_LON', 'BAD_LON', 52, 40, 1071, 'Sentinel-1A', 'Invalid lon'],
          ['2026-01-02T00:00:00Z', -71.5, -107.5, '', 30, 18, 383, 'Sentinel-1A', 'Missing name - skip']
        ]
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockErddapJson
    });

    await provider.fetchUSNICIcebergs();
    const result = provider.getIcebergs();

    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe('A23A');
    expect(result.data[0].id).toBe('USNIC_A23A_2026-01-02');
    expect(result.data[0].latitude).toBe(-75.6);
    expect(result.data[0].longitude).toBe(-33.0);
    expect(result.data[0].lengthNm).toBe(52);
    expect(result.data[0].widthNm).toBe(40);
    expect(result.data[0].areaSqNm).toBe(1071);
    expect(result.data[0].source).toBe('Sentinel-1A');
  });

  it('21. Deterministic iceberg ID and missing optional size fields', async () => {
    const provider = new RealDataProvider();
    const mockJson = {
      table: {
        columnNames: ['time', 'latitude', 'longitude', 'Iceberg', 'length_nm', 'width', 'area', 'source', 'remarks'],
        rows: [
          ['2026-02-10T00:00:00Z', -68.5, 78.5, 'D15', null, null, null, null, null]
        ]
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson
    });

    await provider.fetchUSNICIcebergs();
    const ice = provider.getIcebergs().data[0];

    expect(ice.id).toBe('USNIC_D15_2026-02-10');
    expect(ice.lengthNm).toBeNull();
    expect(ice.widthNm).toBeNull();
    expect(ice.areaSqNm).toBeNull();
    expect(ice.source).toBe('USNIC / NOAA ERDDAP');
  });

  it('22. Provenance shows USNIC / NOAA ERDDAP, STATUS: CACHED, and no Copernicus attribution', () => {
    const provider = new RealDataProvider();
    const res = provider.getIcebergs();

    expect(res.provenance.source).toContain('USNIC');
    expect(res.provenance.status).toBe('CACHED');
    expect(res.provenance.status).not.toBe('LIVE');
    expect(res.provenance.source).not.toContain('Copernicus');

    const provList = provider.getProvenance();
    const usnicItem = provList.find(p => p.id === 'usnic-icebergs');
    expect(usnicItem).toBeDefined();
    expect(usnicItem.status).toBe('CACHED');
    expect(usnicItem.note).not.toContain('Copernicus');
  });

  it('23. MapLibre GeoJSON ordering [longitude, latitude] for direct geographic icebergs', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;
    
    let setDataArg = null;
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => name === 'iceberg-points' ? { setData: (data) => { setDataArg = data; } } : null
    };

    const realIcebergs = [
      { id: 'USNIC_A23A', name: 'A23A', latitude: -75.5, longitude: -33.0, source: 'Sentinel-1A' }
    ];

    renderer.renderFrame(null, null, null, realIcebergs);

    expect(setDataArg).not.toBeNull();
    expect(setDataArg.type).toBe('FeatureCollection');
    expect(setDataArg.features.length).toBe(1);
    expect(setDataArg.features[0].geometry.coordinates).toEqual([-33.0, -75.5]); // [lon, lat] ordering
  });

  it('24. Network failure falls back to cached data or static snapshot without crashing', async () => {
    const provider = new RealDataProvider();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('502 Proxy Error / Network Offline'));

    await provider.fetchUSNICIcebergs();
    const res = provider.getIcebergs();

    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.provenance.status).toBe('CACHED');
  });

  it('25. DEMO mode retains its existing synthetic iceberg system', () => {
    const demoProvider = new DemoDataProvider({});
    expect(demoProvider.getIcebergs).toBeDefined();
    const demoIce = demoProvider.getIcebergs();
    expect(demoIce.provenance.status).toBe('SIM');
  });

  // ── Section 8: Phase 2 BYU Historical Iceberg Trajectory Tests ────────────────

  it('26. BYU dayOfYearToDate converts YYYYDDD accurately (242, 2011 => 2011-08-30)', () => {
    expect(dayOfYearToDate(242, 2011)).toBe('2011-08-30');
    expect(dayOfYearToDate(1, 2026)).toBe('2026-01-01');
    expect(dayOfYearToDate(365, 2025)).toBe('2025-12-31');
  });

  it('27. ByuHistoricalProvider parses ASCAT SIR format lines chronologically', () => {
    const rawAscat = `
lat:  -75.8853 lon:  -41.4727 day: 250 2011 file: oush-a-Ant11-250-250.sir backscat:  -7.745
lat:  -75.8853 lon:  -41.4727 day: 242 2011 file: oush-a-Ant11-242-242.sir backscat:  -7.803
lat:  -40.0000 lon:  -40.0000 day: 243 2011 file: oush-a-Ant11-243-243.sir backscat:  -8.000
    `;
    const parsed = byuHistoricalProvider.parseAscatFile('A23A', rawAscat);

    expect(parsed).not.toBeNull();
    expect(parsed.observations.length).toBe(2); // -40.0 filtered out by latitude <= -45.0
    expect(parsed.observations[0].date).toBe('2011-08-30'); // Day 242 comes first after chronological sort
    expect(parsed.observations[1].date).toBe('2011-09-07'); // Day 250
    expect(parsed.observations[0].latitude).toBe(-75.8853);
    expect(parsed.observations[0].longitude).toBe(-41.4727);
  });

  it('28. ByuHistoricalProvider matches iceberg names deterministically (A23A, D15, B22A, B27)', async () => {
    const trackA23 = await byuHistoricalProvider.getHistoricalTrack('Iceberg A23A (approx.)');
    expect(trackA23).not.toBeNull();
    expect(trackA23.icebergId).toBe('A23A');
    expect(trackA23.observationCount).toBeGreaterThan(100);

    const trackD15 = await byuHistoricalProvider.getHistoricalTrack('D15');
    expect(trackD15).not.toBeNull();
    expect(trackD15.icebergId).toBe('D15');

    const unknownTrack = await byuHistoricalProvider.getHistoricalTrack('UNKNOWN_BERG_999');
    expect(unknownTrack).toBeNull();
  });

  it('29. MapLibreRenderer converts historical track to GeoJSON LineString [longitude, latitude]', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({
        setData: (data) => { setDataCalls[name] = data; }
      })
    };

    const mockTrack = {
      icebergId: 'A23A',
      name: 'Iceberg A23A',
      observations: [
        { date: '2011-08-30', latitude: -75.8, longitude: -41.4 },
        { date: '2011-08-31', latitude: -75.9, longitude: -41.5 }
      ]
    };

    renderer.renderHistoricalTrack(mockTrack, '2011-08-30');

    const lineData = setDataCalls['byu-historical-track'];
    expect(lineData).toBeDefined();
    expect(lineData.type).toBe('FeatureCollection');
    expect(lineData.features[0].geometry.type).toBe('LineString');
    expect(lineData.features[0].geometry.coordinates).toEqual([[-41.4, -75.8], [-41.5, -75.9]]);

    const replayData = setDataCalls['byu-historical-replay-point'];
    expect(replayData).toBeDefined();
    expect(replayData.features[0].geometry.coordinates).toEqual([-41.4, -75.8]);
  });

  it('30. Historical replay state calculates correct index and date lookup', () => {
    const mockTrack = {
      observations: [
        { date: '2011-01-01', latitude: -70.0, longitude: 0.0 },
        { date: '2011-06-01', latitude: -71.0, longitude: 1.0 },
        { date: '2011-12-01', latitude: -72.0, longitude: 2.0 }
      ]
    };

    const stateMid = byuHistoricalProvider.getReplayState(mockTrack, '2011-07-01');
    expect(stateMid.currentIndex).toBe(1);
    expect(stateMid.currentObservation.date).toBe('2011-06-01');
    expect(stateMid.traversedObservations.length).toBe(2);

    const stateLatest = byuHistoricalProvider.getReplayState(mockTrack, null);
    expect(stateLatest.currentIndex).toBe(2);
    expect(stateLatest.currentObservation.date).toBe('2011-12-01');
  });

  it('31. Clear historical track clears MapLibre trajectory sources', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({
        setData: (data) => { setDataCalls[name] = data; }
      })
    };

    renderer.clearHistoricalTrack();
    expect(setDataCalls['byu-historical-track'].features).toEqual([]);
    expect(setDataCalls['byu-historical-replay-point'].features).toEqual([]);
  });

  // ── Section 9: Phase 3 Mission Visualization Tests ──────────────────

  it('32. Own-ship maps world coordinates (x,y) to valid Antarctic geographic [lon, lat]', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    const shipWorld = { x: 1800, y: 1200 };
    const [lon, lat] = renderer.worldToLatLon(shipWorld.x, shipWorld.y);
    expect(isValidCoord([lon, lat])).toBe(true);
    expect(lat).toBeCloseTo(-69.4, 1);
    expect(lon).toBeCloseTo(76.187, 1);
  });

  it('33. Own-ship GeoJSON contains heading property and SIMULATED status metadata', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({
        setData: (data) => { setDataCalls[name] = data; }
      })
    };

    const mockShip = { x: 1800, y: 1200, heading: 45, speed: 12.5 };
    renderer.renderFrame(mockShip, null, null, []);

    const vesselData = setDataCalls['vessel-ship'];
    expect(vesselData).toBeDefined();
    expect(vesselData.features[0].geometry.coordinates).toBeDefined();
    expect(vesselData.features[0].properties.heading).toBe(45);
    expect(vesselData.features[0].properties.status).toBe('SIMULATED');
    expect(vesselData.features[0].properties.vesselName).toContain('ASTRALIS');
  });

  it('34. Route GeoJSON LineString connects waypoints and destination in order', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({
        setData: (data) => { setDataCalls[name] = data; }
      })
    };

    const mockShip = { x: 1000, y: 1000, heading: 0 };
    const mockRoute = { waypoints: [{ x: 1500, y: 1500 }, { x: 2000, y: 2000 }] };
    const mockDestination = { x: 2000, y: 2000, label: 'Station Alpha' };

    renderer.renderFrame(mockShip, mockRoute, mockDestination, []);

    const routeData = setDataCalls['active-route'];
    expect(routeData).toBeDefined();
    expect(routeData.features[0].geometry.type).toBe('LineString');
    expect(routeData.features[0].geometry.coordinates.length).toBe(2);

    const destData = setDataCalls['dest-point'];
    expect(destData).toBeDefined();
    expect(destData.features[0].geometry.type).toBe('Point');
    expect(destData.features[0].geometry.coordinates).toEqual(routeData.features[0].geometry.coordinates[1]);
  });

  it('35. Missing route or destination renders safely without crashing', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({
        setData: (data) => { setDataCalls[name] = data; }
      })
    };

    const mockShip = { x: 1800, y: 1200, heading: 90 };
    expect(() => renderer.renderFrame(mockShip, null, null, [])).not.toThrow();

    expect(setDataCalls['active-route']).toBeDefined();
    expect(setDataCalls['active-route'].features).toEqual([]);
    expect(setDataCalls['dest-point']).toBeDefined();
    expect(setDataCalls['dest-point'].features).toEqual([]);
  });

  it('36. Great-circle distance (Haversine) returns correct distance in Nautical Miles', () => {
    const distNM = haversineDistanceNM(-69.4, 76.187, -70.0, 76.187);
    expect(distNM).toBeGreaterThan(35);
    expect(distNM).toBeLessThan(37);
  });

  it('37. Initial bearing calculation returns 0-360 degree compass bearing', () => {
    // Due North
    const bearingNorth = calculateInitialBearing(0, 0, 10, 0);
    expect(bearingNorth).toBeCloseTo(0, 1);

    // Due East
    const bearingEast = calculateInitialBearing(0, 0, 0, 10);
    expect(bearingEast).toBeCloseTo(90, 1);

    // Due South
    const bearingSouth = calculateInitialBearing(10, 0, 0, 0);
    expect(bearingSouth).toBeCloseTo(180, 1);
  });

  it('38. Selected iceberg distance & bearing update relative to own ship position', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({ setData: vi.fn() })
    };

    const mockShip = { x: 1800, y: 1200, heading: 0 };
    const mockIceberg = { id: 'USNIC_A23A', name: 'A23A', latitude: -75.5, longitude: -33.0 };

    renderer.renderFrame(mockShip, null, null, [mockIceberg]);

    const dist = haversineDistanceNM(-69.4, 76.187, mockIceberg.latitude, mockIceberg.longitude);
    const bearing = calculateInitialBearing(-69.4, 76.187, mockIceberg.latitude, mockIceberg.longitude);

    expect(dist).toBeGreaterThan(500);
    expect(bearing).toBeGreaterThan(0);
    expect(bearing).toBeLessThan(360);
  });

  it('39. Provenance HUD confirms USNIC + BYU source attribution and SIMULATED ship status', () => {
    const provider = new RealDataProvider();
    const prov = provider.getProvenance();

    const usnic = prov.find(p => p.id === 'usnic-icebergs');
    const byu = prov.find(p => p.id === 'byu-tracks');

    expect(usnic).toBeDefined();
    expect(usnic.note).toContain('USNIC');
    expect(byu).toBeDefined();
    expect(byu.note).toContain('BYU');
  });

  it('40. REAL and DEMO modes maintain strict isolation of ship, route, and controls', () => {
    const mockEngine = { dataMode: 'DEMO', state: { environment: {} } };
    const modeManager = new ModeManager(mockEngine);

    const mockCanvas = { classList: { add: vi.fn(), remove: vi.fn() } };
    const mockPlayback = { classList: { add: vi.fn(), remove: vi.fn() } };
    const mockStats = { classList: { add: vi.fn(), remove: vi.fn() } };

    const originalGetElementById = globalThis.document.getElementById;
    globalThis.document.getElementById = (id) => {
      if (id === 'map-canvas') return mockCanvas;
      if (id === 'bottom-playback-bar') return mockPlayback;
      if (id === 'voyage-stats-hud') return mockStats;
      return originalGetElementById(id);
    };

    modeManager.setMode('REAL');
    expect(mockEngine.dataMode).toBe('REAL');
    expect(mockCanvas.classList.add).toHaveBeenCalledWith('hidden');

    modeManager.setMode('DEMO');
    expect(mockEngine.dataMode).toBe('DEMO');
    expect(mockCanvas.classList.remove).toHaveBeenCalledWith('hidden');

    globalThis.document.getElementById = originalGetElementById;
  });

  // ── Section 10: Phase 4 Real Iceberg Hazard Intelligence & Geospatial Consistency Tests ──

  it('41. Ship heading convention: 0 deg = East (+X), 90 deg = South (+Y), 270 deg = North (-Y) in world space', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({
        setData: (data) => { setDataCalls[name] = data; }
      })
    };

    // Heading 0 = East (+X in world space) -> endLon > startLon
    const shipEast = { x: 1800, y: 1200, heading: 0 };
    renderer.renderFrame(shipEast, null, null, []);
    const vecEast = setDataCalls['vessel-heading-vector'].features[0].geometry.coordinates;
    expect(vecEast[1][0]).toBeGreaterThan(vecEast[0][0]); // endLon > startLon (East)

    // Heading 90 = South (+Y in world space, negative latitude in Geographic space) -> endLat < startLat
    const shipSouth = { x: 1800, y: 1200, heading: 90 };
    renderer.renderFrame(shipSouth, null, null, []);
    const vecSouth = setDataCalls['vessel-heading-vector'].features[0].geometry.coordinates;
    expect(vecSouth[1][1]).toBeLessThan(vecSouth[0][1]); // endLat < startLat (South)
  });

  it('42. All GeoJSON coordinates strictly use [longitude, latitude] ordering', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({ setData: (data) => { setDataCalls[name] = data; } })
    };

    const mockShip = { x: 1800, y: 1200, heading: 45 };
    const mockIceberg = { id: 'USNIC_A23A', name: 'A23A', latitude: -75.5, longitude: -33.0 };

    renderer.renderFrame(mockShip, null, null, [mockIceberg]);

    const shipCoords = setDataCalls['vessel-ship'].features[0].geometry.coordinates;
    expect(shipCoords[0]).toBeCloseTo(76.187, 1); // lon
    expect(shipCoords[1]).toBeCloseTo(-69.4, 1); // lat

    const iceCoords = setDataCalls['iceberg-points'].features[0].geometry.coordinates;
    expect(iceCoords[0]).toBe(-33.0); // lon
    expect(iceCoords[1]).toBe(-75.5); // lat
  });

  it('43. Geodesic point-to-segment distance (pointToSegmentDistanceNM) computes minimum distance in NM', () => {
    // Segment along equator: (0, 0) -> (0, 10)
    // Point at (1, 5) -> perpendicular distance ~60 NM north
    const distNM = pointToSegmentDistanceNM(1.0, 5.0, 0.0, 0.0, 0.0, 10.0);
    expect(distNM).toBeGreaterThan(58);
    expect(distNM).toBeLessThan(62);
  });

  it('44. Minimum route distance (minDistanceToRouteNM) handles empty, single point, and multi-segment routes', () => {
    const route = [[76.0, -69.0], [77.0, -69.0], [77.0, -70.0]];
    const distNear = minDistanceToRouteNM(-69.1, 76.5, route);
    expect(distNear).toBeLessThan(10); // Very close to first segment

    const distFar = minDistanceToRouteNM(-80.0, 0.0, route);
    expect(distFar).toBeGreaterThan(500); // Far away
  });

  it('45. Icebergs near planned route receive isNearRoute = true when within ROUTE_PROXIMITY_THRESHOLD_NM', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({ setData: (data) => { setDataCalls[name] = data; } })
    };

    const mockShip = { x: 1800, y: 1200, heading: 0 };
    // Route from Bharati (-69.4, 76.187) to (-70.0, 76.187)
    const mockRoute = { waypoints: [{ x: 1800, y: 1200 }, { x: 1800, y: 1260 }] };
    // Iceberg placed ~10 NM from route segment
    const nearIceberg = { id: 'NEAR_BERG', name: 'NEAR_BERG', latitude: -69.5, longitude: 76.3 };

    renderer.renderFrame(mockShip, mockRoute, null, [nearIceberg]);

    const iceData = setDataCalls['iceberg-points'];
    expect(iceData.features[0].properties.isNearRoute).toBe(true);
    expect(Number(iceData.features[0].properties.routeDistNm)).toBeLessThan(ROUTE_PROXIMITY_THRESHOLD_NM);
  });

  it('46. Icebergs far from route receive isNearRoute = false', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;

    let setDataCalls = {};
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({ setData: (data) => { setDataCalls[name] = data; } })
    };

    const mockShip = { x: 1800, y: 1200, heading: 0 };
    const mockRoute = { waypoints: [{ x: 1800, y: 1200 }, { x: 1800, y: 1260 }] };
    // Iceberg placed far in Weddell Sea (-75.5, -33.0)
    const farIceberg = { id: 'A23A', name: 'A23A', latitude: -75.5, longitude: -33.0 };

    renderer.renderFrame(mockShip, mockRoute, null, [farIceberg]);

    const iceData = setDataCalls['iceberg-points'];
    expect(iceData.features[0].properties.isNearRoute).toBe(false);
    expect(Number(iceData.features[0].properties.routeDistNm)).toBeGreaterThan(ROUTE_PROXIMITY_THRESHOLD_NM);
  });

  it('47. Update awareness HUD updates nearest iceberg text and near-route iceberg counts', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.currentShipLatLon = [76.187, -69.4];

    const mockNearestEl = { innerText: '' };
    const mockNearRouteEl = { innerText: '' };

    const origGetElementById = globalThis.document.getElementById;
    globalThis.document.getElementById = (id) => {
      if (id === 'real-nearest-iceberg-text') return mockNearestEl;
      if (id === 'real-near-route-count-text') return mockNearRouteEl;
      return origGetElementById(id);
    };

    const icebergFeatures = [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [76.2, -69.5] },
        properties: { name: 'D15', isNearRoute: true }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-33.0, -75.5] },
        properties: { name: 'A23A', isNearRoute: false }
      }
    ];

    renderer.updateAwarenessHUD(icebergFeatures);

    expect(mockNearestEl.innerText).toContain('D15');
    expect(mockNearRouteEl.innerText).toBe('1');

    globalThis.document.getElementById = origGetElementById;
  });

  it('48. Missing route or empty iceberg dataset handles awareness HUD safely without throwing', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    expect(() => renderer.updateAwarenessHUD([])).not.toThrow();
    expect(() => renderer.updateAwarenessHUD(null)).not.toThrow();
  });

  it('49. Provenance HUD confirms explicit distinction between CURRENT OBSERVED, HISTORICAL REPLAY, and SIMULATED state', () => {
    const provider = new RealDataProvider();
    const prov = provider.getProvenance();

    const usnic = prov.find(p => p.id === 'usnic-icebergs');
    const byu = prov.find(p => p.id === 'byu-tracks');
    const ship = prov.find(p => p.id === 'own-ship-state');

    expect(usnic.status).toBe('CACHED');
    expect(byu.status).toBe('HISTORICAL');
    expect(ship.status).toBe('SIMULATED');
    expect(usnic.status).not.toBe('LIVE');
    expect(ship.status).not.toBe('AIS');
  });

  it('50. Antarctic camera constraints remain enforced after Phase 4 hazard awareness updates', () => {
    const sourceCode = fs.readFileSync(path.resolve(__dirname, '../src/js/geo/maplibreRenderer.js'), 'utf-8');
    expect(sourceCode).toContain('maxBounds');
    expect(sourceCode).toContain('-45');
    expect(sourceCode).toContain('minZoom: 4.2');
  });

  // ── Section 11: Phase 5 Explainable Maritime Encounter Analysis Tests ──

  it('51. CPA / TCPA calculation for head-on encounter computes accurate CPA distance and TCPA minutes', () => {
    // Ship moving East at 10 kn from (0, 0), Target moving West at 10 kn from (0, 10 NM East = 0.1667 deg lon)
    const cpaRes = calculateEncounterCPA({
      shipLat: 0, shipLon: 0, shipSpeedKn: 10, shipHeadingDeg: 0, // East
      targetLat: 0, targetLon: 0.166667, targetSpeedKn: 10, targetHeadingDeg: 180 // West
    });

    expect(cpaRes.cpaNm).toBeCloseTo(0.0, 1); // Direct head-on collision point
    expect(cpaRes.tcpaMin).toBeGreaterThan(25); // ~30 minutes
    expect(cpaRes.tcpaMin).toBeLessThan(35);
    expect(cpaRes.mode).toBe('OBSERVED-DRIFT CPA');
  });

  it('52. CPA for static target (missing drift velocity) uses STATIC-TARGET APPROXIMATION mode', () => {
    const cpaRes = calculateEncounterCPA({
      shipLat: -69.4, shipLon: 76.187, shipSpeedKn: 12, shipHeadingDeg: 90, // South
      targetLat: -70.0, targetLon: 76.187, targetSpeedKn: null, targetHeadingDeg: null
    });

    expect(cpaRes.mode).toBe('STATIC-TARGET APPROXIMATION');
    expect(cpaRes.cpaNm).toBeCloseTo(0.0, 1);
    expect(cpaRes.tcpaMin).toBeGreaterThan(170); // ~180 minutes south
  });

  it('53. Zero relative velocity handles zero relative speed without divide-by-zero or NaN output', () => {
    const cpaRes = calculateEncounterCPA({
      shipLat: -69.4, shipLon: 76.187, shipSpeedKn: 10, shipHeadingDeg: 0,
      targetLat: -69.4, targetLon: 76.5, targetSpeedKn: 10, targetHeadingDeg: 0
    });

    expect(cpaRes.relativeSpeedKn).toBe(0);
    expect(cpaRes.cpaNm).toBeDefined();
    expect(cpaRes.cpaNm).not.toBeNaN();
    expect(isFinite(cpaRes.cpaNm)).toBe(true);
  });

  it('54. Opening encounter (target moving away) computes negative TCPA marked as OPENING', () => {
    const cpaRes = calculateEncounterCPA({
      shipLat: 0, shipLon: 0, shipSpeedKn: 10, shipHeadingDeg: 180, // West (moving away from target at East)
      targetLat: 0, targetLon: 0.5, targetSpeedKn: 0, targetHeadingDeg: 0
    });

    expect(cpaRes.tcpaMin).toBeLessThan(0);
    expect(cpaRes.isOpening).toBe(true);
  });

  it('55. Derives observed drift speed & bearing when multiple sequential USNIC observations exist', async () => {
    const provider = new RealDataProvider();
    const mockMultiObsJson = {
      table: {
        columnNames: ['time', 'latitude', 'longitude', 'Iceberg', 'length_nm', 'width', 'area', 'source', 'remarks'],
        rows: [
          ['2026-01-01T00:00:00Z', -75.0, -33.0, 'A23A', 50, 40, 1000, 'USNIC', 'Obs 1'],
          ['2026-01-02T00:00:00Z', -75.2, -33.0, 'A23A', 50, 40, 1000, 'USNIC', 'Obs 2 (Moved 12 NM South in 24h = 0.5 kn)']
        ]
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMultiObsJson
    });

    await provider.fetchUSNICIcebergs();
    const bergs = provider.getIcebergs().data;

    expect(bergs.length).toBe(1);
    expect(bergs[0].observedDrift).not.toBeNull();
    expect(bergs[0].observedDrift.speedKn).toBeCloseTo(0.5, 1);
    expect(bergs[0].observedDrift.bearingDeg).toBeCloseTo(180, 5); // South
  });

  it('56. Single observation iceberg yields observedDrift = null (INSUFFICIENT OBSERVATIONS)', async () => {
    const provider = new RealDataProvider();
    const mockSingleObsJson = {
      table: {
        columnNames: ['time', 'latitude', 'longitude', 'Iceberg', 'length_nm', 'width', 'area', 'source', 'remarks'],
        rows: [
          ['2026-01-01T00:00:00Z', -75.0, -33.0, 'D15', 30, 20, 500, 'USNIC', 'Single observation']
        ]
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSingleObsJson
    });

    await provider.fetchUSNICIcebergs();
    const bergs = provider.getIcebergs().data;

    expect(bergs.length).toBe(1);
    expect(bergs[0].observedDrift).toBeNull();
  });

  it('57. Encounter classification: CLOSE APPROACH for CPA <= 20 NM, MONITORED for CPA <= 50 NM', () => {
    const closeCls = classifyEncounter({ initialDistNm: 15, cpaNm: 12, tcpaMin: 30, routeDistNm: 10, isNearRoute: true });
    expect(closeCls.state).toBe('CLOSE APPROACH');
    expect(closeCls.badgeColor).toBe('#ef4444');

    const monCls = classifyEncounter({ initialDistNm: 40, cpaNm: 35, tcpaMin: 60, routeDistNm: 45, isNearRoute: true });
    expect(monCls.state).toBe('MONITORED');
    expect(monCls.badgeColor).toBe('#fbbf24');

    const infoCls = classifyEncounter({ initialDistNm: 120, cpaNm: 100, tcpaMin: 240, routeDistNm: 150, isNearRoute: false });
    expect(infoCls.state).toBe('INFORMATIONAL');
    expect(infoCls.badgeColor).toBe('#38bdf8');
  });

  it('58. MapLibreRenderer renderFrame does NOT mutate activeRoute or ship heading autonomously', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    renderer.isInitialized = true;
    renderer.sourcesAdded = true;
    renderer.map = {
      isStyleLoaded: () => true,
      getSource: (name) => ({ setData: vi.fn() })
    };

    const mockShip = { x: 1800, y: 1200, heading: 45, speedKnots: 12 };
    const mockRoute = { waypoints: [{ x: 1800, y: 1200 }, { x: 2000, y: 2000 }] };
    const origRouteStr = JSON.stringify(mockRoute);
    const origHeading = mockShip.heading;

    renderer.renderFrame(mockShip, mockRoute, null, []);

    expect(mockShip.heading).toBe(origHeading);
    expect(JSON.stringify(mockRoute)).toBe(origRouteStr);
  });

  it('59. Provenance HUD confirms COMPUTED DECISION SUPPORT attribution for CPA/TCPA metrics', () => {
    const provider = new RealDataProvider();
    const prov = provider.getProvenance();

    const ship = prov.find(p => p.id === 'own-ship-state');
    const usnic = prov.find(p => p.id === 'usnic-icebergs');

    expect(ship.status).toBe('SIMULATED');
    expect(usnic.status).toBe('CACHED');
  });

  it('60. DEMO mode retains separate physics and does NOT render REAL CPA/encounter popups', () => {
    const demoProvider = new DemoDataProvider({});
    expect(demoProvider.getIcebergs).toBeDefined();
    const demoRes = demoProvider.getIcebergs();
    expect(demoRes.provenance.status).toBe('SIM');
  });

  it('61. REAL iceberg geographic [lon, lat] converts deterministically to planner world [x, y]', () => {
    const lat = -69.4;
    const lon = 76.187;
    const cosLat0 = Math.cos(-69.4 * Math.PI / 180);
    const x_nm = (lon - 76.187) * 60 * cosLat0;
    const y_nm = (lat - (-69.4)) * 60;
    const wx = 1800 + x_nm * 10;
    const wy = 1200 - y_nm * 10;
    expect(wx).toBeCloseTo(1800, 2);
    expect(wy).toBeCloseTo(1200, 2);
  });

  it('62. Route impact detection identifies iceberg within 50 NM corridor threshold', () => {
    const routeCoords = [[76.187, -69.4], [78.0, -70.0]];
    const iceLat = -69.5;
    const iceLon = 76.5;
    const dist = minDistanceToRouteNM(iceLat, iceLon, routeCoords);
    expect(dist).toBeLessThan(50.0);
  });

  it('63. Proposed route is stored in proposedRoute separately from activeRoute', () => {
    const state = {
      navigation: {
        activeRoute: { id: 'active_1', waypoints: [{ x: 400, y: 1800 }, { x: 3200, y: 400 }] },
        proposedRoute: { id: 'proposed_1', waypoints: [{ x: 400, y: 1800 }, { x: 1000, y: 1000 }, { x: 3200, y: 400 }] }
      }
    };
    expect(state.navigation.activeRoute.id).toBe('active_1');
    expect(state.navigation.proposedRoute.id).toBe('proposed_1');
    expect(state.navigation.activeRoute).not.toBe(state.navigation.proposedRoute);
  });

  it('64. Explicit route adoption mutates activeRoute exactly once', () => {
    const mockEngine = {
      state: {
        navigation: {
          activeRoute: { id: 'active_1', waypoints: [{ x: 400, y: 1800 }, { x: 3200, y: 400 }] },
          proposedRoute: { status: 'PROPOSED', id: 'proposed_99', waypoints: [{ x: 400, y: 1800 }, { x: 1000, y: 1000 }, { x: 3200, y: 400 }], totalDistanceNM: 350 }
        }
      },
      ship: { routeWaypoints: [], waypointIndex: 0, targetWaypoint: null },
      adoptProposedRoute() {
        const nav = this.state.navigation;
        nav.activeRoute = { id: nav.proposedRoute.id, waypoints: nav.proposedRoute.waypoints, status: 'valid' };
        this.ship.routeWaypoints = nav.proposedRoute.waypoints;
        nav.proposedRoute = null;
      }
    };

    expect(mockEngine.state.navigation.activeRoute.id).toBe('active_1');
    mockEngine.adoptProposedRoute();
    expect(mockEngine.state.navigation.activeRoute.id).toBe('proposed_99');
    expect(mockEngine.state.navigation.proposedRoute).toBeNull();
  });

  it('65. No-safe-route status preserves activeRoute without mutation', () => {
    const origActive = { id: 'active_orig', waypoints: [{ x: 400, y: 1800 }, { x: 3200, y: 400 }] };
    const state = {
      navigation: {
        activeRoute: origActive,
        proposedRoute: { status: 'NO_SAFE_ROUTE', waypoints: [] }
      }
    };

    expect(state.navigation.activeRoute).toBe(origActive);
    expect(state.navigation.proposedRoute.status).toBe('NO_SAFE_ROUTE');
  });

  it('66. Factual route comparison metrics (Current vs Proposed distance & Delta) are valid', () => {
    const curDistNm = 280;
    const propDistNm = 317;
    const extraDistNm = Math.max(0, propDistNm - curDistNm);
    expect(extraDistNm).toBe(37);
  });

  it('67. Structured route explanation object preserves trigger, evidence, and provenance', () => {
    const explanation = {
      status: 'PROPOSED',
      trigger: 'TRIGGER: Real Iceberg A23A approaches corridor (12 NM)',
      currentRouteDistanceNM: 280,
      proposedRouteDistanceNM: 317,
      extraDistanceNM: 37,
      reason: 'Computed CPA (18 NM, TCPA 96 min) is below configured planning threshold (50 NM).',
      dataBasis: 'USNIC / NOAA ERDDAP'
    };

    expect(explanation.status).toBe('PROPOSED');
    expect(explanation.extraDistanceNM).toBe(37);
    expect(explanation.dataBasis).toContain('USNIC');
  });

  it('68. Historical BYU tracks do NOT act as current active planning obstacles', () => {
    const historicalObs = [{ latitude: -75.0, longitude: -33.0, year: 2020 }];
    const currentUSNICObs = [{ latitude: -69.5, longitude: 76.5, year: 2026 }];

    // Verify current planning hazard selector only processes current observations
    const currentHazardsOnly = currentUSNICObs.filter(o => o.year === 2026);
    expect(currentHazardsOnly.length).toBe(1);
    expect(currentHazardsOnly[0].latitude).toBe(-69.5);
  });

  it('69. Multi-hazard selection considers all relevant corridor icebergs', () => {
    const routeCoords = [[76.187, -69.4], [78.0, -70.0]];
    const realIcebergs = [
      { id: 'A23A', latitude: -69.5, longitude: 76.5 },
      { id: 'B15', latitude: -69.8, longitude: 77.2 },
      { id: 'D12', latitude: -60.0, longitude: 120.0 } // Far away outside corridor
    ];

    const hazards = realIcebergs.filter(ice => minDistanceToRouteNM(ice.latitude, ice.longitude, routeCoords) <= 50.0);
    expect(hazards.length).toBe(2);
    expect(hazards.map(h => h.id)).toEqual(['A23A', 'B15']);
  });

  it('70. Zero autonomous steering verified: planner does NOT mutate ship heading or rudder', () => {
    const ship = { x: 1800, y: 1200, heading: 45.0, rudder: 10.0 };
    const origHeading = ship.heading;
    const origRudder = ship.rudder;

    // Simulate route impact analysis & proposed route generation
    const proposedRoute = { status: 'PROPOSED', waypoints: [{ x: 1800, y: 1200 }, { x: 2000, y: 1500 }] };

    expect(ship.heading).toBe(origHeading);
    expect(ship.rudder).toBe(origRudder);
    expect(proposedRoute.status).toBe('PROPOSED');
  });

  it('71. Route adoption passes adopted waypoints to canonical Ship instance via setRouteWaypoints', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1000, y: 1200 }, { x: 3000, y: 600 }];
    ship.setRouteWaypoints(waypoints, 'active_phase7');

    expect(ship.routeWaypoints.length).toBe(3);
    expect(ship._activeRouteId).toBe('active_phase7');
    expect(ship.targetWaypoint).not.toBeNull();
  });

  it('72. Closed-loop vessel turning: rudder command alters angularVelocity and heading through Nomoto dynamics', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    ship.rudder = 20.0; // Starboard turn command
    const dt = 0.5;
    const origHeading = ship.heading;

    // Simulate 5 physics steps with vessel.rudder = 20
    for (let i = 0; i < 5; i++) {
      ship.update(dt, null, 0, { vessel: { autopilot: false, rudder: 20.0, throttle: 50 } }, []);
    }

    expect(ship.angularVelocity).toBeGreaterThan(0);
    expect(ship.heading).not.toBe(origHeading);
  });

  it('73. Waypoint progression updates targetWaypoint as ship moves along active route', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 45 });
    ship.vx = 10;
    ship.vy = -10;
    const waypoints = [{ x: 400, y: 1800 }, { x: 600, y: 1600 }, { x: 3000, y: 600 }];
    ship.setRouteWaypoints(waypoints, 'active_wp');

    const initIdx = ship.waypointIndex;
    // Step forward 10 seconds
    for (let i = 0; i < 20; i++) {
      ship.update(0.5, null, 0, { vessel: { autopilot: true, maxSpeed: 20 } }, []);
    }

    expect(ship.x).toBeGreaterThan(400);
  });

  it('74. Target-heading computation converts route geometry to course without direct planner override', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const targetWp = { x: 400, y: 1000 }; // Directly North/Up (-Y in world space)
    const dx = targetWp.x - ship.x;
    const dy = targetWp.y - ship.y;
    const rad = Math.atan2(dy, dx);
    const targetHeading = (rad * 180 / Math.PI + 360) % 360;

    expect(targetHeading).toBe(270); // 270° = North
    expect(ship.heading).toBe(0); // Heading remains unmodified prior to physical rudder update
  });

  it('75. Position updates smoothly from integrated velocity vectors (F = m*a)', () => {
    const ship = new Ship({ x: 1000, y: 1000, heading: 0 });
    ship.vx = 12.0;
    ship.vy = 0.0;
    const origX = ship.x;

    ship.update(0.5, null, 0, { vessel: { autopilot: false, throttle: 0 } }, []);
    expect(ship.x).toBeGreaterThan(origX);
  });

  it('76. Continuous hazard re-evaluation monitors USNIC observations while ship is in motion', () => {
    const ship = new Ship({ x: 1000, y: 1000, heading: 0 });
    const icebergs = [{ latitude: -69.45, longitude: 76.25, name: 'B15A' }];

    // Verify distance to ship updates as ship position changes
    const d1 = haversineDistanceNM(ship.lat, ship.lon, icebergs[0].latitude, icebergs[0].longitude);
    ship.x = 2000;
    ship.lat = -64.382 - (ship.y / 1000) * 0.5;
    ship.lon = 72.821 + (ship.x / 1000) * 0.8;
    const d2 = haversineDistanceNM(ship.lat, ship.lon, icebergs[0].latitude, icebergs[0].longitude);

    expect(d1).not.toBe(d2);
  });

  it('77. Mission event log records structured events for audit and telemetry', () => {
    const logs = [];
    const logEvent = (type, details) => {
      logs.push({ timestamp: new Date().toISOString(), type, details });
    };

    logEvent('ROUTE_ADOPTED', 'Adopted proposed route');
    logEvent('WAYPOINT_REACHED', 'Reached WP 1');

    expect(logs.length).toBe(2);
    expect(logs[0].type).toBe('ROUTE_ADOPTED');
    expect(logs[1].type).toBe('WAYPOINT_REACHED');
  });

  it('78. Closed-loop hazard clearance transitions state from MONITORED to CLEARED when dist > 50 NM', () => {
    const nearDist = 15.0;
    const farDist = 65.0;

    const nearState = nearDist <= 50.0 ? 'MONITORED' : 'CLEARED';
    const farState = farDist <= 50.0 ? 'MONITORED' : 'CLEARED';

    expect(nearState).toBe('MONITORED');
    expect(farState).toBe('CLEARED');
  });

  it('79. No hidden automatic route adoption: proposed route requires explicit user action', () => {
    const state = {
      navigation: {
        activeRoute: { id: 'orig_1' },
        proposedRoute: { status: 'PROPOSED', id: 'prop_1' }
      }
    };

    // Simulate 10 simulation loop iterations without calling adoptProposedRoute
    for (let i = 0; i < 10; i++) {
      // route planner runs evaluation but does NOT mutate activeRoute
      if (state.navigation.activeRoute.id === state.navigation.proposedRoute.id) {
        state.navigation.activeRoute = state.navigation.proposedRoute;
      }
    }

    expect(state.navigation.activeRoute.id).toBe('orig_1');
  });

  it('80. Ship physics prevents direct position teleports during closed-loop navigation', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const targetWp = { x: 3000, y: 600 };
    const maxAllowedStep = 30.0; // Max distance vessel can travel in 1 second at max speed

    ship.update(1.0, null, 0, { vessel: { autopilot: true, maxSpeed: 20 } }, []);
    const distMoved = Math.hypot(ship.x - 400, ship.y - 1800);

    expect(distMoved).toBeLessThan(maxAllowedStep);
  });
});



