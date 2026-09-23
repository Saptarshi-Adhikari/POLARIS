/**
 * POLARIS Antarctic Canvas Basemap Renderer
 */

import { forwardProjection, formatLatLon, REFERENCE_ORIGIN } from './projection.js';

export class BasemapRenderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.coastlineGeoJson = null;
    this.stations = [];
    this.isLoaded = false;
  }

  async loadAssets() {
    try {
      const [coastRes, statRes] = await Promise.all([
        fetch('/data/geo/antarctica_coastline.geojson').catch(() => null),
        fetch('/data/geo/stations.json').catch(() => null)
      ]);

      if (coastRes && coastRes.ok) {
        this.coastlineGeoJson = await coastRes.json();
      }
      if (statRes && statRes.ok) {
        this.stations = await statRes.json();
      }
      this.isLoaded = true;
    } catch (e) {
      console.warn('[BasemapRenderer] Asset loading warning, using fallback rendering:', e);
      this.isLoaded = true;
    }
  }

  render(ctx, isRealMode = false) {
    if (!isRealMode) return; // DEMO mode uses standard synthetic grid

    ctx.save();

    // 1. Stylized Bathymetry Bands (Deepening Navy Backgrounds)
    this.drawBathymetryBands(ctx);

    // 2. Graticule Grid (5-degree latitude/longitude lines)
    this.drawGraticule(ctx);

    // 3. Coastline GeoJSON (Pale Ice-Blue Stroke / Dark Slate Fill)
    this.drawCoastline(ctx);

    // 4. Research Stations & Landmarks (Bharati, Maitri, Cape Town)
    this.drawStations(ctx);

    // 5. Maritime Scale Bar (NM) & Compass Rose
    this.drawScaleBar(ctx);

    ctx.restore();
  }

  drawBathymetryBands(ctx) {
    // Render 3-4 depth bands in deepening navy
    ctx.fillStyle = '#050c1e'; // Deep ocean background
    ctx.fillRect(0, 0, 3600, 2400);

    ctx.fillStyle = 'rgba(12, 28, 58, 0.4)'; // Shelf bathymetry band 1
    ctx.beginPath();
    ctx.arc(1800, 1200, 1400, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(20, 42, 82, 0.3)'; // Coastal bathymetry band 2
    ctx.beginPath();
    ctx.arc(1800, 1200, 800, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGraticule(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)'; // Dim teal degree lines
    ctx.lineWidth = Math.max(1, 1 / (this.camera ? this.camera.zoom : 1));
    ctx.font = '10px "JetBrains Mono"';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';

    // Draw 5-degree graticule lines
    for (let lon = 65; lon <= 85; lon += 5) {
      const proj = forwardProjection(-69.4, lon);
      const worldX = 1800 + proj.x_nm * 10; // Scale 1 NM = 10 SU
      ctx.beginPath();
      ctx.moveTo(worldX, 0);
      ctx.lineTo(worldX, 2400);
      ctx.stroke();
      ctx.fillText(`${lon}°E`, worldX + 4, 30);
    }

    for (let lat = -75; lat <= -60; lat += 5) {
      const proj = forwardProjection(lat, 76.187);
      const worldY = 1200 - proj.y_nm * 10;
      ctx.beginPath();
      ctx.moveTo(0, worldY);
      ctx.lineTo(3600, worldY);
      ctx.stroke();
      ctx.fillText(`${Math.abs(lat)}°S`, 30, worldY - 4);
    }
    ctx.restore();
  }

  drawCoastline(ctx) {
    ctx.save();
    ctx.strokeStyle = '#93c5fd'; // Pale ice-blue stroke
    ctx.fillStyle = '#1e293b';   // Dark slate land fill
    ctx.lineWidth = Math.max(1.5, 2 / (this.camera ? this.camera.zoom : 1));

    if (this.coastlineGeoJson && this.coastlineGeoJson.features) {
      for (const feature of this.coastlineGeoJson.features) {
        if (!feature.geometry) continue;
        const type = feature.geometry.type;
        const coordsList = type === 'Polygon' ? [feature.geometry.coordinates[0]] : feature.geometry.coordinates;

        for (const coords of coordsList) {
          ctx.beginPath();
          let first = true;
          for (const [lon, lat] of coords) {
            const proj = forwardProjection(lat, lon);
            const wx = 1800 + proj.x_nm * 10;
            const wy = 1200 - proj.y_nm * 10;
            if (first) { ctx.moveTo(wx, wy); first = false; }
            else { ctx.lineTo(wx, wy); }
          }
          if (type === 'Polygon') {
            ctx.closePath();
            ctx.fill();
          }
          ctx.stroke();
        }
      }
    } else {
      // Offline / bundled fallback coastline drawing
      ctx.beginPath();
      ctx.moveTo(1000, 1800);
      ctx.lineTo(1400, 1600);
      ctx.lineTo(1800, 1700);
      ctx.lineTo(2200, 1550);
      ctx.lineTo(2600, 1750);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStations(ctx) {
    const stationsList = this.stations.length > 0 ? this.stations : [
      { name: 'Bharati Station (India)', lat: -69.407, lon: 76.187, code: 'BHR' },
      { name: 'Maitri Station (India)', lat: -70.767, lon: 11.732, code: 'MTR' },
      { name: 'Cape Town Port (South Africa)', lat: -33.900, lon: 18.420, code: 'CPT' }
    ];

    ctx.save();
    for (const stat of stationsList) {
      const proj = forwardProjection(stat.lat, stat.lon);
      const wx = 1800 + proj.x_nm * 10;
      const wy = 1200 - proj.y_nm * 10;

      // Draw Station Marker (Gold Diamond / Dot)
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.arc(wx, wy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Station Text Label
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 11px "JetBrains Mono"';
      ctx.fillText(`📍 ${stat.name}`, wx + 10, wy + 4);
    }
    ctx.restore();
  }

  drawScaleBar(ctx) {
    ctx.save();
    // Position scale bar bottom-left
    const barX = 60;
    const barY = 2320;
    const nmLength = 20; // 20 NM scale
    const pixelWidth = nmLength * 10;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + pixelWidth, barY);
    ctx.moveTo(barX, barY - 5); ctx.lineTo(barX, barY + 5);
    ctx.moveTo(barX + pixelWidth, barY - 5); ctx.lineTo(barX + pixelWidth, barY + 5);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px "JetBrains Mono"';
    ctx.fillText(`${nmLength} NM (Nautical Miles)`, barX + pixelWidth / 2 - 50, barY - 8);
    ctx.restore();
  }
}
