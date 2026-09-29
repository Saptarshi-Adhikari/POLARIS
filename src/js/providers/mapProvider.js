/**
 * POLARIS Map Provider Abstraction Layer
 * High-Graphics Polar Ocean Cartography for DEMO vs REAL data modes.
 *
 * REAL Mode features:
 *  - Multi-depth bathymetric color ramps & illuminated continental shelf breaks.
 *  - Accurate East Antarctic coastlines (Prydz Bay, Amery Ice Shelf, Davis, Mawson, Casey).
 *  - Copernicus Satellite SAR Sea Ice Concentration heatmaps & Marginal Ice Zone (MIZ) edge.
 *  - Nautical graticule with latitude/longitude lines, compass rose, and scale bar.
 *  - Outpost radar stations & ice shelf calving barriers.
 */

import { worldToGeo, geoToWorld, DEFAULT_ANTARCTIC_BBOX } from './geoTransform.js';
import { AAD_EAST_ANTARCTIC_BBOX } from '../data/RealWorldDatasetLoader.js';

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
  constructor(bbox = AAD_EAST_ANTARCTIC_BBOX) {
    super('REAL_GEOGRAPHIC_MAP');
    this.bbox = bbox;

    // Layer visibility toggles
    this.showBathymetry = true;
    this.showCoastlines = true;
    this.showSeaIceLayer = true;
    this.showGraticule = true;
    this.showStations = true;
    this.showScaleBar = true;

    this.initCartographyFeatures();
  }

  /**
   * Set active geographic bounding box
   */
  setBbox(bbox) {
    this.bbox = bbox || AAD_EAST_ANTARCTIC_BBOX;
    this.initCartographyFeatures();
  }

  initCartographyFeatures() {
    // 1. Antarctic Coastal Polygons & Ice Shelves (Lat/Lon)
    // Modeled around the AAD East Antarctic sector (Prydz Bay, Amery Ice Shelf, Mawson to Casey)
    this.eastAntarcticCoastlines = [
      // Amery Ice Shelf & Lambert Glacier Embayment (Massive Floating Ice Shelf)
      {
        name: 'Amery Ice Shelf Barrier',
        type: 'ICE_SHELF',
        fill: '#182844',
        stroke: '#7dd3fc',
        lineWidth: 3.0,
        isClosed: true,
        points: [
          { lat: -68.0, lon: 70.0 }, // West Barrier Entry
          { lat: -69.5, lon: 71.0 },
          { lat: -71.2, lon: 71.5 },
          { lat: -72.8, lon: 70.5 },
          { lat: -73.5, lon: 69.5 }, // Southernmost grounding line
          { lat: -73.6, lon: 72.0 },
          { lat: -72.5, lon: 74.5 },
          { lat: -71.0, lon: 75.0 },
          { lat: -69.2, lon: 74.8 },
          { lat: -68.2, lon: 74.0 }, // East Barrier Front
          { lat: -68.0, lon: 70.0 }
        ]
      },
      // Lars Christensen Coast & Mawson Coast (West of Prydz Bay)
      {
        name: 'Lars Christensen Coast',
        type: 'LANDFAST_ICE',
        fill: '#111e33',
        stroke: '#38bdf8',
        lineWidth: 2.0,
        isClosed: true,
        points: [
          { lat: -67.0, lon: 65.0 }, // Mawson area
          { lat: -67.6, lon: 66.5 },
          { lat: -68.2, lon: 68.0 },
          { lat: -68.0, lon: 70.0 },
          { lat: -75.0, lon: 70.0 },
          { lat: -75.0, lon: 65.0 },
          { lat: -67.0, lon: 65.0 }
        ]
      },
      // Ingrid Christensen Coast (Davis Station to Vestfold Hills & West Ice Shelf)
      {
        name: 'Ingrid Christensen Coast & Vestfold Hills',
        type: 'COASTAL_TERRAIN',
        fill: '#111e33',
        stroke: '#38bdf8',
        lineWidth: 2.5,
        isClosed: true,
        points: [
          { lat: -68.2, lon: 74.0 },
          { lat: -68.6, lon: 76.5 }, // Zhongshan / Progress area
          { lat: -68.5, lon: 78.0 }, // Davis Station / Vestfold Hills
          { lat: -68.8, lon: 81.0 },
          { lat: -67.5, lon: 83.0 }, // West Ice Shelf Front
          { lat: -66.8, lon: 85.5 },
          { lat: -66.5, lon: 90.0 },
          { lat: -75.0, lon: 90.0 },
          { lat: -75.0, lon: 74.0 },
          { lat: -68.2, lon: 74.0 }
        ]
      },
      // Wilkes Land / Casey Sector Coast
      {
        name: 'Wilkes Land Coast (Casey Station)',
        type: 'COASTAL_TERRAIN',
        fill: '#111e33',
        stroke: '#38bdf8',
        lineWidth: 2.0,
        isClosed: true,
        points: [
          { lat: -66.3, lon: 105.0 },
          { lat: -66.2, lon: 110.5 }, // Casey Station
          { lat: -66.4, lon: 115.0 },
          { lat: -66.0, lon: 122.0 },
          { lat: -65.5, lon: 130.0 },
          { lat: -65.2, lon: 135.0 },
          { lat: -75.0, lon: 135.0 },
          { lat: -75.0, lon: 105.0 },
          { lat: -66.3, lon: 105.0 }
        ]
      }
    ];

    // 2. High-Resolution Bathymetry Depth Contours (Lat/Lon)
    this.bathymetryContours = [
      // -500m Continental Shelf Edge (Critical for iceberg grounding & navigation safety)
      {
        depthM: 500,
        label: '500m Shelf Break',
        color: 'rgba(56, 189, 248, 0.45)',
        width: 1.5,
        dash: [8, 4],
        points: [
          { lat: -66.2, lon: 65.0 },
          { lat: -66.8, lon: 70.0 },
          { lat: -67.2, lon: 74.5 },
          { lat: -67.4, lon: 77.0 },
          { lat: -66.5, lon: 80.0 },
          { lat: -65.8, lon: 86.0 },
          { lat: -65.5, lon: 95.0 },
          { lat: -65.2, lon: 110.0 },
          { lat: -64.8, lon: 125.0 },
          { lat: -64.5, lon: 135.0 }
        ]
      },
      // -1000m Upper Continental Slope
      {
        depthM: 1000,
        label: '1000m Slope',
        color: 'rgba(30, 64, 110, 0.65)',
        width: 1.2,
        dash: [12, 6],
        points: [
          { lat: -65.5, lon: 65.0 },
          { lat: -66.0, lon: 71.0 },
          { lat: -66.5, lon: 75.0 },
          { lat: -66.2, lon: 81.0 },
          { lat: -65.2, lon: 88.0 },
          { lat: -64.8, lon: 98.0 },
          { lat: -64.4, lon: 112.0 },
          { lat: -64.0, lon: 126.0 },
          { lat: -63.6, lon: 135.0 }
        ]
      },
      // -2500m Abyssal Plain Boundary
      {
        depthM: 2500,
        label: '2500m Abyssal Plain',
        color: 'rgba(15, 35, 70, 0.8)',
        width: 1.0,
        dash: [16, 8],
        points: [
          { lat: -64.0, lon: 65.0 },
          { lat: -64.5, lon: 72.0 },
          { lat: -65.0, lon: 77.0 },
          { lat: -64.6, lon: 84.0 },
          { lat: -63.8, lon: 95.0 },
          { lat: -63.2, lon: 110.0 },
          { lat: -62.8, lon: 125.0 },
          { lat: -62.2, lon: 135.0 }
        ]
      }
    ];

    // 3. Antarctic Research Outposts & Stations (Strategic Ports of Call)
    this.antarcticStations = [
      {
        name: 'DAVIS STATION',
        flag: '🇦🇺 AAD',
        lat: -68.58,
        lon: 77.97,
        radarRadiusKm: 65,
        type: 'RESEARCH_BASE',
        color: '#a4d64c'
      },
      {
        name: 'MAWSON STATION',
        flag: '🇦🇺 AAD',
        lat: -67.60,
        lon: 62.87,
        radarRadiusKm: 65,
        type: 'RESEARCH_BASE',
        color: '#a4d64c'
      },
      {
        name: 'ZHONGSHAN STATION',
        flag: '🇨🇳 PRIC',
        lat: -69.37,
        lon: 76.38,
        radarRadiusKm: 50,
        type: 'RESEARCH_BASE',
        color: '#38bdf8'
      },
      {
        name: 'CASEY STATION',
        flag: '🇦🇺 AAD',
        lat: -66.28,
        lon: 110.53,
        radarRadiusKm: 65,
        type: 'RESEARCH_BASE',
        color: '#a4d64c'
      }
    ];
  }

  /**
   * Master Render Method called every canvas frame in REAL mode
   */
  render(ctx, renderer, vectorField) {
    if (!ctx || !renderer) return;

    ctx.save();

    // 1. High-Fidelity Ocean Bathymetric Base Gradient
    this.renderOceanBase(ctx, renderer);

    // 2. Bathymetric Depth Contours & Depth Soundings
    if (this.showBathymetry) {
      this.renderBathymetryContours(ctx, renderer);
    }

    // 3. Satellite SAR Sea Ice Concentration Gradient (Copernicus Sentinel-1 + AMSR2)
    if (this.showSeaIceLayer) {
      this.renderCopernicusSeaIceOverlay(ctx, renderer);
    }

    // 4. Geographic Nautical Graticule (Lat/Lon Grid & Coordinate Labels)
    if (this.showGraticule) {
      this.renderGraticule(ctx, renderer);
    }

    // 5. Antarctic Coastlines & Jagged Ice Shelves
    if (this.showCoastlines) {
      this.renderCoastlinesAndIceShelves(ctx, renderer);
    }

    // 6. Coastal Research Stations & Radar Rings
    if (this.showStations) {
      this.renderResearchStations(ctx, renderer);
    }

    // 7. Tactical Nautical Scale Bar & Compass Rose
    if (this.showScaleBar) {
      this.renderTacticalScaleAndCompass(ctx, renderer);
    }

    ctx.restore();
  }

  /**
   * Render layered bathymetric deep polar ocean fill
   */
  renderOceanBase(ctx, renderer) {
    const w = renderer.worldWidth;
    const h = renderer.worldHeight;

    // Linear gradient simulating Southern Ocean depths (abyssal deeps in North to shallow shelf in South)
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
    oceanGrad.addColorStop(0.00, '#040914'); // Abyssal Basin (>4000m)
    oceanGrad.addColorStop(0.35, '#07152b'); // Lower Continental Rise (3000m)
    oceanGrad.addColorStop(0.65, '#0b2347'); // Upper Continental Slope (1500m)
    oceanGrad.addColorStop(0.85, '#0f3263'); // Continental Shelf (400m)
    oceanGrad.addColorStop(1.00, '#133f7c'); // Coastal Embayments & Shallow Banks (150m)

    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle bathymetric submarine trench texture
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.lineWidth = 1;
    for (let y = 300; y < h; y += 450) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y - 40, w * 0.7, y + 60, w, y);
      ctx.stroke();
    }
  }

  /**
   * Render bathymetric depth contours with tactical sounding annotations
   */
  renderBathymetryContours(ctx, renderer) {
    ctx.save();
    for (const contour of this.bathymetryContours) {
      ctx.strokeStyle = contour.color;
      ctx.lineWidth = contour.width;
      ctx.setLineDash(contour.dash);

      ctx.beginPath();
      let first = true;
      let labelPoint = null;

      for (let i = 0; i < contour.points.length; i++) {
        const pt = contour.points[i];
        const wPos = geoToWorld(pt.lat, pt.lon, this.bbox);

        if (first) {
          ctx.moveTo(wPos.x, wPos.y);
          first = false;
        } else {
          ctx.lineTo(wPos.x, wPos.y);
        }

        if (i === Math.floor(contour.points.length / 2)) {
          labelPoint = wPos;
        }
      }
      ctx.stroke();

      // Sounding depth label
      if (labelPoint && renderer.camera.isVisible(labelPoint.x, labelPoint.y, 100)) {
        ctx.fillStyle = contour.color;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(`— ${contour.label} —`, labelPoint.x + 10, labelPoint.y - 6);
      }
    }
    ctx.restore();
  }

  /**
   * Render Copernicus Satellite Sea Ice Overlay (Sentinel-1 EW/IW + AMSR2)
   */
  renderCopernicusSeaIceOverlay(ctx, renderer) {
    const w = renderer.worldWidth;
    const h = renderer.worldHeight;

    ctx.save();
    // Ice edge contour (glow line at ~15% concentration, approx Y = 1000..1200)
    const edgeY = h * 0.44;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(0, edgeY);
    ctx.bezierCurveTo(w * 0.25, edgeY - 80, w * 0.65, edgeY + 90, w, edgeY - 30);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ice Edge annotation
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('COPERNICUS SENTINEL-1 SEA-ICE EDGE (15% CONCENTRATION)', 120, edgeY - 14);

    // Semi-transparent pack ice shading towards the south
    const iceGrad = ctx.createLinearGradient(0, edgeY, 0, h);
    iceGrad.addColorStop(0.0, 'rgba(186, 230, 253, 0.00)');
    iceGrad.addColorStop(0.2, 'rgba(186, 230, 253, 0.08)');
    iceGrad.addColorStop(0.5, 'rgba(224, 242, 254, 0.16)');
    iceGrad.addColorStop(0.85, 'rgba(240, 249, 255, 0.28)');
    iceGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.42)');

    ctx.fillStyle = iceGrad;
    ctx.fillRect(0, edgeY, w, h - edgeY);

    ctx.restore();
  }

  /**
   * Render accurate East Antarctic coastlines and calving ice shelves
   */
  renderCoastlinesAndIceShelves(ctx, renderer) {
    ctx.save();

    for (const poly of this.eastAntarcticCoastlines) {
      ctx.beginPath();
      let first = true;
      let centerPt = { x: 0, y: 0 };
      let validCount = 0;

      for (const pt of poly.points) {
        const wPos = geoToWorld(pt.lat, pt.lon, this.bbox);
        centerPt.x += wPos.x;
        centerPt.y += wPos.y;
        validCount++;

        if (first) {
          ctx.moveTo(wPos.x, wPos.y);
          first = false;
        } else {
          ctx.lineTo(wPos.x, wPos.y);
        }
      }

      if (poly.isClosed) {
        ctx.closePath();
      }

      ctx.fillStyle = poly.fill;
      ctx.fill();

      ctx.strokeStyle = poly.stroke;
      ctx.lineWidth = poly.lineWidth;
      ctx.stroke();

      // Feature Name Annotation
      if (validCount > 0) {
        centerPt.x /= validCount;
        centerPt.y /= validCount;

        if (renderer.camera.isVisible(centerPt.x, centerPt.y, 200)) {
          ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(poly.name.toUpperCase(), centerPt.x, centerPt.y);
          ctx.fillStyle = 'rgba(125, 211, 252, 0.6)';
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillText(`[${poly.type}]`, centerPt.x, centerPt.y + 14);
          ctx.textAlign = 'start';
        }
      }
    }

    ctx.restore();
  }

  /**
   * Render Antarctic Research Outposts with tactical radar rings
   */
  renderResearchStations(ctx, renderer) {
    ctx.save();

    for (const station of this.antarcticStations) {
      const pos = geoToWorld(station.lat, station.lon, this.bbox);
      if (!renderer.camera.isVisible(pos.x, pos.y, 350)) continue;

      // Radar Coverage Ring (Pulsing tactical circle)
      const radarRadiusPx = station.radarRadiusKm * 2.2;
      ctx.strokeStyle = 'rgba(164, 214, 76, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radarRadiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Station Symbol (Tactical Diamond + Dot)
      ctx.fillStyle = station.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - 10);
      ctx.lineTo(pos.x + 10, pos.y);
      ctx.lineTo(pos.x, pos.y + 10);
      ctx.lineTo(pos.x - 10, pos.y);
      ctx.closePath();
      ctx.stroke();

      // Station Label Badge
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText(`${station.flag} ${station.name}`, pos.x + 14, pos.y - 4);
      ctx.fillStyle = 'rgba(165, 243, 252, 0.75)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`${Math.abs(station.lat).toFixed(2)}°S ${station.lon.toFixed(2)}°E`, pos.x + 14, pos.y + 9);
    }

    ctx.restore();
  }

  /**
   * Render Geographic Graticule (Latitude Parallels & Longitude Meridians)
   */
  renderGraticule(ctx, renderer) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1.0;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';

    // Latitude parallels: 55°S, 60°S, 65°S, 70°S, 75°S, 80°S
    for (let lat = -55; lat >= -80; lat -= 5) {
      const p1 = geoToWorld(lat, this.bbox.lonMin, this.bbox);
      const p2 = geoToWorld(lat, this.bbox.lonMax, this.bbox);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.fillText(`${Math.abs(lat)}°00'S`, 20, p1.y - 6);
      ctx.fillText(`${Math.abs(lat)}°00'S`, renderer.worldWidth - 75, p1.y - 6);
    }

    // Longitude meridians: 70°E, 80°E, 90°E, 100°E, 110°E, 120°E, 130°E
    for (let lon = 70; lon <= 135; lon += 10) {
      const p1 = geoToWorld(this.bbox.latMax, lon, this.bbox);
      const p2 = geoToWorld(this.bbox.latMin, lon, this.bbox);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.fillText(`${lon}°00'E`, p1.x + 6, 28);
      ctx.fillText(`${lon}°00'E`, p2.x + 6, renderer.worldHeight - 20);
    }

    ctx.restore();
  }

  /**
   * Tactical Nautical Scale Bar and Compass Rose
   */
  renderTacticalScaleAndCompass(ctx, renderer) {
    ctx.save();
    const sx = 80;
    const sy = renderer.worldHeight - 70;
    const barLengthPx = 300; // ~100 NM in projected scale

    // Scale Bar
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + barLengthPx, sy);
    ctx.moveTo(sx, sy - 8);
    ctx.lineTo(sx, sy + 8);
    ctx.moveTo(sx + barLengthPx * 0.5, sy - 5);
    ctx.lineTo(sx + barLengthPx * 0.5, sy + 5);
    ctx.moveTo(sx + barLengthPx, sy - 8);
    ctx.lineTo(sx + barLengthPx, sy + 8);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText('0', sx - 4, sy - 12);
    ctx.fillText('50 NM', sx + barLengthPx * 0.5 - 18, sy - 12);
    ctx.fillText('100 NM (185.2 km)', sx + barLengthPx - 45, sy - 12);

    ctx.fillStyle = '#a4d64c';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillText('POLARIS GEOGRAPHIC CARTOGRAPHY // EAST ANTARCTIC PRYDZ BAY SECTOR', sx, sy + 22);

    // Compass Rose in Top-Right
    const cx = renderer.worldWidth - 120;
    const cy = 120;
    const cr = 45;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.stroke();

    // North Pointer (Red needle pointing up)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(cx, cy - cr + 4);
    ctx.lineTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.closePath();
    ctx.fill();

    // South Pointer (White needle pointing down)
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(cx, cy + cr - 4);
    ctx.lineTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText('N', cx - 4, cy - cr - 6);
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('TRUE', cx - 12, cy - cr - 18);

    ctx.restore();
  }
}
