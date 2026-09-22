/**
 * POLARIS Map Provider Abstraction Layer
 * Handles rendering geographic basemaps & polar grids for DEMO vs REAL data modes.
 */

import { worldToGeo, geoToWorld, DEFAULT_ANTARCTIC_BBOX } from './geoTransform.js';

export class MapProvider {
  constructor(name = 'BASE_MAP') {
    this.name = name;
  }

  render(ctx, renderer, vectorField) {
    throw new Error('render method must be implemented by subclass');
  }
}

export class DemoMapProvider extends MapProvider {
  constructor() {
    super('DEMO_MAP');
  }

  render(ctx, renderer, vectorField) {
    if (!renderer) return;
    try {
      renderer.drawBackgroundGrid(ctx, vectorField);
    } catch (e) {
      console.warn('[DemoMapProvider] drawBackgroundGrid warning:', e);
    }
  }
}

export class RealMapProvider extends MapProvider {
  constructor(bbox = DEFAULT_ANTARCTIC_BBOX) {
    super('REAL_GEOGRAPHIC_MAP');
    this.bbox = bbox;

    // Define Antarctic Peninsula & Weddell Sea Coastline / Ice Shelf GeoJSON-style polygons in lat/lon
    this.coastlinesGeo = [
      // Antarctic Peninsula / Graham Land
      [
        { lat: -63.0, lon: -57.0 },
        { lat: -64.2, lon: -56.8 },
        { lat: -65.5, lon: -64.0 },
        { lat: -67.2, lon: -67.5 },
        { lat: -69.0, lon: -68.0 },
        { lat: -71.5, lon: -68.5 },
        { lat: -73.0, lon: -63.0 },
        { lat: -75.0, lon: -60.0 },
        { lat: -77.5, lon: -50.0 },
        { lat: -78.0, lon: -35.0 },
        { lat: -60.0, lon: -35.0 },
        { lat: -60.0, lon: -75.0 },
        { lat: -63.0, lon: -57.0 }
      ],
      // Ronne Ice Shelf Edge
      [
        { lat: -75.0, lon: -60.0 },
        { lat: -76.5, lon: -55.0 },
        { lat: -77.8, lon: -48.0 },
        { lat: -78.0, lon: -40.0 }
      ]
    ];

    // Bathymetry depth contours (lat, lon paths)
    this.bathymetryContoursGeo = [
      // 500m Shelf Break Contour
      [
        { lat: -62.0, lon: -75.0 },
        { lat: -63.5, lon: -65.0 },
        { lat: -65.0, lon: -58.0 },
        { lat: -68.0, lon: -52.0 },
        { lat: -72.0, lon: -44.0 },
        { lat: -76.0, lon: -36.0 }
      ],
      // 2000m Abyssal Slope Contour
      [
        { lat: -61.0, lon: -75.0 },
        { lat: -62.5, lon: -62.0 },
        { lat: -64.0, lon: -52.0 },
        { lat: -66.5, lon: -42.0 },
        { lat: -70.0, lon: -35.0 }
      ]
    ];
  }

  render(ctx, renderer, vectorField) {
    if (!ctx || !renderer) return;

    ctx.save();

    // 1. Render Geographic Ocean Base Fill (Deep Southern Ocean Indigo/Navy)
    ctx.fillStyle = '#0a1324';
    ctx.fillRect(0, 0, renderer.worldWidth, renderer.worldHeight);

    // 2. Render Bathymetry Depth Zones (Shallow Shelf vs Abyssal Basin)
    this.renderBathymetry(ctx);

    // 3. Render Geographic Graticule (Latitude/Longitude Grid Lines & Labels)
    this.renderGraticule(ctx);

    // 4. Render Antarctic Coastlines & Ice Shelf Polygons
    this.renderCoastlines(ctx);

    // 5. Render Geographic Compass Rose & Scale Bar
    this.renderGeoScaleBar(ctx);

    ctx.restore();
  }

  renderBathymetry(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 64, 110, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);

    for (let pathGeo of this.bathymetryContoursGeo) {
      ctx.beginPath();
      let first = true;
      for (let pt of pathGeo) {
        const w = geoToWorld(pt.lat, pt.lon, this.bbox);
        if (first) {
          ctx.moveTo(w.x, w.y);
          first = false;
        } else {
          ctx.lineTo(w.x, w.y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  renderCoastlines(ctx) {
    ctx.save();
    // Fill Landmass with Soft Polar Slate/Grey
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;

    for (let polyGeo of this.coastlinesGeo) {
      ctx.beginPath();
      let first = true;
      for (let pt of polyGeo) {
        const w = geoToWorld(pt.lat, pt.lon, this.bbox);
        if (first) {
          ctx.moveTo(w.x, w.y);
          first = false;
        } else {
          ctx.lineTo(w.x, w.y);
        }
      }
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  renderGraticule(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 1.0;
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';

    // Latitude parallels: -60, -65, -70, -75 degrees South
    for (let lat = -60; lat >= -75; lat -= 5) {
      const p1 = geoToWorld(lat, this.bbox.lonMin, this.bbox);
      const p2 = geoToWorld(lat, this.bbox.lonMax, this.bbox);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.fillText(`${Math.abs(lat)}°S`, 15, p1.y - 4);
    }

    // Longitude meridians: -75, -65, -55, -45, -35 degrees West
    for (let lon = -75; lon <= -35; lon += 10) {
      const p1 = geoToWorld(this.bbox.latMax, lon, this.bbox);
      const p2 = geoToWorld(this.bbox.latMin, lon, this.bbox);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.fillText(`${Math.abs(lon)}°W`, p1.x + 4, 25);
    }

    ctx.restore();
  }

  renderGeoScaleBar(ctx) {
    ctx.save();
    // Render Scale Indicator in lower-left of world map
    const sx = 100;
    const sy = this.bbox.worldHeight - 80;
    const barLengthPixels = 300; // ~100 Nautical Miles in projected units

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + barLengthPixels, sy);
    ctx.moveTo(sx, sy - 6);
    ctx.lineTo(sx, sy + 6);
    ctx.moveTo(sx + barLengthPixels, sy - 6);
    ctx.lineTo(sx + barLengthPixels, sy + 6);
    ctx.stroke();

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('SCALE: 100 NM (Geographic Southern Ocean)', sx, sy - 10);
    ctx.restore();
  }
}
