/**
 * POLARIS DIGITAL TWIN - High-DPI Interactive 2D Canvas Renderer
 * Camera is viewport-only; all simulation entities live in world space.
 */

import { Camera, WORLD_WIDTH, WORLD_HEIGHT } from './camera.js';
import { maritimeTrafficService, CPA_ALARM_LEVEL } from '../data/MaritimeTrafficService.js';
import { worldToGeo } from '../providers/geoTransform.js';
import { AAD_EAST_ANTARCTIC_BBOX } from '../data/RealWorldDatasetLoader.js';



export const PlanningMode = {
  NONE: 'NONE',
  SET_START: 'SET_START',
  SET_DESTINATION: 'SET_DESTINATION'
};

export class CanvasRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement && typeof canvasElement.getContext === 'function' ? (canvasElement.getContext('2d') || null) : null;
    this.width = canvasElement ? (canvasElement.clientWidth || 1200) : 1200;
    this.height = canvasElement ? (canvasElement.clientHeight || 800) : 800;

    this.camera = new Camera(this.width, this.height);
    this.worldWidth  = WORLD_WIDTH;
    this.worldHeight = WORLD_HEIGHT;

    // Interaction state
    this.isPanning = false;
    this.panStartMouse  = { x: 0, y: 0 };
    this.panStartCamera = { x: 0, y: 0 };
    this.spaceHeld = false;
    this.middleMousePan = false;

    // Navigation placement (world coords set via screen clicks)
    this.planningMode = PlanningMode.NONE;
    this.onPlaceNavPoint = null; // callback(worldX, worldY, mode)

    // Add-Iceberg placement mode
    this.addIcebergMode = false;
    this.onPlaceIceberg = null;
    this.pendingIcebergCfg = { mass: 3.5, size: 550 };

    // Entity interaction
    this.selectedEntity = null;
    this.hoveredEntity  = null;
    this.draggedIceberg = null;
    this.dragOffset     = { x: 0, y: 0 };
    this.wavePhase      = 0;

    // Mouse tracking for debug HUD
    this.mouseScreen = { x: 0, y: 0 };
    this.mouseWorld  = { x: 0, y: 0 };

    // Navigation markers (world coords, set externally)
    this.startPoint      = null;
    this.destinationPoint = null;
    this.showAIOverlay    = true;

    // Production mode: hide internal guidance debug vectors
    this.SHOW_NAV_DEBUG_VECTORS = false;

    // PPI Radar View state
    this.isRadarView = false;
    this.radarSweepAngle = 0;
    this.vesselRadarAngle = 0;

    // Maritime Traffic interaction
    this.selectedAisVessel = null;
    this.hoveredAisVessel  = null;

    this.initIceBlobTextures();
    this.resizeCanvas();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => this.resizeCanvas());
    }
    this.setupInteraction();
  }

  initIceBlobTextures() {
    if (typeof document === 'undefined') return;
    const size = 128;
    const center = size / 2;

    this.baseIceBlobCanvas = document.createElement('canvas');
    this.baseIceBlobCanvas.width = size;
    this.baseIceBlobCanvas.height = size;
    const baseCtx = this.baseIceBlobCanvas.getContext('2d');
    const baseGrad = baseCtx.createRadialGradient(center, center, 0, center, center, center);
    baseGrad.addColorStop(0, 'rgba(210, 235, 255, 1.0)');
    baseGrad.addColorStop(0.6, 'rgba(200, 225, 250, 0.5)');
    baseGrad.addColorStop(1, 'rgba(190, 215, 245, 0.0)');
    baseCtx.fillStyle = baseGrad;
    baseCtx.fillRect(0, 0, size, size);

    this.trendIceBlobCanvas = document.createElement('canvas');
    this.trendIceBlobCanvas.width = size;
    this.trendIceBlobCanvas.height = size;
    const trendCtx = this.trendIceBlobCanvas.getContext('2d');
    const trendGrad = trendCtx.createRadialGradient(center, center, 0, center, center, center);
    trendGrad.addColorStop(0, 'rgba(165, 180, 252, 1.0)');
    trendGrad.addColorStop(0.6, 'rgba(147, 197, 253, 0.5)');
    trendGrad.addColorStop(1, 'rgba(129, 140, 248, 0.0)');
    trendCtx.fillStyle = trendGrad;
    trendCtx.fillRect(0, 0, size, size);
  }

  // ── Delegates to centralized Camera ──────────────────────────────────
  worldToScreen(wx, wy) { return this.camera.worldToScreen(wx, wy); }
  screenToWorld(sx, sy) { return this.camera.screenToWorld(sx, sy); }

  get cameraX() { return this.camera.x; }
  get cameraY() { return this.camera.y; }
  get zoom()    { return this.camera.zoom; }

  set trackShip(v) { this.camera.followShip = v; }
  get trackShip()  { return this.camera.followShip; }

  centerOnShip(ship) {
    this.camera.followShip = false;
    this.camera.centerOn(ship.x, ship.y);
  }

  setFollowShip(enabled) {
    this.camera.followShip = enabled;
  }

  // ── Canvas resize / HiDPI ─────────────────────────────────────────────
  resizeCanvas() {
    if (!this.canvas) return;
    const dpr  = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const rect = typeof this.canvas.getBoundingClientRect === 'function' ? this.canvas.getBoundingClientRect() : { width: 1200, height: 800 };
    this.width  = rect.width  || (typeof window !== 'undefined' ? window.innerWidth : 1200);
    this.height = rect.height || (typeof window !== 'undefined' ? window.innerHeight : 800);
    this.canvas.width  = this.width  * dpr;
    this.canvas.height = this.height * dpr;
    if (this.ctx && typeof this.ctx.setTransform === 'function') {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (this.camera) {
      this.camera.setViewport(this.width, this.height);
    }
  }

  render(vectorField, ship, icebergs, aiNavigator, simTimeHours, dt, state) {
    const ctx = this.ctx;
    this.navLineDrawCount = 0;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (ctx && typeof ctx.setTransform === 'function') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
    }

    if (this.isRadarView) {
      try {
        this.drawRadarView(ctx, ship, icebergs, aiNavigator, simTimeHours, dt, state);
      } catch (e) {
        console.warn("drawRadarView failed", e);
      }
      this.drawHUD(ctx, ship, state);
      return;
    }

    this.wavePhase += dt * (vectorField.stormMode ? 4 : 1.5);

    this.camera.updateFollow(ship);

    // Calculate transition factor t (zoomed out globe overview)
    const t = Math.max(0, Math.min(1, (0.45 - this.camera.zoom) / 0.20));

    if (t < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      this.camera.applyTransform(ctx);

      if (this.activeMapProvider && typeof this.activeMapProvider.render === 'function') {
        try { this.activeMapProvider.render(ctx, this, vectorField); } catch(e) { console.warn("activeMapProvider.render failed", e); }
      } else {
        try { this.drawBackgroundGrid(ctx, vectorField); } catch(e) { console.warn("drawBackgroundGrid failed", e); }
      }
      try { this.drawWaveRipples(ctx, vectorField); } catch(e) { console.warn("drawWaveRipples failed", e); }
      try { this.drawVectorFieldCurrents(ctx, vectorField, simTimeHours, dt); } catch(e) { console.warn("drawVectorFieldCurrents failed", e); }

      if (vectorField.lastState && vectorField.lastState.environment.seaIce.enabled) {
        try { this.drawSeaIce(ctx, vectorField); } catch(e) { console.warn("drawSeaIce failed", e); }
      }

      // Grid heatmaps disabled per spec to keep visual risk small, readable, and iceberg-local
      // try { this.drawProbabilisticRiskMap(ctx); } catch(e) {}
      // try { this.drawRiskHeatmap(ctx, aiNavigator); } catch(e) {}
      try { this.drawNavMarkers(ctx); } catch(e) { console.warn("drawNavMarkers failed", e); }
      try { this.drawCanonicalRouteLine(ctx, aiNavigator, ship); } catch(e) { console.warn("drawCanonicalRouteLine failed", e); }
      try { this.drawIcebergTrajectories(ctx, icebergs); } catch(e) { console.warn("drawIcebergTrajectories failed", e); }
      try { this.drawIcebergs(ctx, icebergs); } catch(e) { console.warn("drawIcebergs failed", e); }
      try { this.drawAisMaritimeTraffic(ctx, ship); } catch(e) { console.warn("drawAisMaritimeTraffic failed", e); }
      try { this.drawShip(ctx, ship, dt); } catch(e) { console.warn("drawShip failed", e); }
      try { this.drawAIOverlay(ctx, ship, icebergs, aiNavigator, state); } catch(e) { console.warn("drawAIOverlay failed", e); }
      // try { this.drawValidationOverlays(ctx); } catch(e) {}

      if (vectorField.stormMode) {
        try { this.drawStormOverlay(ctx); } catch(e) { console.warn("drawStormOverlay failed", e); }
      }

      ctx.restore();
    }

    if (t > 0) {
      this.drawGlobeOverview(ctx, ship, icebergs, t);
    }

    this.drawHUD(ctx, ship, state);
  }

  // ── Globe Overview Helper mapping ─────────────────────────────────────
  worldToGlobe(wx, wy) {
    const ScX = this.width / 2;
    const ScY = this.height / 2;
    const Rg = Math.min(this.width, this.height) * 0.38;
    const dx = wx - 1800;
    const dy = wy - 1200;
    const rWorld = Math.hypot(dx, dy);
    const maxR = 2163.3; // Math.hypot(1800, 1200)
    const angle = Math.atan2(dy, dx);
    const screenDist = (rWorld / maxR) * Rg;
    return {
      x: ScX + Math.cos(angle) * screenDist,
      y: ScY + Math.sin(angle) * screenDist
    };
  }

  drawGlobeOverview(ctx, ship, icebergs, t) {
    const ScX = this.width / 2;
    const ScY = this.height / 2;
    const Rg = Math.min(this.width, this.height) * 0.38;
    
    ctx.save();
    ctx.globalAlpha = t;
    
    // Draw dark space background around globe
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw Globe backdrop
    ctx.beginPath();
    ctx.arc(ScX, ScY, Rg, 0, Math.PI * 2);
    ctx.fillStyle = '#060e20';
    ctx.fill();
    ctx.strokeStyle = '#3f494a';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // Draw Globe Grid
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.1)';
    ctx.lineWidth = 1;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      ctx.beginPath();
      ctx.moveTo(ScX, ScY);
      ctx.lineTo(ScX + Math.cos(angle) * Rg, ScY + Math.sin(angle) * Rg);
      ctx.stroke();
    }
    for (let r = Rg / 4; r < Rg; r += Rg / 4) {
      ctx.beginPath();
      ctx.arc(ScX, ScY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Title
    ctx.fillStyle = '#a1eff8';
    ctx.font = 'bold 12px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.fillText('POLAR ORTHOGRAPHIC PROJECTION', ScX, ScY - Rg - 15);
    
    // Draw projected destinations, route, ship, and icebergs
    if (this.destinationPoint) {
      const gPt = this.worldToGlobe(this.destinationPoint.x, this.destinationPoint.y);
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath(); ctx.arc(gPt.x, gPt.y, 5, 0, Math.PI * 2); ctx.fill();
    }
    
    // Icebergs
    for (let ice of icebergs) {
      const gPt = this.worldToGlobe(ice.x, ice.y);
      ctx.fillStyle = 'rgba(218, 226, 253, 0.8)';
      ctx.beginPath(); ctx.arc(gPt.x, gPt.y, Math.max(3, ice.collisionRadius * Rg / 2163.3), 0, Math.PI * 2); ctx.fill();
    }
    
    // Ship
    const gShip = this.worldToGlobe(ship.x, ship.y);
    ctx.fillStyle = '#d95a2b';
    ctx.beginPath();
    ctx.arc(gShip.x, gShip.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px "JetBrains Mono"';
    ctx.textAlign = 'left';
    ctx.fillText('V-ALPHA', gShip.x + 8, gShip.y + 3);
    
    ctx.restore();
  }

  // ── Navigation markers (world space) ──────────────────────────────────
  drawNavMarkers(ctx) {
    if (this.destinationPoint) {
      this.drawMarker(ctx, this.destinationPoint.x, this.destinationPoint.y, '#fcd34d', 'DEST', false);
    }
  }

  drawMarker(ctx, wx, wy, color, label, isStart) {
    const r = Math.max(6, 10 / this.camera.zoom);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle   = color + '33';
    ctx.lineWidth   = Math.max(1.5, 2 / this.camera.zoom);

    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crosshair
    const arm = r * 1.8;
    ctx.beginPath();
    ctx.moveTo(wx - arm, wy); ctx.lineTo(wx + arm, wy);
    ctx.moveTo(wx, wy - arm); ctx.lineTo(wx, wy + arm);
    ctx.stroke();

    if (isStart) {
      ctx.beginPath();
      ctx.arc(wx, wy, r * 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(9, 11 / this.camera.zoom)}px "JetBrains Mono"`;
    ctx.fillText(label, wx + r + 4, wy + 4);
    ctx.restore();
  }

  // ── HUD (screen space) ────────────────────────────────────────────────
  drawHUD(ctx, ship, state) {
    ctx.save();
    const badgeX = this.width - 16;
    let badgeY = 60;
    ctx.font      = '10px "JetBrains Mono"';
    ctx.textAlign = 'right';

    if (this.camera.followShip) {
      ctx.fillStyle = 'rgba(164,214,76,0.9)';
      ctx.fillText('⦿ FOLLOW SHIP', badgeX, badgeY);
    } else {
      ctx.fillStyle = 'rgba(136,147,148,0.7)';
      ctx.fillText('○ FREE CAM', badgeX, badgeY);
    }
    badgeY += 14;

    const zoomPct = Math.round(this.camera.zoom * 100);
    ctx.fillStyle = 'rgba(161,239,248,0.9)';
    ctx.fillText(`ZOOM ${zoomPct}%`, badgeX, badgeY);
    badgeY += 14;

    if (this.planningMode !== PlanningMode.NONE) {
      ctx.fillStyle = 'rgba(252,211,77,0.95)';
      const label = this.planningMode === PlanningMode.SET_START ? '◎ SET START' : '◎ SET DESTINATION';
      ctx.fillText(label, badgeX, badgeY);
      badgeY += 14;
    }

    if (this.spaceHeld) {
      ctx.fillStyle = 'rgba(161,239,248,0.7)';
      ctx.fillText('SPACE+DRAG PAN', badgeX, badgeY);
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── Background & grid ─────────────────────────────────────────────────
  drawBackgroundGrid(ctx, vectorField) {
    ctx.save();
    ctx.fillStyle = '#0b1326';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const spacing = vectorField.gridSpacing;

    for (let x = 0; x < this.worldWidth; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.worldHeight); ctx.stroke();
    }
    for (let y = 0; y < this.worldHeight; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.worldWidth, y); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(136, 147, 148, 0.5)';
    ctx.font = '10px "JetBrains Mono"';
    for (let x = 100; x < 3600; x += 300) {
      const lonStr = (72.821 + (x / 1000) * 0.8).toFixed(3) + '°E';
      ctx.fillText(lonStr, x, this.camera.y + 18 / this.camera.zoom);
    }
    for (let y = 100; y < 2400; y += 200) {
      const latStr = (-64.382 - (y / 1000) * 0.5).toFixed(3) + '°S';
      ctx.fillText(latStr, this.camera.x + 15 / this.camera.zoom, y);
    }
    ctx.restore();
  }

  drawWaveRipples(ctx, vectorField) {
    ctx.save();
    ctx.strokeStyle = vectorField.stormMode ? 'rgba(255, 180, 171, 0.15)' : 'rgba(165, 243, 252, 0.06)';
    ctx.lineWidth = 1.5;
    const waveLines = 16;
    const gap = 2400 / waveLines;
    for (let i = 0; i < waveLines; i++) {
      const baseY = i * gap + (this.wavePhase * 10) % gap;
      ctx.beginPath();
      for (let x = 0; x < 3600; x += 40) {
        const waveY = baseY + Math.sin(x * 0.015 + this.wavePhase + i) * vectorField.waveHeight * 4.0;
        if (x === 0) ctx.moveTo(x, waveY); else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSeaIce(ctx, vectorField) {
    if (!vectorField.getSeaIceConcentration) return;
    ctx.save();

    const seaIceToggle = typeof document !== 'undefined' ? document.getElementById('sea-ice-forecast-toggle') : null;
    const forecastVal = seaIceToggle ? seaIceToggle.value : '24';
    const isForecastActive = forecastVal !== 'OFF';
    const horizonHours = isForecastActive ? parseInt(forecastVal) : 0;

    const step = 180;
    const startX = Math.floor(this.camera.x / step) * step;
    const startY = Math.floor(this.camera.y / step) * step;
    const endX = this.camera.x + this.camera.visibleWidth + step;
    const endY = this.camera.y + this.camera.visibleHeight + step;

    for (let y = startY; y < endY; y += step) {
      for (let x = startX; x < endX; x += step) {
        let conc = vectorField.getSeaIceConcentration(x, y);
        let isTrend = false;

        if (isForecastActive && typeof vectorField.getSeaIceTrendForecast === 'function') {
          const trendObj = vectorField.getSeaIceTrendForecast(x, y, horizonHours);
          conc = trendObj.predicted;
          isTrend = true;
        }

        if (conc < 0.08) continue;
        const radius = step * 0.7;

        if (this.baseIceBlobCanvas && this.trendIceBlobCanvas) {
          const sprite = isTrend ? this.trendIceBlobCanvas : this.baseIceBlobCanvas;
          ctx.globalAlpha = isTrend ? Math.min(1.0, conc * 0.28) : Math.min(1.0, conc * 0.20);
          ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
        } else {
          const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
          grad.addColorStop(0, `rgba(210, 235, 255, ${conc * 0.20})`);
          grad.addColorStop(1, 'rgba(190, 215, 245, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
      }
    }
    ctx.restore();
  }

  drawVectorFieldCurrents(ctx, vectorField, simTimeHours) {
    ctx.save();
    for (let p of vectorField.particles) {
      const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.5;
      ctx.fillStyle = `rgba(165, 243, 252, ${alpha})`;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.2)';
    ctx.fillStyle   = 'rgba(165, 243, 252, 0.3)';
    ctx.lineWidth   = 1;
    const step = vectorField.gridSpacing * 2;
    const startX = Math.floor(this.camera.x / step) * step;
    const startY = Math.floor(this.camera.y / step) * step;
    const endX = this.camera.x + this.camera.visibleWidth + step;
    const endY = this.camera.y + this.camera.visibleHeight + step;
    for (let y = startY; y < endY; y += step) {
      for (let x = startX; x < endX; x += step) {
        const vel = vectorField.getVelocityAt(x, y, simTimeHours);
        const len = Math.min(24, vel.speed * 8);
        const angle = Math.atan2(vel.v, vel.u);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(len, 0); ctx.lineTo(len - 4, -3); ctx.lineTo(len - 4, 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawRiskHeatmap(ctx, aiNavigator) {
    ctx.save();
    const { rows, cols, cellW, cellH } = aiNavigator;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const risk = aiNavigator.riskGrid[r][c];
        if (risk > 0.15) {
          const cx = c * cellW + cellW / 2;
          const cy = r * cellH + cellH / 2;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellW * 1.2);
          if (risk > 0.6) {
            grad.addColorStop(0, `rgba(255, 114, 114, ${risk * 0.4})`);
            grad.addColorStop(1, 'rgba(255, 114, 114, 0)');
          } else {
            grad.addColorStop(0, `rgba(255, 183, 131, ${risk * 0.3})`);
            grad.addColorStop(1, 'rgba(255, 183, 131, 0)');
          }
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(cx, cy, cellW * 1.2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawCanonicalRouteLine(ctx, aiNavigator, ship) {
    this.navLineDrawCount = (this.navLineDrawCount || 0) + 1;
    if (this.navLineDrawCount > 1) {
      console.error(`[CRITICAL RENDER GUARD FAILURE] Duplicate navigation route line draw call detected in frame! Count: ${this.navLineDrawCount}`);
      if (typeof window !== 'undefined' && window.__STRICT_NAV_LINE_CHECK__) {
        throw new Error(`CRITICAL RENDER GUARD FAILURE: Multiple route line draw calls in single frame (${this.navLineDrawCount})`);
      }
      return;
    }

    const state = typeof window !== 'undefined' && window.simEngine && window.simEngine.state;
    const activeRoute = state && state.navigation && state.navigation.activeRoute;
    
    // Only the CURRENT, ADOPTED activeRoute is ever rendered
    if (!activeRoute || activeRoute.status !== 'valid' || !activeRoute.waypoints || activeRoute.waypoints.length === 0) {
      return;
    }

    ctx.save();
    
    const waypoints = activeRoute.waypoints;
    let startIdx = 0;
    if (ship && ship.routeWaypoints === waypoints && Number.isInteger(ship.waypointIndex) && ship.waypointIndex >= 0 && ship.waypointIndex < waypoints.length) {
      startIdx = ship.waypointIndex;
    } else if (ship) {
      // If ship waypointIndex has not synced to this activeRoute yet, find nearest waypoint index dynamically
      let minD = Infinity;
      for (let i = 0; i < waypoints.length; i++) {
        const d = Math.hypot(waypoints[i].x - ship.x, waypoints[i].y - ship.y);
        if (d < minD) {
          minD = d;
          startIdx = i;
        }
      }
    }

    const rawSlice = waypoints.slice(startIdx);
    const forwardWps = [];
    const radHdg = (((ship && ship.heading) || 0) * Math.PI) / 180;
    const fwdX = Math.cos(radHdg);
    const fwdY = Math.sin(radHdg);

    for (let wp of rawSlice) {
      const dx = wp.x - (ship ? ship.x : 0);
      const dy = wp.y - (ship ? ship.y : 0);
      const dist = Math.hypot(dx, dy);
      if (dist < 15.0) continue; // Skip stale waypoint at/behind ship position
      const dot = dx * fwdX + dy * fwdY;
      if (dot < -10.0 && forwardWps.length === 0) continue; // Skip backward waypoint
      forwardWps.push(wp);
    }

    let finalWps = forwardWps;
    if (finalWps.length === 0 && rawSlice.length > 0) {
      finalWps = rawSlice;
    }
    if (finalWps.length === 0 && (state?.navigation?.destinationPoint || state?.navigation?.destination)) {
      finalWps = [state.navigation.destinationPoint || state.navigation.destination];
    }

    const pts = ship ? [{ x: ship.x, y: ship.y }, ...finalWps] : finalWps;
    if (pts.length < 2) { ctx.restore(); return; }

    const isSafeAvoidance = activeRoute.hasAvoidance || 
                            state?.navigation?.isSafeAvoidanceActive || 
                            state?.navigation?.interferenceAlert?.detected ||
                            activeRoute.isSafeRoute;

    const interferenceHazard = state?.navigation?.interferenceAlert?.hazard || activeRoute.avoidedHazard;

    // 1. Draw Safety Buffer Corridor Envelope (if safe avoidance active)
    if (isSafeAvoidance && pts.length >= 2) {
      const corridorWidth = Math.max(16.0, 24.0 / this.camera.zoom);
      ctx.save();
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;
        const nx = (-dy / len) * corridorWidth;
        const ny = (dx / len) * corridorWidth;

        // Corridor ribbon fill
        ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
        ctx.beginPath();
        ctx.moveTo(p1.x + nx, p1.y + ny);
        ctx.lineTo(p2.x + nx, p2.y + ny);
        ctx.lineTo(p2.x - nx, p2.y - ny);
        ctx.lineTo(p1.x - nx, p1.y - ny);
        ctx.closePath();
        ctx.fill();

        // Subtle corridor boundary track lines
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
        ctx.lineWidth = 1.0 / this.camera.zoom;
        ctx.setLineDash([4 / this.camera.zoom, 4 / this.camera.zoom]);
        ctx.beginPath();
        ctx.moveTo(p1.x + nx, p1.y + ny);
        ctx.lineTo(p2.x + nx, p2.y + ny);
        ctx.moveTo(p1.x - nx, p1.y - ny);
        ctx.lineTo(p2.x - nx, p2.y - ny);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Draw Main Safe Trajectory Segments
    ctx.lineWidth = isSafeAvoidance ? Math.max(2.8, 3.8 / this.camera.zoom) : Math.max(2.0, 3.0 / this.camera.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(isSafeAvoidance ? [10 / this.camera.zoom, 5 / this.camera.zoom] : [8 / this.camera.zoom, 6 / this.camera.zoom]);

    for (let i = 0; i < pts.length - 1; i++) {
      const ptCurr = pts[i];
      const ptNext = pts[i + 1];

      const riskScore = ptCurr.riskScore || 0;
      let strokeColor = isSafeAvoidance ? '#00ffcc' : '#22c55e';
      if (riskScore > 0.75) strokeColor = '#ef4444';
      else if (riskScore > 0.50) strokeColor = '#f97316';
      else if (riskScore > 0.25) strokeColor = '#eab308';

      ctx.save();
      if (isSafeAvoidance) {
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 6 / this.camera.zoom;
      }
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.moveTo(ptCurr.x, ptCurr.y);
      ctx.lineTo(ptNext.x, ptNext.y);
      ctx.stroke();
      ctx.restore();

      // Directional Flow Chevrons along safe route
      const dx = ptNext.x - ptCurr.x;
      const dy = ptNext.y - ptCurr.y;
      const segDist = Math.hypot(dx, dy);
      if (segDist > 60) {
        const midX = (ptCurr.x + ptNext.x) / 2;
        const midY = (ptCurr.y + ptNext.y) / 2;
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        ctx.strokeStyle = isSafeAvoidance ? '#00ffcc' : 'rgba(34, 197, 94, 0.7)';
        ctx.lineWidth = 1.8 / this.camera.zoom;
        ctx.setLineDash([]);
        const cSize = Math.max(4, 5 / this.camera.zoom);
        ctx.beginPath();
        ctx.moveTo(-cSize, -cSize);
        ctx.lineTo(cSize, 0);
        ctx.lineTo(-cSize, cSize);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.setLineDash([]);

    // 3. Draw Waypoint Nodes
    const r = Math.max(4, 5 / this.camera.zoom);
    for (let i = 0; i < pts.length; i++) {
      const isStart = (i === 0);
      const isEnd = (i === pts.length - 1);
      
      ctx.fillStyle = isStart
        ? (aiNavigator.riskScore > 0.75 ? '#ef4444' : (aiNavigator.riskScore > 0.35 ? '#f97316' : '#00ffcc'))
        : (isSafeAvoidance ? '#00ffcc' : '#22c55e');

      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, isEnd ? r * 1.2 : (isStart ? r : r * 0.7), 0, Math.PI * 2);
      ctx.fill();

      if (isSafeAvoidance && !isStart && !isEnd) {
        ctx.strokeStyle = 'rgba(0, 255, 204, 0.5)';
        ctx.lineWidth = 1.0 / this.camera.zoom;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, r * 1.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 4. Draw Obstacle Hazard Warning Tag & Evasion Badge
    if (interferenceHazard) {
      const hx = interferenceHazard.x;
      const hy = interferenceHazard.y;
      if (Number.isFinite(hx) && Number.isFinite(hy)) {
        ctx.save();
        // Pulsing hazard danger ring
        const pulseR = (interferenceHazard.collisionRadius || 30) + Math.sin(Date.now() * 0.007) * 6;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.0 / this.camera.zoom;
        ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
        ctx.beginPath();
        ctx.arc(hx, hy, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        // Tactical Callout Tag at Obstacle
        const tagText = `⚠ OBSTACLE INTERFERENCE: ${interferenceHazard.name || 'HAZARD'}`;
        const subText = `CLEARANCE: ${Math.max(0, Math.round(Math.abs(interferenceHazard.clearance || 45)))}m [SAFE DETOUR]`;
        ctx.font = `bold ${Math.max(10, 11 / this.camera.zoom)}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'bottom';
        const tw = Math.max(ctx.measureText(tagText).width, ctx.measureText(subText).width) + 16;
        const th = 32 / this.camera.zoom;
        const tagX = hx + 25 / this.camera.zoom;
        const tagY = hy - 15 / this.camera.zoom;

        // Leader line
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 1.2 / this.camera.zoom;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(tagX, tagY + th / 2);
        ctx.stroke();

        // Background card
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.2 / this.camera.zoom;
        ctx.beginPath();
        ctx.roundRect(tagX, tagY, tw, th, 4 / this.camera.zoom);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.fillText(tagText, tagX + 8, tagY + 14 / this.camera.zoom);
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.max(8.5, 9.5 / this.camera.zoom)}px "JetBrains Mono", monospace`;
        ctx.fillText(subText, tagX + 8, tagY + 28 / this.camera.zoom);

        ctx.restore();
      }
    }

    // 5. Tactical HUD Safe Route Badge
    if (isSafeAvoidance && pts.length >= 2) {
      const midIdx = Math.floor(pts.length / 2);
      const bPt = pts[midIdx];
      ctx.save();
      const badgeText = `🛡 SAFE AVOIDANCE ROUTE ACTIVE`;
      ctx.font = `bold ${Math.max(10, 11 / this.camera.zoom)}px "JetBrains Mono", monospace`;
      const bw = ctx.measureText(badgeText).width + 20;
      const bh = 22 / this.camera.zoom;
      const bx = bPt.x - bw / 2;
      const by = bPt.y - 28 / this.camera.zoom;

      ctx.fillStyle = 'rgba(6, 78, 59, 0.95)';
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 5 / this.camera.zoom);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bPt.x, by + bh / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  drawSafeRoute(ctx, aiNavigator, ship) {
    this.drawCanonicalRouteLine(ctx, aiNavigator, ship);
  }

  drawDebugVectors(ctx, ship) {
    if (!this.showDebugOverlay) return;

    ctx.save();
    // 1. Target Waypoint Dot (no line extending from ship)
    if (ship.targetWaypoint) {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(ship.targetWaypoint.x, ship.targetWaypoint.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Short (15px) Heading Indicator at ship (distinct from route line)
    const radHdg = (ship.heading * Math.PI) / 180;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y);
    ctx.lineTo(ship.x + Math.cos(radHdg) * 15, ship.y + Math.sin(radHdg) * 15);
    ctx.stroke();

    // 3. Short (15px) Velocity Pointer at ship (distinct from route line)
    const spdG = Math.hypot(ship.vx, ship.vy);
    if (spdG > 0.1) {
      ctx.strokeStyle = '#a1eff8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      ctx.lineTo(ship.x + (ship.vx / spdG) * 15, ship.y + (ship.vy / spdG) * 15);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawAIOverlay(ctx, ship, icebergs, aiNavigator, state) {
    if (!this.showAIOverlay && (!ship || !ship._inEmergencyAvoidance)) return;
    if (!ship) return;

    ctx.save();
    const radHdg = (ship.heading * Math.PI) / 180;
    const tgtHdg = ship.targetHeading !== undefined ? ship.targetHeading : ship.heading;
    const radTgt = (tgtHdg * Math.PI) / 180;

    if (this.SHOW_NAV_DEBUG_VECTORS) {
      // 1. Current Ship Heading Vector (Cyan Arrow, 60 SU)
      const hLen = 60;
      const hx = ship.x + Math.cos(radHdg) * hLen;
      const hy = ship.y + Math.sin(radHdg) * hLen;

      ctx.strokeStyle = '#06b6d4'; // Cyan
      ctx.lineWidth = Math.max(1.5, 2.5 / this.camera.zoom);
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(3.5, 4.5 / this.camera.zoom), 0, Math.PI * 2);
      ctx.fill();

      // 2. Desired Heading Vector (Lime Green Arrow, 60 SU)
      const tx = ship.x + Math.cos(radTgt) * hLen;
      const ty = ship.y + Math.sin(radTgt) * hLen;

      ctx.strokeStyle = '#a4d64c'; // Lime
      ctx.lineWidth = Math.max(1.5, 2.5 / this.camera.zoom);
      ctx.setLineDash([4 / this.camera.zoom, 3 / this.camera.zoom]);
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#a4d64c';
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(3.5, 4.5 / this.camera.zoom), 0, Math.PI * 2);
      ctx.fill();

      // 3. Lookahead Point
      if (ship.targetWaypoint) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = Math.max(1.5, 2 / this.camera.zoom);
        ctx.beginPath();
        ctx.arc(ship.targetWaypoint.x, ship.targetWaypoint.y, Math.max(6, 8 / this.camera.zoom), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
        ctx.fill();
      }
    } // end SHOW_NAV_DEBUG_VECTORS

    // 4. Ship Safety Envelope (Collision radius + Safety Buffer = 45 SU)
    const envelopeRadius = (ship.collisionRadius || 15) + 30;
    ctx.strokeStyle = ship._inEmergencyAvoidance ? 'rgba(244, 63, 94, 0.8)' : 'rgba(164, 214, 76, 0.4)';
    ctx.fillStyle = ship._inEmergencyAvoidance ? 'rgba(244, 63, 94, 0.12)' : 'rgba(164, 214, 76, 0.05)';
    ctx.lineWidth = Math.max(1, 1.5 / this.camera.zoom);
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, envelopeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 5. CPA Line & Risk to Closest Iceberg
    if (icebergs && icebergs.length > 0) {
      let closestIce = null;
      let minClearance = Infinity;
      for (let ice of icebergs) {
        const d = Math.hypot(ship.x - ice.x, ship.y - ice.y);
        const clearance = d - (ship.collisionRadius || 15) - (ice.collisionRadius || 20);
        if (clearance < minClearance) {
          minClearance = clearance;
          closestIce = ice;
        }
      }

      if (closestIce && minClearance < 500) {
        ctx.strokeStyle = minClearance < 50 ? '#f43f5e' : (minClearance < 120 ? '#f59e0b' : '#38bdf8');
        ctx.lineWidth = Math.max(1, 1.5 / this.camera.zoom);
        ctx.setLineDash([3 / this.camera.zoom, 3 / this.camera.zoom]);
        ctx.beginPath();
        ctx.moveTo(ship.x, ship.y);
        ctx.lineTo(closestIce.x, closestIce.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = (ship.x + closestIce.x) / 2;
        const midY = (ship.y + closestIce.y) / 2;
        ctx.fillStyle = minClearance < 50 ? '#f43f5e' : (minClearance < 120 ? '#fbbf24' : '#a1eff8');
        ctx.font = 'bold 10px "JetBrains Mono"';
        ctx.fillText(`CPA: ${Math.round(minClearance)} SU`, midX + 6, midY - 6);
      }
    }

    ctx.restore();
  }

  drawHypotheticalRoute(ctx) {
    const cs = typeof window !== 'undefined' && window.simEngine && window.simEngine.counterfactualSimulator;
    if (!cs || !cs.showHypotheticalRoute || !cs.hypotheticalRoute || cs.hypotheticalRoute.length === 0) return;

    ctx.save();
    ctx.strokeStyle = '#c084fc'; // Visually distinct purple/violet color
    ctx.lineWidth = Math.max(2.0, 3 / this.camera.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([8 / this.camera.zoom, 4 / this.camera.zoom]);
    
    ctx.beginPath();
    ctx.moveTo(cs.hypotheticalRoute[0].x, cs.hypotheticalRoute[0].y);
    for (let i = 1; i < cs.hypotheticalRoute.length; i++) {
      ctx.lineTo(cs.hypotheticalRoute[i].x, cs.hypotheticalRoute[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawIcebergTrajectories(ctx, icebergs) {
    const trajToggle = typeof document !== 'undefined' ? document.getElementById('iceberg-trajectory-toggle') : null;
    if (!trajToggle || !trajToggle.checked) return;

    ctx.save();
    for (let ice of icebergs) {
      if (this.camera && !this.camera.isVisible(ice.x, ice.y, 400)) continue;

      const isML = !!(ice.mlTrajectory && ice.mlTrajectory.length > 0);
      const points = isML ? ice.mlTrajectory : ice.trajectoryForecast;

      if (!points || points.length === 0) continue;

      ctx.strokeStyle = isML 
        ? 'rgba(236, 72, 153, 0.8)' 
        : (ice.isSelected ? 'rgba(255, 180, 171, 0.9)' : 'rgba(165, 243, 252, 0.6)');
      
      ctx.lineWidth = isML ? 2 : 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(ice.x, ice.y);
      for (let f of points) ctx.lineTo(f.x, f.y);
      ctx.stroke(); ctx.setLineDash([]);

      for (let f of points) {
        const h = f.hour || f.time || 0;
        const radius = f.uncertainty || ((ice.collisionRadius || 20) + (h * 2.5));

        ctx.fillStyle = isML ? 'rgba(236, 72, 153, 0.08)' : 'rgba(165, 243, 252, 0.08)';
        ctx.strokeStyle = isML ? 'rgba(236, 72, 153, 0.3)' : 'rgba(165, 243, 252, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isML 
          ? '#f472b6' 
          : (ice.isSelected ? '#ffb4ab' : '#a1eff8');
        ctx.beginPath(); ctx.arc(f.x, f.y, 3.5, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '9px "JetBrains Mono"';
        const labelText = isML ? `+${f.time}m (ML)` : `+${f.hour}h`;
        ctx.fillText(labelText, f.x + 6, f.y + 3);
      }
    }
    ctx.restore();
  }

  drawIcebergs(ctx, icebergs) {
    ctx.save();
    for (let ice of icebergs) {
      const baseR = ice.collisionRadius || 20;
      // Cosmetic-only rendering scaling (does NOT alter physics or collision detection safety math)
      const visualUncertaintyR = Math.min(baseR * 1.5, ice.uncertaintyRadius || (baseR * 0.5));
      const zone1R = baseR;
      const zone2R = baseR * 1.5;
      const zone3R = Math.min(baseR * 2.5, baseR * 2.2);
      const maxVisualR = zone3R + 10;

      if (this.camera && !this.camera.isVisible(ice.x, ice.y, maxVisualR)) continue;

      ctx.save();
      ctx.translate(ice.x, ice.y);
      ctx.rotate((ice.heading * Math.PI) / 180);
      
      // ── STEP 3 & 5: DRAW EXPANDING OBSERVATION UNCERTAINTY & LAYERED SAFETY ENVELOPES ──
      // Draw Expanding observation uncertainty circle (Purple dashed)
      ctx.beginPath();
      ctx.arc(0, 0, visualUncertaintyR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(147, 51, 234, 0.06)';  // Purple 6% opacity
      ctx.fill();
      ctx.strokeStyle = 'rgba(147, 51, 234, 0.3)';  // Purple outline
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Zone 1: Hard Collision (1.0 * baseR) - Red
      ctx.beginPath();
      ctx.arc(0, 0, zone1R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)'; // Red 12% opacity
      ctx.fill();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Zone 2: Critical Danger (1.5 * baseR) - Orange
      ctx.beginPath();
      ctx.arc(0, 0, zone2R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.08)'; // Orange 8% opacity
      ctx.fill();
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Zone 3: Caution (2.2 * baseR) - Yellow
      ctx.beginPath();
      ctx.arc(0, 0, zone3R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.04)'; // Yellow 4% opacity
      ctx.fill();
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const r = Math.max(10, ice.size / 35);
      if (ice.isSelected || ice === this.hoveredEntity) {
        ctx.strokeStyle = '#a4d64c'; ctx.lineWidth = 1;
        ctx.strokeRect(-r - 8, -r - 8, r * 2 + 16, r * 2 + 16);
      }
      
      // Cached shape vertices per iceberg
      if (!ice._cachedShape || ice._cachedSize !== ice.size) {
        let seed = ice.id || 1;
        const rand = () => {
          let x = Math.sin(seed++) * 10000;
          return x - Math.floor(x);
        };
        const p1 = -0.1 + rand() * 0.2;
        const p2 = -0.15 + rand() * 0.3;
        const p3 = -0.1 + rand() * 0.2;
        const p4 = -0.2 + rand() * 0.3;
        const p5 = -0.15 + rand() * 0.2;
        const shade = 215 + Math.floor(rand() * 40);
        
        ice._cachedSize = ice.size;
        ice._cachedShape = {
          color: `rgb(${shade - 15}, ${shade}, 253)`,
          shadowPts: [
            [2, -r * (1 + p1) + 2],
            [r * (0.8 + p2) + 2, -r * (0.3 + p3) + 2],
            [r * (0.9 + p4) + 2, r * (0.7 + p5) + 2],
            [-r * (0.4 + p1) + 2, r * (1 + p2) + 2],
            [-r * (0.9 + p3) + 2, r * (0.2 + p4) + 2]
          ],
          bodyPts: [
            [0, -r * (1 + p1)],
            [r * (0.8 + p2), -r * (0.3 + p3)],
            [r * (0.9 + p4), r * (0.7 + p5)],
            [-r * (0.4 + p1), r * (1 + p2)],
            [-r * (0.9 + p3), r * (0.2 + p4)]
          ]
        };
      }

      const shape = ice._cachedShape;
      const color = ice.isSelected ? '#ffffff' : shape.color;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.moveTo(shape.shadowPts[0][0], shape.shadowPts[0][1]);
      for (let i = 1; i < shape.shadowPts.length; i++) {
        ctx.lineTo(shape.shadowPts[i][0], shape.shadowPts[i][1]);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(shape.bodyPts[0][0], shape.bodyPts[0][1]);
      for (let i = 1; i < shape.bodyPts.length; i++) {
        ctx.lineTo(shape.bodyPts[i][0], shape.bodyPts[i][1]);
      }
      ctx.closePath();
      ctx.fill();

      const dbgHud = typeof document !== 'undefined' ? document.getElementById('debug-hud') : null;
      if (dbgHud && !dbgHud.classList.contains('hidden')) {
        ctx.strokeStyle = 'rgba(255, 114, 114, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, ice.collisionRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(164, 214, 76, 0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, ice.collisionRadius + 15 + 30, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (ice.isUSNIC || ice.name || (ice.id && typeof ice.id === 'string' && ice.id.includes('-'))) {
        ctx.fillStyle = ice.rcsDb !== undefined ? '#38bdf8' : '#a1eff8';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ice.name || ice.id, 0, -r - 14);

        if (ice.rcsDb !== undefined || ice.sensor) {
          // SAR Radar Backscatter Detection Box with Tactical Brackets
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
          ctx.lineWidth = 1.2;
          const boxSize = r + 8;
          const bracketLen = 6;
          // Top-Left
          ctx.beginPath();
          ctx.moveTo(-boxSize, -boxSize + bracketLen); ctx.lineTo(-boxSize, -boxSize); ctx.lineTo(-boxSize + bracketLen, -boxSize);
          // Top-Right
          ctx.moveTo(boxSize - bracketLen, -boxSize); ctx.lineTo(boxSize, -boxSize); ctx.lineTo(boxSize, -boxSize + bracketLen);
          // Bottom-Left
          ctx.moveTo(-boxSize, boxSize - bracketLen); ctx.lineTo(-boxSize, boxSize); ctx.lineTo(-boxSize + bracketLen, boxSize);
          // Bottom-Right
          ctx.moveTo(boxSize - bracketLen, boxSize); ctx.lineTo(boxSize, boxSize); ctx.lineTo(boxSize, boxSize - bracketLen);
          ctx.stroke();

          // SAR Metadata Readout
          ctx.fillStyle = '#a4d64c';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          const sarText = `SAR ${ice.rcsDb ? ice.rcsDb + ' dB' : 'ECHO'} [${ice.sensor || 'ERS-2'}]`;
          ctx.fillText(sarText, 0, -r - 26);
        }

        if (ice.lat !== undefined && ice.lon !== undefined) {
          ctx.fillStyle = 'rgba(218, 226, 253, 0.75)';
          ctx.font = '9px "JetBrains Mono", monospace';
          const latStr = `${Math.abs(ice.lat).toFixed(2)}°S`;
          const lonStr = `${ice.lon >= 0 ? ice.lon.toFixed(2) + '°E' : Math.abs(ice.lon).toFixed(2) + '°W'}`;
          ctx.fillText(`${latStr} ${lonStr}`, 0, -r - 3);
        }
      }

      ctx.restore();
    }
    ctx.restore();
  }

  drawShip(ctx, ship, dt = 0.016) {
    if (!ship) return;
    this.vesselRadarAngle = (this.vesselRadarAngle || 0) + (dt || 0.016) * 3.5;

    ctx.save();
    ctx.translate(ship.x, ship.y);

    const radHdg = ((ship.heading * Math.PI) / 180);
    const speed = ship.speedKnots || 0;

    // ── 1. Hydrodynamic Kelvin Wake Waves & Frothing Prop Wash ──
    if (speed > 1.0) {
      ctx.save();
      ctx.rotate(radHdg);

      const wakeLen = Math.min(130, speed * 7.0);
      const wakeWidth = Math.min(48, speed * 2.5);

      // Expanding Turbulent Prop Wash from Twin Azipods
      const washGrad = ctx.createLinearGradient(-15, 0, -15 - wakeLen, 0);
      washGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.65)');
      washGrad.addColorStop(0.25, 'rgba(186, 230, 253, 0.40)');
      washGrad.addColorStop(0.65, 'rgba(125, 211, 252, 0.18)');
      washGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0.00)');

      ctx.fillStyle = washGrad;
      ctx.beginPath();
      ctx.moveTo(-16, -7);
      ctx.lineTo(-16 - wakeLen, -wakeWidth * 0.7);
      ctx.quadraticCurveTo(-20 - wakeLen * 1.15, 0, -16 - wakeLen, wakeWidth * 0.7);
      ctx.lineTo(-16, 7);
      ctx.closePath();
      ctx.fill();

      // Diverging V-shaped Kelvin Wake Wave Crests
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.4)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      // Port wave
      ctx.moveTo(-6, -8);
      ctx.lineTo(-15 - wakeLen * 0.95, -wakeWidth * 1.35);
      // Starboard wave
      ctx.moveTo(-6, 8);
      ctx.lineTo(-15 - wakeLen * 0.95, wakeWidth * 1.35);
      ctx.stroke();

      // Secondary Kelvin ripples
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-16, -11);
      ctx.lineTo(-28 - wakeLen * 0.65, -wakeWidth * 1.1);
      ctx.moveTo(-16, 11);
      ctx.lineTo(-28 - wakeLen * 0.65, wakeWidth * 1.1);
      ctx.stroke();

      ctx.restore();
    }

    // ── 2. Active Marine Radar Scanner Cone (Phosphorescent Persistence) ──
    ctx.save();
    const radarRadius = 85;
    const sweepAngle = this.vesselRadarAngle || 0;
    const sweepCone = Math.PI / 4; // 45 degree active illuminated sector

    const coneGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, radarRadius);
    coneGrad.addColorStop(0.0, 'rgba(74, 222, 128, 0.25)');
    coneGrad.addColorStop(0.8, 'rgba(34, 197, 94, 0.08)');
    coneGrad.addColorStop(1.0, 'rgba(34, 197, 94, 0.00)');

    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radarRadius, sweepAngle - sweepCone, sweepAngle);
    ctx.closePath();
    ctx.fill();

    // Sharp rotating sweep line
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radarRadius * Math.cos(sweepAngle), radarRadius * Math.sin(sweepAngle));
    ctx.stroke();

    // Radar Range Ring (Faint dashed green)
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, radarRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── 3. High-Definition Polar Icebreaker Vessel Hull & Superstructure ──
    ctx.save();
    ctx.rotate(radHdg);

    // Drop shadow under hull
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.moveTo(30, 3);
    ctx.lineTo(8, 12);
    ctx.lineTo(-20, 11);
    ctx.lineTo(-23, 0);
    ctx.lineTo(-20, -11);
    ctx.lineTo(8, -12);
    ctx.closePath();
    ctx.fill();

    // Lower Reinforced Ice-Belt (Waterline steel armour in dark navy/grey)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(10, 11);
    ctx.lineTo(-20, 10);
    ctx.lineTo(-22, 0);
    ctx.lineTo(-20, -10);
    ctx.lineTo(10, -11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Upper Polar Class Hull (Vibrant Arctic Red/Orange with gradient)
    const hullGrad = ctx.createLinearGradient(0, -9, 0, 9);
    hullGrad.addColorStop(0.0, '#ea580c'); // Bright polar orange
    hullGrad.addColorStop(0.5, '#dc2626'); // High-vis marine red
    hullGrad.addColorStop(1.0, '#991b1b'); // Deep hull shadow

    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(26, 0);             // Bulbous ice-ramming bow
    ctx.lineTo(12, 8.5);          // Flare shoulder
    ctx.lineTo(-18, 8.0);         // Midships to stern
    ctx.lineTo(-20, 0);           // Transom stern center
    ctx.lineTo(-18, -8.0);
    ctx.lineTo(12, -8.5);
    ctx.closePath();
    ctx.fill();

    // Forecastle deck & cargo hold hatches (Forward)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(4, -5, 8, 10);
    // Anchor windlass & forward crane boom
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(18, 0);
    ctx.stroke();

    // Multi-Deck Navigation Bridge Superstructure (Crisp Polar White)
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-8, -6, 14, 12, 2) : ctx.fillRect(-8, -6, 14, 12);
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Navigation Bridge Forward Windows (Illuminated Command Deck)
    ctx.fillStyle = '#38bdf8'; // Glowing blue glass
    ctx.fillRect(2, -4.5, 3, 9);

    // Twin Exhaust Funnels (Middens)
    ctx.fillStyle = '#334155';
    ctx.fillRect(-6, -4, 4, 3);
    ctx.fillRect(-6, 1, 4, 3);
    ctx.fillStyle = '#ea580c'; // Funnel orange band
    ctx.fillRect(-4.5, -4, 1.5, 3);
    ctx.fillRect(-4.5, 1, 1.5, 3);

    // Starboard and Port Enclosed Polar Lifeboats
    ctx.fillStyle = '#f97316';
    ctx.fillRect(-5, -7.8, 6, 2.2);
    ctx.fillRect(-5, 5.6, 6, 2.2);

    // Aft Flight Deck & Helipad Marking (Stern)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-14, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // White 'H' Helipad marking
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-16, -2.5); ctx.lineTo(-16, 2.5);
    ctx.moveTo(-12, -2.5); ctx.lineTo(-12, 2.5);
    ctx.moveTo(-16, 0);    ctx.lineTo(-12, 0);
    ctx.stroke();

    // Dynamic Stern Rudder Angle Deflection
    const rudderDeg = ship.rudder || 0;
    const rudderRad = (rudderDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(-21, 0);
    ctx.rotate(rudderRad);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, 0);
    ctx.stroke();
    ctx.restore();

    // Forward Heading Vector Leader Line (Projected path)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(65, 0);
    ctx.stroke();
    // Arrowhead
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(65, 0);
    ctx.lineTo(58, -3.5);
    ctx.lineTo(58, 3.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore(); // Restore vessel rotation

    // ── 4. Tactical Vessel Telemetry Callout Pill ──
    const isReal = typeof window !== 'undefined' && window.simEngine && window.simEngine.dataMode === 'REAL';
    const geo = worldToGeo(ship.x, ship.y, isReal ? AAD_EAST_ANTARCTIC_BBOX : DEFAULT_ANTARCTIC_BBOX);

    const calloutX = 32;
    const calloutY = -24;

    ctx.fillStyle = 'rgba(6, 14, 32, 0.90)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(calloutX, calloutY, 155, 38, 4) : ctx.fillRect(calloutX, calloutY, 155, 38);
    ctx.fill();
    ctx.stroke();

    // Vessel Name & Polar Class
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText(`${ship.name || 'POLARIS'} [PC3 ICEBREAKER]`, calloutX + 6, calloutY + 13);

    // Speed, Heading & Coordinates
    ctx.fillStyle = '#a4d64c';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(`SOG: ${speed.toFixed(1)} kts | HDG: ${Math.round(ship.heading)}°`, calloutX + 6, calloutY + 24);

    ctx.fillStyle = 'rgba(218, 226, 253, 0.75)';
    ctx.font = '8px "JetBrains Mono", monospace';
    const latStr = `${Math.abs(geo.lat).toFixed(2)}°S`;
    const lonStr = `${geo.lon >= 0 ? geo.lon.toFixed(2) + '°E' : Math.abs(geo.lon).toFixed(2) + '°W'}`;
    ctx.fillText(`POS: ${latStr} ${lonStr}`, calloutX + 6, calloutY + 34);

    // Debug collision circle
    const dbgHud = typeof document !== 'undefined' ? document.getElementById('debug-hud') : null;
    if (dbgHud && !dbgHud.classList.contains('hidden')) {
      ctx.strokeStyle = 'rgba(164, 214, 76, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, ship.collisionRadius || 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawAisMaritimeTraffic(ctx, ship) {
    const vessels = maritimeTrafficService.getAllVessels();
    if (!vessels || vessels.length === 0) return;

    // Check CPA alerts relative to our ship
    const cpaList = ship ? maritimeTrafficService.calculateCpaWithShip(ship) : [];
    const cpaMap = new Map();
    for (const c of cpaList) {
      cpaMap.set(c.vessel.mmsi, c);
    }

    ctx.save();

    for (const v of vessels) {
      if (this.camera && !this.camera.isVisible(v.x, v.y, 250)) continue;

      const isSelected = this.selectedAisVessel && this.selectedAisVessel.mmsi === v.mmsi;
      const isHovered = this.hoveredAisVessel && this.hoveredAisVessel.mmsi === v.mmsi;
      const cpaInfo = cpaMap.get(v.mmsi);
      const isCriticalCpa = cpaInfo && cpaInfo.alarm === CPA_ALARM_LEVEL.CRITICAL;
      const isCautionCpa = cpaInfo && cpaInfo.alarm === CPA_ALARM_LEVEL.CAUTION;

      ctx.save();
      ctx.translate(v.x, v.y);

      // ── 1. Pulsing AIS Transponder Ping Ring ──
      const pingR = 14 + (Math.sin(Date.now() * 0.004 + v.mmsi) + 1) * 3;
      ctx.strokeStyle = isCriticalCpa ? 'rgba(239, 68, 68, 0.6)' : (isCautionCpa ? 'rgba(245, 158, 11, 0.6)' : 'rgba(56, 189, 248, 0.3)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, pingR, 0, Math.PI * 2);
      ctx.stroke();

      // ── 2. Directed Vessel Glyph ──
      const radCog = ((v.cog || v.heading) * Math.PI) / 180;
      ctx.save();
      ctx.rotate(radCog);

      // Vessel Hull (Tactical pointed arrow/ship silhouette)
      ctx.fillStyle = v.color || '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(14, 0);     // Bow
      ctx.lineTo(5, 5);      // Starboard shoulder
      ctx.lineTo(-10, 4.5);  // Starboard stern
      ctx.lineTo(-10, -4.5); // Port stern
      ctx.lineTo(5, -5);     // Port shoulder
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Bridge house
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-4, -2.5, 5, 5);

      // 15-Minute Course Leader Vector
      const leaderLength = Math.min(50, v.sog * 2.8);
      ctx.strokeStyle = isCriticalCpa ? '#ef4444' : (isCautionCpa ? '#f59e0b' : '#38bdf8');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(14 + leaderLength, 0);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore(); // Restore vessel rotation

      // ── 3. Floating AIS Label Badge ──
      ctx.fillStyle = isCriticalCpa ? '#ef4444' : (isCautionCpa ? '#f59e0b' : '#f8fafc');
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(`${v.flag ? v.flag.split(' ')[0] : '🚢'} ${v.name}`, 18, -8);

      ctx.fillStyle = 'rgba(165, 243, 252, 0.85)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`${v.vesselType} | ${v.sog.toFixed(1)} kts`, 18, 4);

      // Destination badge
      ctx.fillStyle = 'rgba(218, 226, 253, 0.65)';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText(`DEST: ${v.destination}`, 18, 14);

      // ── 4. Tactical CPA Vector Warning Line to Own Ship ──
      if (ship && (isCriticalCpa || isCautionCpa)) {
        ctx.restore(); // back to world space
        ctx.save();
        ctx.strokeStyle = isCriticalCpa ? 'rgba(239, 68, 68, 0.8)' : 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(ship.x, ship.y);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // CPA Label at midpoint
        const midX = (ship.x + v.x) / 2;
        const midY = (ship.y + v.y) / 2;
        ctx.fillStyle = isCriticalCpa ? '#ef4444' : '#f59e0b';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(`⚠ CPA: ${cpaInfo.cpaNm} NM (${cpaInfo.tcpaMinutes}m)`, midX + 8, midY - 6);
        ctx.restore();
        ctx.save();
      }

      // ── 5. Detailed Expanded Dossier (If Selected or Hovered) ──
      if (isSelected || isHovered) {
        const cardW = 195;
        const cardH = 75;
        const cardX = 18;
        const cardY = 20;

        ctx.fillStyle = 'rgba(4, 9, 20, 0.94)';
        ctx.strokeStyle = v.color || '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(cardX, cardY, cardW, cardH, 5) : ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(`MMSI: ${v.mmsi} | IMO: ${v.imo || 'N/A'}`, cardX + 8, cardY + 14);

        ctx.fillStyle = '#a4d64c';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`CALL: ${v.callsign || 'N/A'} | CLASS: ${v.polarClass || 'N/A'}`, cardX + 8, cardY + 28);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText(`STATUS: ${v.navStatus}`, cardX + 8, cardY + 42);
        ctx.fillText(`DIM: ${v.lengthM}m × ${v.beamM}m | DRAFT: ${v.draftM}m`, cardX + 8, cardY + 54);
        ctx.fillText(`OPERATOR: ${v.operator || 'Polar Fleet'}`, cardX + 8, cardY + 66);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  drawStormOverlay(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 114, 114, 0.04)';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    if (Math.random() < 0.03) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    }
    ctx.restore();
  }

  // ── Interaction ───────────────────────────────────────────────────────
  setupInteraction() {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
    this.canvas.addEventListener('mousedown',  (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove',  (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup',    (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', ()  => this.handleMouseUp());
    this.canvas.addEventListener('wheel',      (e) => this.handleWheel(e), { passive: false });
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown',   (e) => { if (e.code === 'Space') { this.spaceHeld = true; e.preventDefault(); } });
      window.addEventListener('keyup',     (e) => { if (e.code === 'Space') this.spaceHeld = false; });
    }
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  bindEntitiesGetter(getIcebergs, getShip) {
    this.getIcebergs = getIcebergs;
    this.getShip     = getShip;
  }

  isPanGesture(e) {
    return e.button === 2 || e.button === 1 || (e.button === 0 && (this.spaceHeld || e.shiftKey));
  }

  handleWheel(e) {
    e.preventDefault();
    if (this.isRadarView) return;
    const screenPos = this.getMousePos(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.camera.zoomAt(screenPos.x, screenPos.y, this.camera.zoom * factor);
    this.camera.followShip = false;
  }

  handleMouseDown(e) {
    if (this.isRadarView) return;
    const screenPos = this.getMousePos(e);
    const worldPos  = this.screenToWorld(screenPos.x, screenPos.y);

    if (this.isPanGesture(e)) {
      this.isPanning = true;
      this.middleMousePan = e.button === 1;
      this.panStartMouse  = { x: screenPos.x, y: screenPos.y };
      this.panStartCamera = { x: this.camera.x, y: this.camera.y };
      this.camera.followShip = false;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return;

    // Navigation point placement
    if (this.planningMode !== PlanningMode.NONE) {
      if (this.onPlaceNavPoint) {
        this.onPlaceNavPoint(worldPos.x, worldPos.y, this.planningMode);
      }
      return;
    }

    if (this.addIcebergMode) {
      if (this.onPlaceIceberg) {
        this.onPlaceIceberg(worldPos.x, worldPos.y, this.pendingIcebergCfg);
      }
      return;
    }

    // Check click on Maritime Traffic (AIS Vessel)
    const aisVessels = maritimeTrafficService.getAllVessels();
    let clickedAis = null;
    for (const v of aisVessels) {
      if (Math.hypot(worldPos.x - v.x, worldPos.y - v.y) < 30) {
        clickedAis = v;
        break;
      }
    }
    if (clickedAis) {
      this.selectedAisVessel = (this.selectedAisVessel && this.selectedAisVessel.mmsi === clickedAis.mmsi) ? null : clickedAis;
      return;
    }

    if (!this.getIcebergs) return;
    const icebergs = this.getIcebergs();
    let clickedIceberg = null;
    for (let ice of icebergs) {
      const dist = Math.hypot(worldPos.x - ice.x, worldPos.y - ice.y);
      if (dist < Math.max(25, ice.size / 25)) { clickedIceberg = ice; break; }
    }
    for (let ice of icebergs) ice.isSelected = false;
    if (clickedIceberg) {
      clickedIceberg.isSelected = true;
      clickedIceberg.isDragging = true;
      this.selectedEntity = clickedIceberg;
      this.draggedIceberg = clickedIceberg;
      this.dragOffset = { x: worldPos.x - clickedIceberg.x, y: worldPos.y - clickedIceberg.y };
      if (this.onSelectIceberg) this.onSelectIceberg(clickedIceberg);
    } else {
      this.selectedEntity = null;
      if (this.onSelectIceberg) this.onSelectIceberg(null);
    }
  }

  handleMouseMove(e) {
    const screenPos = this.getMousePos(e);
    const worldPos  = this.screenToWorld(screenPos.x, screenPos.y);
    this.mouseScreen = screenPos;
    this.mouseWorld  = worldPos;

    if (this.isPanning) {
      const dx = screenPos.x - this.panStartMouse.x;
      const dy = screenPos.y - this.panStartMouse.y;
      this.camera.x = this.panStartCamera.x - dx / this.camera.zoom;
      this.camera.y = this.panStartCamera.y - dy / this.camera.zoom;
      this.camera.clampToWorld();
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.draggedIceberg && this.draggedIceberg.isDragging) {
      this.draggedIceberg.x = worldPos.x - this.dragOffset.x;
      this.draggedIceberg.y = worldPos.y - this.dragOffset.y;
      if (typeof this.draggedIceberg.updateLatLon === 'function') this.draggedIceberg.updateLatLon();
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (!this.getIcebergs) return;
    const icebergs = this.getIcebergs();
    let foundHover = false;
    for (let ice of icebergs) {
      if (Math.hypot(worldPos.x - ice.x, worldPos.y - ice.y) < Math.max(25, ice.size / 25)) {
        this.hoveredEntity = ice;
        this.canvas.style.cursor = 'pointer';
        foundHover = true;
        break;
      }
    }

    // Check hover on AIS vessels
    const aisVessels = maritimeTrafficService.getAllVessels();
    let foundAisHover = false;
    for (const v of aisVessels) {
      if (Math.hypot(worldPos.x - v.x, worldPos.y - v.y) < 30) {
        this.hoveredAisVessel = v;
        this.canvas.style.cursor = 'pointer';
        foundAisHover = true;
        break;
      }
    }
    if (!foundAisHover) {
      this.hoveredAisVessel = null;
    }

    if (!foundHover && !foundAisHover) {
      this.hoveredEntity = null;
      if (this.planningMode !== PlanningMode.NONE) this.canvas.style.cursor = 'crosshair';
      else if (this.addIcebergMode) this.canvas.style.cursor = 'cell';
      else if (this.spaceHeld) this.canvas.style.cursor = 'grab';
      else this.canvas.style.cursor = 'crosshair';
    }
  }

  handleMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.middleMousePan = false;
      this.canvas.style.cursor = this.spaceHeld ? 'grab' : 'crosshair';
    }
    if (this.draggedIceberg) {
      this.draggedIceberg.isDragging = false;
      this.draggedIceberg = null;
    }
  }

  drawValidationOverlays(ctx) {
    const valEngine = typeof window !== 'undefined' && window.simEngine && window.simEngine.validationEngine;
    if (!valEngine || !valEngine.validationModeActive) return;

    // Draw active predictions checkpoints
    for (let snapshot of valEngine.snapshots) {
      if (snapshot.evaluated) continue;

      ctx.save();
      // Draw predicted position circle
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(snapshot.predictedX, snapshot.predictedY, snapshot.uncertainty || 15, 0, Math.PI * 2);
      ctx.stroke();

      // Filled neon-magenta center dot
      ctx.fillStyle = '#ec4899';
      ctx.beginPath();
      ctx.arc(snapshot.predictedX, snapshot.predictedY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Horizon Text
      ctx.fillStyle = '#ec4899';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`+${snapshot.horizon}m PRED`, snapshot.predictedX + 8, snapshot.predictedY - 4);
      ctx.restore();
    }

    // Draw historical validation connections
    for (let item of valEngine.history) {
      ctx.save();
      // Draw dashed error vector line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(item.predictedX, item.predictedY);
      ctx.lineTo(item.actualX, item.actualY);
      ctx.stroke();

      // Predicted position (cyan circle)
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(item.predictedX, item.predictedY, 6, 0, Math.PI * 2);
      ctx.stroke();

      // Actual position (neon-green circle)
      ctx.fillStyle = '#a4d64c';
      ctx.beginPath();
      ctx.arc(item.actualX, item.actualY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Text showing error
      ctx.fillStyle = '#38bdf8';
      ctx.font = '9px monospace';
      const midX = (item.predictedX + item.actualX) / 2;
      const midY = (item.predictedY + item.actualY) / 2;
      ctx.fillText(`Err: ${item.error.toFixed(1)}m`, midX + 8, midY - 2);
      ctx.restore();
    }
  }

  drawProbabilisticRiskMap(ctx) {
    const engine = window.simEngine;
    if (!engine || !engine.riskIntelligenceEngine) return;
    
    const ri = engine.riskIntelligenceEngine;
    if (!ri.heatmapActive) return;

    ctx.save();
    for (let x = 0; x < ri.gridW; x++) {
      for (let y = 0; y < ri.gridH; y++) {
        const cell = ri.riskGrid[x][y];
        if (cell.risk < 0.1) continue;

        let color = 'rgba(6, 182, 212, 0.12)';
        if (cell.classification === 'CRITICAL') {
          color = 'rgba(236, 72, 153, 0.25)';
        } else if (cell.classification === 'HIGH') {
          color = 'rgba(239, 68, 68, 0.2)';
        } else if (cell.classification === 'MODERATE') {
          color = 'rgba(245, 158, 11, 0.15)';
        }

        const rad = ctx.createRadialGradient(cell.x, cell.y, 5, cell.x, cell.y, Math.max(ri.cellW, ri.cellH) * 1.3);
        rad.addColorStop(0, color);
        rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, Math.max(ri.cellW, ri.cellH) * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── Plan Position Indicator (PPI) Radar Renderer Mode ─────────────────
  drawRadarView(ctx, ship, icebergs, aiNavigator, simTimeHours, dt, state) {
    if (!ctx || !ship) return;

    // 1. Smooth, continuous rotating radar beam sweep
    this.radarSweepAngle = ((this.radarSweepAngle || 0) + dt * 1.8) % (Math.PI * 2);

    const width = this.width;
    const height = this.height;
    const cx = width / 2;
    const cy = height / 2;
    const radarRadius = Math.min(width, height) * 0.38;
    const maxRangeSU = 2000; // 2000 world units display range

    ctx.save();

    // 2. Full Canvas Dark Background
    ctx.fillStyle = '#020904';
    ctx.fillRect(0, 0, width, height);

    // 3. Circular Radar Screen Bezel & Background
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radarRadius, 0, Math.PI * 2);
    ctx.clip();

    // Phosphor Green Radial Gradient
    const radarGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radarRadius);
    radarGrad.addColorStop(0, '#062612');
    radarGrad.addColorStop(0.7, '#03170b');
    radarGrad.addColorStop(1, '#020d06');
    ctx.fillStyle = radarGrad;
    ctx.fillRect(cx - radarRadius, cy - radarRadius, radarRadius * 2, radarRadius * 2);

    // 4. Concentric Range Rings (500, 1000, 1500, 2000 SU)
    const rings = [0.25, 0.50, 0.75, 1.0];
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    rings.forEach((rRatio, idx) => {
      const r = radarRadius * rRatio;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Distance Label
      ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${(idx + 1) * 500} SU (${((idx + 1) * 0.5).toFixed(1)} NM)`, cx + 8, cy - r + 12);
    });
    ctx.setLineDash([]); // Reset dash

    // 5. Cardinal Axis & Compass Markings (N / E / S / W + 30 deg ticks)
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.lineWidth = 1;
    for (let a = 0; a < 360; a += 30) {
      const rad = (a * Math.PI) / 180 - Math.PI / 2;
      const innerR = a % 90 === 0 ? 0 : radarRadius * 0.92;
      const outerR = radarRadius;
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(rad), cy + innerR * Math.sin(rad));
      ctx.lineTo(cx + outerR * Math.cos(rad), cy + outerR * Math.sin(rad));
      ctx.stroke();
    }

    // 6. Trailing Sweep Sector (Phosphor Afterglow Trail)
    const trailAngle = Math.PI / 4; // 45 degree trail
    const numSteps = 16;
    for (let i = 0; i < numSteps; i++) {
      const alpha = (1 - i / numSteps) * 0.18;
      const segStart = this.radarSweepAngle - (i + 1) * (trailAngle / numSteps);
      const segEnd   = this.radarSweepAngle - i * (trailAngle / numSteps);
      ctx.fillStyle = `rgba(34, 197, 94, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radarRadius, segStart, segEnd);
      ctx.closePath();
      ctx.fill();
    }

    // 7. Bright Rotating Sweep Beam Line
    const sweepX = cx + radarRadius * Math.cos(this.radarSweepAngle);
    const sweepY = cy + radarRadius * Math.sin(this.radarSweepAngle);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sweepX, sweepY);
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow

    // 8. Active Route Line on Radar (Faint dashed green)
    const activeRoute = state?.navigation?.activeRoute;
    if (activeRoute && activeRoute.waypoints && activeRoute.waypoints.length > 0) {
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      let first = true;
      for (const wpt of activeRoute.waypoints) {
        const rdx = wpt.x - ship.x;
        const rdy = wpt.y - ship.y;
        const rDist = Math.hypot(rdx, rdy);
        const rBearing = Math.atan2(rdy, rdx);
        const rRatio = Math.min(1.0, rDist / maxRangeSU);
        const rSx = cx + rRatio * radarRadius * Math.cos(rBearing);
        const rSy = cy + rRatio * radarRadius * Math.sin(rBearing);
        if (first) { ctx.moveTo(rSx, rSy); first = false; }
        else { ctx.lineTo(rSx, rSy); }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 9. Destination Marker on Radar
    if (this.destinationPoint) {
      const ddx = this.destinationPoint.x - ship.x;
      const ddy = this.destinationPoint.y - ship.y;
      const dDist = Math.hypot(ddx, ddy);
      const dBearing = Math.atan2(ddy, ddx);
      const dRatio = Math.min(1.0, dDist / maxRangeSU);
      const dSx = cx + dRatio * radarRadius * Math.cos(dBearing);
      const dSy = cy + dRatio * radarRadius * Math.sin(dBearing);

      ctx.strokeStyle = '#fcd34d';
      ctx.fillStyle = 'rgba(252, 211, 77, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dSx, dSy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fcd34d';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText('DEST', dSx + 8, dSy + 3);
    }

    // 10. Iceberg Radar Blips (with Sweep Afterglow & Hazard Detection)
    let hazardCount = 0;
    if (icebergs && icebergs.length > 0) {
      for (const ice of icebergs) {
        const idx = ice.x - ship.x;
        const idy = ice.y - ship.y;
        const iDist = Math.hypot(idx, idy);
        if (iDist > maxRangeSU * 1.1) continue; // Skip far icebergs

        const iBearing = Math.atan2(idy, idx);
        const iRatio = Math.min(1.0, iDist / maxRangeSU);
        const blipX = cx + iRatio * radarRadius * Math.cos(iBearing);
        const blipY = cy + iRatio * radarRadius * Math.sin(iBearing);

        // Check if blip was recently swept over
        let deltaAngle = (this.radarSweepAngle - iBearing + Math.PI * 2) % (Math.PI * 2);
        let afterglow = 0;
        if (deltaAngle < Math.PI / 3) {
          afterglow = 1.0 - (deltaAngle / (Math.PI / 3));
        }

        // Danger threshold: if distance < 350 SU
        const isDangerous = iDist < 350;
        if (isDangerous) hazardCount++;

        const blipSize = Math.max(4, (ice.collisionRadius || 25) * (radarRadius / maxRangeSU) * 1.5);

        ctx.save();
        const isSar = !!(ice.isSarContact || ice.isSar);
        const isShipContact = ice.classification === 'SHIP';
        const isProjected = !!ice.isProjected;

        if (isDangerous) {
          ctx.fillStyle = isSar ? '#c084fc' : (isShipContact ? '#38bdf8' : '#ef4444');
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10 + afterglow * 8;

          ctx.beginPath();
          if (isSar) {
            // ◇ Diamond symbol for SAR Detected Contact
            ctx.moveTo(blipX, blipY - blipSize - 2);
            ctx.lineTo(blipX + blipSize + 2, blipY);
            ctx.lineTo(blipX, blipY + blipSize + 2);
            ctx.lineTo(blipX - blipSize - 2, blipY);
            ctx.closePath();
          } else if (isShipContact) {
            // ▲ Triangle symbol for Ship Contact
            ctx.moveTo(blipX, blipY - blipSize - 2);
            ctx.lineTo(blipX + blipSize + 2, blipY + blipSize + 2);
            ctx.lineTo(blipX - blipSize - 2, blipY + blipSize + 2);
            ctx.closePath();
          } else {
            // ● Circle symbol for Catalogued USNIC Iceberg
            ctx.arc(blipX, blipY, blipSize + 1, 0, Math.PI * 2);
          }
          ctx.fill();

          // Pulsing Hazard Halo Ring
          ctx.strokeStyle = isSar ? 'rgba(192, 132, 252, 0.8)' : 'rgba(239, 68, 68, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(blipX, blipY, blipSize + 6 + Math.sin(simTimeHours * 1000) * 2, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = isSar ? '#e9d5ff' : '#fca5a5';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          const labelPrefix = isSar ? '◇ SAR' : (isShipContact ? '▲ SHIP' : '● USNIC');
          ctx.fillText(`! ${labelPrefix} ${ice.id || 'HAZARD'} (${Math.round(iDist)}u)`, blipX + blipSize + 4, blipY + 3);
        } else {
          // Normal Phosphor Contact Blip
          const alpha = 0.6 + afterglow * 0.4;
          ctx.fillStyle = isSar ? `rgba(192, 132, 252, ${alpha.toFixed(2)})` : `rgba(74, 222, 128, ${alpha.toFixed(2)})`;
          ctx.shadowColor = isSar ? '#c084fc' : '#4ade80';
          ctx.shadowBlur = 4 + afterglow * 10;

          ctx.beginPath();
          if (isSar) {
            ctx.moveTo(blipX, blipY - blipSize);
            ctx.lineTo(blipX + blipSize, blipY);
            ctx.lineTo(blipX, blipY + blipSize);
            ctx.lineTo(blipX - blipSize, blipY);
            ctx.closePath();
          } else {
            ctx.arc(blipX, blipY, blipSize, 0, Math.PI * 2);
          }
          ctx.fill();

          if (afterglow > 0.3) {
            ctx.fillStyle = isSar ? 'rgba(233, 213, 255, 0.9)' : 'rgba(187, 247, 208, 0.9)';
            ctx.font = '8px "JetBrains Mono", monospace';
            const tag = isSar ? `◇ SAR (${Math.round(iDist)}u)` : `${Math.round(iDist)}u`;
            ctx.fillText(tag, blipX + blipSize + 3, blipY + 3);
          }
        }
        ctx.restore();
      }
    }

    // 11. Center Ship Icon & Heading Line (North-Up PPI Display)
    ctx.save();
    // Ship Center Dot
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ship Heading Vector Line
    const shipHdegRad = (ship.heading * Math.PI) / 180;
    const shipLineX = cx + 35 * Math.cos(shipHdegRad);
    const shipLineY = cy + 35 * Math.sin(shipHdegRad);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(shipLineX, shipLineY);
    ctx.stroke();

    // Bow Arrow Indicator
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(shipLineX, shipLineY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('V-ALPHA', cx, cy + 16);
    ctx.restore();

    ctx.restore(); // Unclip

    // 12. Outer Radar Bezel Ring & Degree Scale
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radarRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Bezel Glow
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, radarRadius + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal Degree Labels around Bezel
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('000° (N)', cx, cy - radarRadius - 14);
    ctx.fillText('180° (S)', cx, cy + radarRadius + 14);
    ctx.textAlign = 'left';
    ctx.fillText('090° (E)', cx + radarRadius + 10, cy);
    ctx.textAlign = 'right';
    ctx.fillText('270° (W)', cx - radarRadius - 10, cy);

    // 13. Radar Header & Live Status Box (Top-Left On-Screen Info — positioned below top overlay bar)
    ctx.save();
    ctx.fillStyle = 'rgba(6, 20, 12, 0.85)';
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(16, 68, 250, 95, 6);
    } else {
      ctx.rect(16, 68, 250, 95);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('📡 PPI RADAR MONITOR', 26, 76);

    ctx.fillStyle = '#a7f3d0';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`MODE: NORTH-UP (2000 SU / 2.0 NM)`, 26, 92);
    ctx.fillText(`SHIP HDG: ${Math.round(ship.heading || 0)}° | SPD: ${(ship.speedKnots || 0).toFixed(1)} kts`, 26, 106);
    ctx.fillText(`CONTACTS: ${(icebergs || []).length} (${hazardCount} HAZARDS)`, 26, 120);
    ctx.fillText(`SWEEP RATE: 30 RPM (1.8 rad/s)`, 26, 134);
    ctx.restore();

    ctx.restore(); // Final Restore
  }
}
