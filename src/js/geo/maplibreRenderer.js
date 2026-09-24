import * as maplibregl from 'maplibre-gl';
import maplibreglWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker';
import { inverseProjection, haversineDistanceNM, calculateInitialBearing, formatLatLon, minDistanceToRouteNM, calculateEncounterCPA, classifyEncounter } from './projection.js';
import { byuHistoricalProvider } from '../data/ByuHistoricalProvider.js';
import { provenanceRegistry } from '../dataSources.js';

if (typeof window !== 'undefined' && maplibregl) {
  try {
    Object.defineProperty(maplibregl, 'workerClass', { value: maplibreglWorker, writable: true, configurable: true });
  } catch (e) {}
}

/** Explicit visualization threshold for identifying icebergs near active route (Nautical Miles) */
export const ROUTE_PROXIMITY_THRESHOLD_NM = 50.0;

/** Defensive helper: validate that a coordinate is a valid 2-item numeric array [lon, lat] */
export function isValidCoord(coord) {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    typeof coord[0] === 'number' &&
    typeof coord[1] === 'number' &&
    !isNaN(coord[0]) &&
    !isNaN(coord[1]) &&
    isFinite(coord[0]) &&
    isFinite(coord[1])
  );
}

/** Defensive helper: validate maxBounds structure [[west, south], [east, north]] */
export function isValidBounds(bounds) {
  return (
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    isValidCoord(bounds[0]) &&
    isValidCoord(bounds[1])
  );
}

export class MapLibreRenderer {
  constructor(containerId = 'maplibre-container') {
    this.containerId = containerId;
    this.map = null;
    this.isInitialized = false;
    this.sourcesAdded = false;
    this.apiKey = null;
    this.hasKeyError = false;
    this.windowResizeHandler = null;
  }

  getApiKey() {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAPTILER_API_KEY) {
      const key = import.meta.env.VITE_MAPTILER_API_KEY.trim();
      if (key && key !== 'PUT_KEY_HERE') {
        return key;
      }
    }
    return null;
  }

  init() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const container = document.getElementById(this.containerId);
    if (!container) return;

    this.show();

    this.apiKey = this.getApiKey();

    if (!this.apiKey) {
      this.hasKeyError = true;
      this.renderConfigErrorState(container, 'MAP CONFIGURATION REQUIRED: Missing or invalid VITE_MAPTILER_API_KEY in .env.local');
      return;
    }

    // Force browser layout reflow so container clientWidth/clientHeight are updated
    void container.offsetWidth;

    // If container is not yet rendered with positive dimensions, defer init to next frame
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      requestAnimationFrame(() => this.init());
      return;
    }

    try {
      const mapStyle = `https://api.maptiler.com/maps/hybrid/style.json?key=${this.apiKey}`;

      const defaultCenter = [76.187, -69.4]; // Bharati Station approach, Antarctica
      const safeCenter = isValidCoord(defaultCenter) ? defaultCenter : [76.187, -69.4];

      // Do NOT pass maxBounds in constructor options (prevents 0x0 container bounds constraint failure during init).
      // maxBounds is safely applied via setMaxBounds() on map 'load'.
      this.map = new maplibregl.Map({
        container: this.containerId,
        style: mapStyle,
        center: safeCenter,
        zoom: 5,
        minZoom: 4.2,
        maxZoom: 18,
        pitch: 0,
        maxPitch: 0,
        bearing: 0,
        dragRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        attributionControl: true,
        trackResize: false
      });

      // Navigation controls
      this.map.addControl(new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: false
      }), 'top-right');

      this.map.addControl(new maplibregl.ScaleControl({
        maxWidth: 150,
        unit: 'nautical'
      }), 'bottom-left');

      // Manual window resize handler when container is active and visible
      this.windowResizeHandler = () => {
        const el = document.getElementById(this.containerId);
        if (this.map && el && !el.classList.contains('hidden') && el.clientWidth > 0 && el.clientHeight > 0) {
          try {
            this.map.resize();
          } catch (e) {
            console.warn('[MapLibreRenderer] Resize warning:', e);
          }
        }
      };
      window.addEventListener('resize', this.windowResizeHandler);

      // Viewport-aware Antarctic Camera Clamp
      const ALLOWED_BOUNDS = { west: -180, south: -90, east: 180, north: -45 };
      let isUpdatingBounds = false;

      this.updateDynamicMaxBounds = () => {
        if (!this.map || isUpdatingBounds) return;
        const container = document.getElementById(this.containerId);
        if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

        isUpdatingBounds = true;
        try {
          const center = this.map.getCenter();
          const w = container.clientWidth;
          const h = container.clientHeight;

          const topGeo = this.map.unproject([w / 2, 0]);
          const bottomGeo = this.map.unproject([w / 2, h]);
          const leftGeo = this.map.unproject([0, h / 2]);
          const rightGeo = this.map.unproject([w, h / 2]);

          if (topGeo && bottomGeo && leftGeo && rightGeo && center) {
            const latSpanUpper = Math.max(0, topGeo.lat - center.lat);
            const latSpanLower = Math.max(0, center.lat - bottomGeo.lat);
            const lonSpanLeft = Math.max(0, center.lng - leftGeo.lng);
            const lonSpanRight = Math.max(0, rightGeo.lng - center.lng);

            // Mercator projection minimum latitude limit is ~ -85.0511
            const maxCenterLat = ALLOWED_BOUNDS.north - latSpanUpper;
            const minCenterLat = Math.max(-85.0511, ALLOWED_BOUNDS.south + latSpanLower);

            let minCenterLng = ALLOWED_BOUNDS.west;
            let maxCenterLng = ALLOWED_BOUNDS.east;
            if (lonSpanLeft + lonSpanRight < 360) {
              minCenterLng = ALLOWED_BOUNDS.west + lonSpanLeft;
              maxCenterLng = ALLOWED_BOUNDS.east - lonSpanRight;
            }

            const finalMaxLat = Math.min(ALLOWED_BOUNDS.north, maxCenterLat);
            const finalMinLat = Math.min(finalMaxLat, minCenterLat);

            this.map.setMaxBounds([
              [minCenterLng, finalMinLat],
              [maxCenterLng, finalMaxLat]
            ]);

            const currentBounds = this.map.getBounds();
            if (currentBounds && currentBounds.getNorth() > ALLOWED_BOUNDS.north) {
              const clampedLat = Math.min(center.lat, finalMaxLat);
              this.map.jumpTo({ center: [center.lng, clampedLat] });
            }
          }
        } catch (e) {
          console.warn('[MapLibreRenderer] Error updating dynamic maxBounds:', e);
        } finally {
          isUpdatingBounds = false;
        }
      };

      this.enforceAntarcticBounds = () => {
        this.updateDynamicMaxBounds();
      };

      const onStyleReady = () => {
        if (!this.map || !this.map.isStyleLoaded()) return;
        this.isInitialized = true;
        if (!this.sourcesAdded) {
          this.addMapLayers();
        }
        const el = document.getElementById(this.containerId);
        if (this.map && el && el.clientWidth > 0 && el.clientHeight > 0) {
          try {
            this.map.resize();
          } catch (e) {}
        }
        this.updateDynamicMaxBounds();
        if (this.lastRenderArgs && Array.isArray(this.lastRenderArgs)) {
          this.renderFrame(...this.lastRenderArgs);
        }
      };

      this.map.on('load', onStyleReady);
      this.map.on('styledata', onStyleReady);

      this.map.on('zoom', () => {
        this.updateDynamicMaxBounds();
      });

      this.map.on('moveend', () => {
        this.updateDynamicMaxBounds();
      });

      this.map.on('error', (e) => {
        console.warn('[MapLibreRenderer] Map error event:', e);
        if (e && e.error && (e.error.status === 401 || e.error.status === 403)) {
          this.hasKeyError = true;
          this.renderConfigErrorState(container, 'MAP CONFIGURATION REQUIRED: Invalid MapTiler API Key (401/403 Unauthorized)');
        }
      });

    } catch (e) {
      console.error('[MapLibreRenderer] Map initialization failed:', e);
      this.hasKeyError = true;
      this.renderConfigErrorState(container, `MAP CONFIGURATION ERROR: ${e && e.message ? e.message : e}`);
    }
  }

  renderConfigErrorState(container, message) {
    if (!container) return;
    let errorEl = document.getElementById('map-config-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'map-config-error';
      errorEl.className = 'absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface/95 text-on-surface p-6 font-mono text-center space-y-4 border-2 border-rose-500/50 rounded-lg backdrop-blur-md';
      container.appendChild(errorEl);
    }
    const safeMsg = message || 'MAP CONFIGURATION REQUIRED';
    errorEl.innerHTML = `
      <div class="flex items-center space-x-2 text-rose-400 font-bold text-lg">
        <span class="material-symbols-outlined text-2xl">warning</span>
        <span>MAP CONFIGURATION REQUIRED</span>
      </div>
      <p class="text-xs text-on-surface-variant max-w-md leading-relaxed">${safeMsg}</p>
      <div class="bg-surface-container p-3 rounded text-[11px] text-secondary font-mono border border-outline/30 text-left w-full max-w-md">
        <div>1. Create file: <span class="text-primary font-bold">.env.local</span></div>
        <div>2. Add line: <span class="text-primary font-bold">VITE_MAPTILER_API_KEY=your_maptiler_key</span></div>
        <div>3. Restart dev server.</div>
      </div>
    `;
    if (errorEl.classList && typeof errorEl.classList.remove === 'function') {
      errorEl.classList.remove('hidden');
    }
  }

  addMapLayers() {
    if (!this.map || this.sourcesAdded) return;
    this.sourcesAdded = true;

    // 1. Coastline Layer fallback/supplement
    fetch('/data/geo/antarctica_coastline.geojson')
      .then(res => res.json())
      .then(geoJson => {
        if (!this.map || !this.map.isStyleLoaded()) return;
        if (!this.map.getSource('antarctica-coastline')) {
          this.map.addSource('antarctica-coastline', {
            type: 'geojson',
            data: geoJson
          });
          this.map.addLayer({
            id: 'coastline-line',
            type: 'line',
            source: 'antarctica-coastline',
            paint: {
              'line-color': '#38bdf8',
              'line-width': 1.5,
              'line-opacity': 0.7
            }
          });
        }
      })
      .catch(e => console.warn('[MapLibreRenderer] Coastline overlay fetch deferred:', e));

    // 2. Active Route Source & Layer
    this.map.addSource('active-route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    // Route Corridor Buffer Line
    this.map.addLayer({
      id: 'active-route-corridor',
      type: 'line',
      source: 'active-route',
      paint: {
        'line-color': 'rgba(56, 189, 248, 0.25)',
        'line-width': 18,
        'line-cap': 'round',
        'line-join': 'round'
      }
    });
    // Planned Navigation Route Line
    this.map.addLayer({
      id: 'active-route-line',
      type: 'line',
      source: 'active-route',
      paint: {
        'line-color': '#a4d64c',
        'line-width': 4,
        'line-dasharray': [2, 1]
      }
    });

    // 2b. Proposed Safe Alternative Route Source & Layers
    this.map.addSource('proposed-route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Proposed Route Corridor Highlight Halo (Orange/Gold glow)
    this.map.addLayer({
      id: 'proposed-route-corridor',
      type: 'line',
      source: 'proposed-route',
      paint: {
        'line-color': 'rgba(245, 158, 11, 0.25)',
        'line-width': 16,
        'line-cap': 'round',
        'line-join': 'round'
      }
    });

    // Proposed Route Line (Distinct Orange/Amber dashed line)
    this.map.addLayer({
      id: 'proposed-route-line',
      type: 'line',
      source: 'proposed-route',
      paint: {
        'line-color': '#f59e0b',
        'line-width': 4,
        'line-dasharray': [4, 2]
      }
    });

    // 3. Destination Source & Layer
    this.map.addSource('dest-point', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    this.map.addLayer({
      id: 'dest-point-circle',
      type: 'circle',
      source: 'dest-point',
      paint: {
        'circle-radius': 8,
        'circle-color': '#fcd34d',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });

    // 4. Icebergs Observations & Trajectories
    this.map.addSource('iceberg-points', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Icebergs NEAR ROUTE Highlight Halo
    this.map.addLayer({
      id: 'iceberg-points-near-halo',
      type: 'circle',
      source: 'iceberg-points',
      filter: ['==', ['get', 'isNearRoute'], true],
      paint: {
        'circle-radius': 14,
        'circle-color': 'rgba(245, 158, 11, 0.25)',
        'circle-stroke-color': '#f59e0b',
        'circle-stroke-width': 2
      }
    });

    // Standard Iceberg Circle Marker
    this.map.addLayer({
      id: 'iceberg-points-circle',
      type: 'circle',
      source: 'iceberg-points',
      paint: {
        'circle-radius': 7,
        'circle-color': [
          'case',
          ['==', ['get', 'isNearRoute'], true], '#fbbf24',
          '#38bdf8'
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });

    this.map.addSource('iceberg-trajectories', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    this.map.addLayer({
      id: 'iceberg-trajectories-line',
      type: 'line',
      source: 'iceberg-trajectories',
      paint: {
        'line-color': 'rgba(239, 68, 68, 0.8)',
        'line-width': 2,
        'line-dasharray': [3, 2]
      }
    });

    // 5. BYU Historical Iceberg Trajectory Layer
    this.map.addSource('byu-historical-track', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    this.map.addLayer({
      id: 'byu-historical-track-line',
      type: 'line',
      source: 'byu-historical-track',
      paint: {
        'line-color': '#f59e0b',
        'line-width': 3.5,
        'line-dasharray': [3, 2]
      }
    });

    // 6. BYU Historical Replay Position Marker
    this.map.addSource('byu-historical-replay-point', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    this.map.addLayer({
      id: 'byu-historical-replay-circle',
      type: 'circle',
      source: 'byu-historical-replay-point',
      paint: {
        'circle-radius': 8.5,
        'circle-color': '#fbbf24',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5
      }
    });

    // Add Iceberg Popup & Hover Interactions
    if (!this.icebergPopupAdded) {
      this.icebergPopupAdded = true;
      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false
      });

      this.map.on('click', 'iceberg-points-circle', async (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const p = feat.properties;
        const coords = feat.geometry.coordinates.slice();

        // Check if historical track exists for selected iceberg
        const track = await byuHistoricalProvider.getHistoricalTrack(p.name);
        this.selectedHistoricalTrack = track;

        let trackHtml = '<div style="color: #94a3b8; font-size: 10px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px;">HISTORICAL TRACK: UNAVAILABLE</div>';

        if (track && track.observations && track.observations.length > 0) {
          this.renderHistoricalTrack(track);
          provenanceRegistry.updateStatus('usnic-icebergs', 'CACHED', {
            note: `USNIC Operational + BYU/NIC Track (${track.observationCount} obs)`
          });

          trackHtml = `
            <div style="font-size: 10px; color: #f59e0b; font-weight: bold; margin-top: 4px; border-top: 1px solid rgba(245, 158, 11, 0.3); padding-top: 4px;">
              HISTORICAL TRACK: ACTIVE (${track.observationCount} obs)
            </div>
            <div style="font-size: 10px; color: #cbd5e1;">RANGE: <span style="font-weight: 600;">${track.startDate}</span> to <span style="font-weight: 600;">${track.endDate}</span></div>
            <div style="font-size: 9px; color: #94a3b8;">SOURCE: BYU/NIC Scatterometer (SCP)</div>
          `;
        } else {
          this.clearHistoricalTrack();
        }

        let shipRelHtml = '';
        if (this.currentShipLatLon && Array.isArray(this.currentShipLatLon) && this.currentShipLatLon.length >= 2) {
          const shipLon = this.currentShipLatLon[0];
          const shipLat = this.currentShipLatLon[1];
          const distNm = haversineDistanceNM(shipLat, shipLon, coords[1], coords[0]);
          const bearingDeg = calculateInitialBearing(shipLat, shipLon, coords[1], coords[0]);
          const formattedBearing = String(bearingDeg).padStart(3, '0');

          shipRelHtml = `
            <div style="font-size: 10px; color: #38bdf8; font-weight: bold; margin-top: 4px; border-top: 1px solid rgba(56, 189, 248, 0.2); padding-top: 4px;">
              FROM OWN SHIP: <span style="color: #f8fafc;">${distNm.toFixed(0)} NM</span> | Bearing <span style="color: #f8fafc;">${formattedBearing}°</span>
            </div>
          `;
        }

        let driftHtml = '<div style="font-size: 10px; color: #94a3b8; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px;">OBSERVED DRIFT: INSUFFICIENT OBSERVATIONS</div>';
        let tgtSpeed = null;
        let tgtHdg = null;

        if (p.driftSpeedKn !== undefined && p.driftSpeedKn !== null && !isNaN(p.driftSpeedKn)) {
          tgtSpeed = p.driftSpeedKn;
          tgtHdg = p.driftBearingDeg;
          driftHtml = `
            <div style="font-size: 10px; color: #38bdf8; font-weight: bold; margin-top: 4px; border-top: 1px solid rgba(56, 189, 248, 0.2); padding-top: 4px;">
              OBSERVED DRIFT: <span style="color: #f8fafc;">${tgtSpeed} kn @ ${String(tgtHdg).padStart(3, '0')}°</span>
            </div>
            <div style="font-size: 9px; color: #94a3b8;">DATA BASIS: ${p.driftObsCount || 2} USNIC Observations</div>
          `;
        }

        let encounterHtml = '';
        if (this.currentShipLatLon && Array.isArray(this.currentShipLatLon) && this.currentShipLatLon.length >= 2 && this.currentShip) {
          const shipLon = this.currentShipLatLon[0];
          const shipLat = this.currentShipLatLon[1];
          const shipSpeed = typeof this.currentShip.speedKnots === 'number' ? this.currentShip.speedKnots : 12.0;
          const shipHdg = typeof this.currentShip.heading === 'number' ? this.currentShip.heading : 0;

          const cpaRes = calculateEncounterCPA({
            shipLat, shipLon, shipSpeedKn: shipSpeed, shipHeadingDeg: shipHdg,
            targetLat: coords[1], targetLon: coords[0],
            targetSpeedKn: tgtSpeed, targetHeadingDeg: tgtHdg
          });

          const routeDistNm = this.currentRouteCoords && this.currentRouteCoords.length >= 2 ? minDistanceToRouteNM(coords[1], coords[0], this.currentRouteCoords) : Infinity;
          const isNearRoute = routeDistNm <= ROUTE_PROXIMITY_THRESHOLD_NM;

          const classification = classifyEncounter({
            initialDistNm: cpaRes.initialDistNm,
            cpaNm: cpaRes.cpaNm,
            tcpaMin: cpaRes.tcpaMin,
            routeDistNm,
            isNearRoute
          });

          const cpaText = cpaRes.cpaNm !== null ? `${cpaRes.cpaNm} NM` : 'UNAVAILABLE';
          const tcpaText = cpaRes.tcpaMin !== null ? (cpaRes.tcpaMin >= 0 ? `${cpaRes.tcpaMin} min` : `${Math.abs(cpaRes.tcpaMin)} min (OPENING)`) : 'UNAVAILABLE';

          encounterHtml = `
            <div style="font-size: 10px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                <span style="font-weight: bold; color: #f8fafc;">ENCOUNTER ANALYSIS</span>
                <span style="font-size: 9px; font-weight: bold; background: ${classification.badgeColor}33; color: ${classification.badgeColor}; border: 1px solid ${classification.badgeColor}66; padding: 1px 5px; border-radius: 3px;">${classification.state}</span>
              </div>
              <div>CPA: <span style="color: #f8fafc; font-weight: 600;">${cpaText}</span> | TCPA: <span style="color: #f8fafc; font-weight: 600;">${tcpaText}</span></div>
              <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">MODE: ${cpaRes.mode}</div>
              <div style="font-size: 9px; color: #cbd5e1; font-style: italic; margin-top: 2px; border-left: 2px solid ${classification.badgeColor}; padding-left: 4px;">${classification.reason}</div>
            </div>
          `;
        }

        const html = `
          <div style="font-family: monospace; font-size: 11px; padding: 6px; background: #0f172a; color: #f8fafc; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.4); max-width: 280px;">
            <div style="font-weight: bold; color: #38bdf8; border-bottom: 1px solid rgba(56, 189, 248, 0.2); padding-bottom: 3px; margin-bottom: 4px; display: flex; justify-content: space-between;">
              <span>ICEBERG: ${p.name || 'UNNAMED'}</span>
              <span style="font-size: 9px; background: rgba(56, 189, 248, 0.2); color: #7dd3fc; padding: 1px 4px; border-radius: 3px;">${p.source || 'USNIC'}</span>
            </div>
            <div>POSITION: <span style="color: #cbd5e1; font-weight: 600;">${p.latStr}°S, ${p.lonStr}°E</span></div>
            <div>OBSERVED: <span style="color: #cbd5e1; font-weight: 600;">${p.timestamp || 'N/A'}</span></div>
            <div>LENGTH: <span style="color: #cbd5e1; font-weight: 600;">${p.lengthNm}</span> | WIDTH: <span style="color: #cbd5e1; font-weight: 600;">${p.widthNm}</span></div>
            <div>AREA: <span style="color: #cbd5e1; font-weight: 600;">${p.areaSqNm}</span></div>
            ${p.remarks ? `<div style="font-size: 10px; color: #94a3b8; font-style: italic; margin-top: 3px;">${p.remarks}</div>` : ''}
            ${shipRelHtml}
            ${routeRelHtml}
            ${driftHtml}
            ${encounterHtml}
            ${trackHtml}
          </div>
        `;

        popup.setLngLat(coords).setHTML(html).addTo(this.map);
      });

      this.map.on('mouseenter', 'iceberg-points-circle', () => {
        if (this.map) this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', 'iceberg-points-circle', () => {
        if (this.map) this.map.getCanvas().style.cursor = '';
      });

      // Ship Marker Click Handler
      this.map.on('click', 'vessel-ship-circle', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const p = feat.properties;
        const coords = feat.geometry.coordinates.slice();

        const shipLatStr = coords[1].toFixed(4);
        const shipLonStr = coords[0].toFixed(4);
        const headingStr = typeof p.heading === 'number' ? `${p.heading.toFixed(1)}°` : '000.0°';
        const speedStr = typeof p.speed === 'number' ? `${p.speed.toFixed(1)} kn` : '0.0 kn';

        const html = `
          <div style="font-family: monospace; font-size: 11px; padding: 6px; background: #0f172a; color: #f8fafc; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.5); max-width: 240px;">
            <div style="font-weight: bold; color: #ef4444; border-bottom: 1px solid rgba(239, 68, 68, 0.2); padding-bottom: 3px; margin-bottom: 4px; display: flex; justify-content: space-between;">
              <span>OWN SHIP: ASTRALIS</span>
              <span style="font-size: 9px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 1px 4px; border-radius: 3px;">SIMULATED</span>
            </div>
            <div>POSITION: <span style="color: #cbd5e1; font-weight: 600;">${shipLatStr}°S, ${shipLonStr}°E</span></div>
            <div>HEADING: <span style="color: #cbd5e1; font-weight: 600;">${headingStr}</span> | SPEED: <span style="color: #cbd5e1; font-weight: 600;">${speedStr}</span></div>
            <div>MISSION: <span style="color: #cbd5e1; font-weight: 600;">ANTARCTIC RESEARCH</span></div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 3px; font-style: italic;">ASTRALIS MISSION VESSEL (SIMULATED)</div>
          </div>
        `;

        popup.setLngLat(coords).setHTML(html).addTo(this.map);
      });

      this.map.on('mouseenter', 'vessel-ship-circle', () => {
        if (this.map) this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', 'vessel-ship-circle', () => {
        if (this.map) this.map.getCanvas().style.cursor = '';
      });
    }

    // 5. Vessel / Ship Source & Layer
    this.map.addSource('vessel-ship', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    
    // Ship marker (outer ring)
    this.map.addLayer({
      id: 'vessel-ship-circle',
      type: 'circle',
      source: 'vessel-ship',
      paint: {
        'circle-radius': 10,
        'circle-color': '#ef4444',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5
      }
    });

    // Ship heading vector indicator line
    this.map.addSource('vessel-heading-vector', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    this.map.addLayer({
      id: 'vessel-heading-line',
      type: 'line',
      source: 'vessel-heading-vector',
      paint: {
        'line-color': '#ffffff',
        'line-width': 3
      }
    });
  }

  /** Convert POLARIS World Coordinates (3600x2400) to Lat/Lon safely */
  worldToLatLon(wx, wy) {
    if (typeof wx !== 'number' || typeof wy !== 'number' || isNaN(wx) || isNaN(wy) || !isFinite(wx) || !isFinite(wy)) {
      return null;
    }
    const x_nm = (wx - 1800) / 10;
    const y_nm = (1200 - wy) / 10;
    const proj = inverseProjection(x_nm, y_nm);
    if (!proj || typeof proj.lon !== 'number' || typeof proj.lat !== 'number' || isNaN(proj.lon) || isNaN(proj.lat)) {
      return null;
    }
    const coord = [proj.lon, proj.lat];
    return isValidCoord(coord) ? coord : null;
  }

  renderFrame(ship, activeRoute, destinationPoint, icebergs, proposedRoute = null) {
    this.lastRenderArgs = [ship, activeRoute, destinationPoint, icebergs, proposedRoute];
    if (!this.map || !this.isInitialized || !this.sourcesAdded || !this.map.isStyleLoaded()) return;

    // 1. Update Ship position & heading
    if (ship && typeof ship.x === 'number' && typeof ship.y === 'number' && !isNaN(ship.x) && !isNaN(ship.y)) {
      const shipLonLat = this.worldToLatLon(ship.x, ship.y);
      if (isValidCoord(shipLonLat)) {
        this.currentShip = ship;
        this.currentShipLatLon = shipLonLat;

        const hdg = typeof ship.heading === 'number' && !isNaN(ship.heading) ? ship.heading : 0;
        const spd = typeof ship.speedKnots === 'number' && !isNaN(ship.speedKnots) ? ship.speedKnots : 0;

        const shipSource = this.map.getSource('vessel-ship');
        if (shipSource) {
          shipSource.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: shipLonLat },
              properties: { name: 'ASTRALIS MISSION VESSEL', heading: hdg, speed: spd, status: 'SIMULATED', vesselName: 'ASTRALIS MISSION VESSEL (SIMULATED)' }
            }]
          });
        }

        const hdgRad = hdg * Math.PI / 180;
        const endLon = shipLonLat[0] + Math.cos(hdgRad) * 0.05;
        const endLat = shipLonLat[1] - Math.sin(hdgRad) * 0.05;
        const vecCoord = [endLon, endLat];

        if (isValidCoord(vecCoord)) {
          const vecSource = this.map.getSource('vessel-heading-vector');
          if (vecSource) {
            vecSource.setData({
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [shipLonLat, vecCoord] },
                properties: {}
              }]
            });
          }
        }
      }
    }

    // 2. Update Active Route & Corridor
    let validRouteCoords = [];
    if (activeRoute && Array.isArray(activeRoute.waypoints) && activeRoute.waypoints.length > 0) {
      for (const w of activeRoute.waypoints) {
        if (w && typeof w.x === 'number' && typeof w.y === 'number' && !isNaN(w.x) && !isNaN(w.y)) {
          const coord = this.worldToLatLon(w.x, w.y);
          if (isValidCoord(coord)) {
            validRouteCoords.push(coord);
          }
        }
      }

      this.currentRouteCoords = validRouteCoords;

      const routeSource = this.map.getSource('active-route');
      if (routeSource) {
        routeSource.setData({
          type: 'FeatureCollection',
          features: validRouteCoords.length >= 2 ? [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: validRouteCoords },
            properties: { name: 'PLANNED NAVIGATION ROUTE' }
          }] : []
        });
      }
    } else {
      this.currentRouteCoords = [];
      const routeSource = this.map.getSource('active-route');
      if (routeSource) {
        routeSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 2b. Update Proposed Alternative Route Line & Corridor
    let validProposedCoords = [];
    if (proposedRoute && Array.isArray(proposedRoute.waypoints) && proposedRoute.waypoints.length > 0) {
      for (const w of proposedRoute.waypoints) {
        if (w && typeof w.x === 'number' && typeof w.y === 'number' && !isNaN(w.x) && !isNaN(w.y)) {
          const coord = this.worldToLatLon(w.x, w.y);
          if (isValidCoord(coord)) {
            validProposedCoords.push(coord);
          }
        }
      }
      const propSource = this.map.getSource('proposed-route');
      if (propSource) {
        propSource.setData({
          type: 'FeatureCollection',
          features: validProposedCoords.length >= 2 ? [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: validProposedCoords },
            properties: { name: 'PROPOSED ALTERNATIVE ROUTE' }
          }] : []
        });
      }
    } else {
      const propSource = this.map.getSource('proposed-route');
      if (propSource) {
        propSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 3. Update Destination Point
    if (destinationPoint && typeof destinationPoint.x === 'number' && typeof destinationPoint.y === 'number' && !isNaN(destinationPoint.x) && !isNaN(destinationPoint.y)) {
      const destLonLat = this.worldToLatLon(destinationPoint.x, destinationPoint.y);
      const destSource = this.map.getSource('dest-point');
      if (destSource && isValidCoord(destLonLat)) {
        destSource.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: destLonLat },
            properties: { name: 'DESTINATION' }
          }]
        });
      }
    } else {
      const destSource = this.map.getSource('dest-point');
      if (destSource) {
        destSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 4. Update Icebergs & Trajectories (with Route Proximity Metrics)
    if (Array.isArray(icebergs) && icebergs.length > 0) {
      const icebergFeatures = [];
      const trajFeatures = [];

      for (const ice of icebergs) {
        if (!ice) continue;

        let iceLonLat = null;
        if (typeof ice.longitude === 'number' && typeof ice.latitude === 'number' && !isNaN(ice.longitude) && !isNaN(ice.latitude)) {
          iceLonLat = [ice.longitude, ice.latitude];
        } else if (typeof ice.lon === 'number' && typeof ice.lat === 'number' && !isNaN(ice.lon) && !isNaN(ice.lat)) {
          iceLonLat = [ice.lon, ice.lat];
        } else if (typeof ice.x === 'number' && typeof ice.y === 'number' && !isNaN(ice.x) && !isNaN(ice.y)) {
          iceLonLat = this.worldToLatLon(ice.x, ice.y);
        }

        if (!isValidCoord(iceLonLat)) continue;

        // Antarctic Filter (Step 6): latitude <= -45
        if (iceLonLat[1] > -45.0) continue;

        const name = ice.name || ice.Iceberg || ice.id || 'USNIC ICEBERG';
        const lengthNm = ice.lengthNm ?? ice.length_nm ?? null;
        const widthNm = ice.widthNm ?? ice.width ?? null;
        const areaSqNm = ice.areaSqNm ?? ice.area ?? null;

        // Geodesic route-to-iceberg proximity calculation
        let routeDistNm = Infinity;
        let isNearRoute = false;
        if (validRouteCoords.length >= 2) {
          routeDistNm = minDistanceToRouteNM(iceLonLat[1], iceLonLat[0], validRouteCoords);
          isNearRoute = routeDistNm <= ROUTE_PROXIMITY_THRESHOLD_NM;
        }

        const driftSpeedKn = ice.observedDrift ? ice.observedDrift.speedKn : null;
        const driftBearingDeg = ice.observedDrift ? ice.observedDrift.bearingDeg : null;
        const driftObsCount = ice.observedDrift ? ice.observedDrift.obsCount : 1;

        icebergFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: iceLonLat },
          properties: {
            id: ice.id || `USNIC_${name}`,
            name,
            timestamp: ice.timestamp || ice.snapshot_date || ice.time || '',
            lengthNm: lengthNm !== null ? `${lengthNm} NM` : 'N/A',
            widthNm: widthNm !== null ? `${widthNm} NM` : 'N/A',
            areaSqNm: areaSqNm !== null ? `${areaSqNm} sq NM` : 'N/A',
            source: ice.source || 'USNIC / NOAA ERDDAP',
            remarks: ice.remarks || ice.note || '',
            latStr: iceLonLat[1].toFixed(4),
            lonStr: iceLonLat[0].toFixed(4),
            routeDistNm: isFinite(routeDistNm) ? routeDistNm.toFixed(0) : null,
            isNearRoute,
            driftSpeedKn,
            driftBearingDeg,
            driftObsCount
          }
        });

        if (typeof ice.vx === 'number' && typeof ice.vy === 'number' && !isNaN(ice.vx) && !isNaN(ice.vy) && (ice.vx !== 0 || ice.vy !== 0)) {
          let futureLonLat = null;
          if (typeof ice.x === 'number' && typeof ice.y === 'number') {
            const futureX = ice.x + ice.vx * 3600 * 24;
            const futureY = ice.y + ice.vy * 3600 * 24;
            futureLonLat = this.worldToLatLon(futureX, futureY);
          } else {
            // Geographic velocity offset (approx)
            const futureLon = iceLonLat[0] + (ice.vx * 0.01);
            const futureLat = iceLonLat[1] + (ice.vy * 0.01);
            futureLonLat = [futureLon, futureLat];
          }
          if (isValidCoord(futureLonLat)) {
            trajFeatures.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [iceLonLat, futureLonLat] },
              properties: { id: ice.id }
            });
          }
        }
      }

      const iceSource = this.map.getSource('iceberg-points');
      if (iceSource) iceSource.setData({ type: 'FeatureCollection', features: icebergFeatures });

      const trajSource = this.map.getSource('iceberg-trajectories');
      if (trajSource) trajSource.setData({ type: 'FeatureCollection', features: trajFeatures });

      this.updateAwarenessHUD(icebergFeatures);
    } else {
      const iceSource = this.map.getSource('iceberg-points');
      if (iceSource) iceSource.setData({ type: 'FeatureCollection', features: [] });

      const trajSource = this.map.getSource('iceberg-trajectories');
      if (trajSource) trajSource.setData({ type: 'FeatureCollection', features: [] });

      this.updateAwarenessHUD([]);
    }
  }

  updateAwarenessHUD(icebergFeatures) {
    if (typeof document === 'undefined') return;
    const nearestEl = document.getElementById('real-nearest-iceberg-text');
    const nearRouteEl = document.getElementById('real-near-route-count-text');
    const activeEncEl = document.getElementById('real-active-encounters-count-text');
    if (!nearestEl || !nearRouteEl) return;

    if (!Array.isArray(icebergFeatures) || icebergFeatures.length === 0) {
      nearestEl.innerText = 'NO OBSERVATIONS';
      nearRouteEl.innerText = '0';
      if (activeEncEl) activeEncEl.innerText = '0';
      return;
    }

    let nearestName = 'NONE';
    let minShipDist = Infinity;
    let nearRouteCount = 0;
    let activeEncounterCount = 0;

    for (const feat of icebergFeatures) {
      const p = feat.properties;
      const coords = feat.geometry.coordinates;

      if (p.isNearRoute) {
        nearRouteCount++;
      }

      if (this.currentShipLatLon && Array.isArray(this.currentShipLatLon) && this.currentShipLatLon.length >= 2) {
        const d = haversineDistanceNM(this.currentShipLatLon[1], this.currentShipLatLon[0], coords[1], coords[0]);
        if (d < minShipDist) {
          minShipDist = d;
          nearestName = `${p.name} (${d.toFixed(0)} NM)`;
        }

        const routeDist = this.currentRouteCoords && this.currentRouteCoords.length >= 2 ? minDistanceToRouteNM(coords[1], coords[0], this.currentRouteCoords) : Infinity;
        const cls = classifyEncounter({
          initialDistNm: d,
          cpaNm: null,
          tcpaMin: null,
          routeDistNm: routeDist,
          isNearRoute: p.isNearRoute
        });

        if (cls.state !== 'INFORMATIONAL') {
          activeEncounterCount++;
        }
      }
    }

    nearestEl.innerText = nearestName;
    nearRouteEl.innerText = String(nearRouteCount);
    if (activeEncEl) activeEncEl.innerText = String(activeEncounterCount);
  }

  renderHistoricalTrack(track, replayDate = null) {
    if (!this.map || !this.isInitialized || !this.sourcesAdded || !this.map.isStyleLoaded()) return;
    if (!track || !Array.isArray(track.observations) || track.observations.length === 0) {
      this.clearHistoricalTrack();
      return;
    }

    const validCoords = [];
    for (const obs of track.observations) {
      if (typeof obs.longitude === 'number' && typeof obs.latitude === 'number' &&
          !isNaN(obs.longitude) && !isNaN(obs.latitude) && obs.latitude <= -45.0) {
        validCoords.push([obs.longitude, obs.latitude]);
      }
    }

    const trackSource = this.map.getSource('byu-historical-track');
    if (trackSource) {
      trackSource.setData({
        type: 'FeatureCollection',
        features: validCoords.length >= 2 ? [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: validCoords },
          properties: { id: track.icebergId, name: track.name }
        }] : []
      });
    }

    const replayState = byuHistoricalProvider.getReplayState(track, replayDate);
    const replaySource = this.map.getSource('byu-historical-replay-point');
    if (replaySource && replayState && replayState.currentObservation) {
      const currentObs = replayState.currentObservation;
      replaySource.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [currentObs.longitude, currentObs.latitude] },
          properties: {
            id: track.icebergId,
            name: track.name,
            date: currentObs.date,
            progress: replayState.progressPercent
          }
        }]
      });
    }
  }

  clearHistoricalTrack() {
    if (!this.map || !this.isInitialized || !this.sourcesAdded || !this.map.isStyleLoaded()) return;
    const trackSource = this.map.getSource('byu-historical-track');
    if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });

    const replaySource = this.map.getSource('byu-historical-replay-point');
    if (replaySource) replaySource.setData({ type: 'FeatureCollection', features: [] });
  }

  show() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(this.containerId);
    if (el) {
      el.classList.remove('hidden');
      if (this.map && el.clientWidth > 0 && el.clientHeight > 0) {
        try {
          this.map.resize();
        } catch (e) {}
      }
    }
  }

  hide() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(this.containerId);
    if (el) el.classList.add('hidden');
  }

  destroy() {
    if (this.windowResizeHandler) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', this.windowResizeHandler);
      }
      this.windowResizeHandler = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.isInitialized = false;
    }
  }
}
