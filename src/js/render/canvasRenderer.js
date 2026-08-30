/**
 * POLARIS DIGITAL TWIN - High-DPI Interactive 2D Canvas Renderer
 * Camera is viewport-only; all simulation entities live in world space.
 */

import { Camera, WORLD_WIDTH, WORLD_HEIGHT } from './camera.js';



export const PlanningMode = {
  NONE: 'NONE',
  SET_START: 'SET_START',
  SET_DESTINATION: 'SET_DESTINATION'
};

export class CanvasRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.width = canvasElement.clientWidth || 1200;
    this.height = canvasElement.clientHeight || 800;

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

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.setupInteraction();
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
    const dpr  = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width  = rect.width  || window.innerWidth;
    this.height = rect.height || window.innerHeight;
    this.canvas.width  = this.width  * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.setViewport(this.width, this.height);
  }

  render(vectorField, ship, icebergs, aiNavigator, simTimeHours, dt, state) {
    const ctx = this.ctx;
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.wavePhase += dt * (vectorField.stormMode ? 4 : 1.5);

    this.camera.updateFollow(ship);

    // Calculate transition factor t (zoomed out globe overview)
    const t = Math.max(0, Math.min(1, (0.45 - this.camera.zoom) / 0.20));

    if (t < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      this.camera.applyTransform(ctx);

      try { this.drawBackgroundGrid(ctx, vectorField); } catch(e) { console.warn("drawBackgroundGrid failed", e); }
      try { this.drawWaveRipples(ctx, vectorField); } catch(e) { console.warn("drawWaveRipples failed", e); }
      try { this.drawVectorFieldCurrents(ctx, vectorField, simTimeHours, dt); } catch(e) { console.warn("drawVectorFieldCurrents failed", e); }

      if (vectorField.lastState && vectorField.lastState.environment.seaIce.enabled) {
        try { this.drawSeaIce(ctx, vectorField); } catch(e) { console.warn("drawSeaIce failed", e); }
      }

      try { this.drawProbabilisticRiskMap(ctx); } catch(e) { console.warn("drawProbabilisticRiskMap failed", e); }
      try { this.drawRiskHeatmap(ctx, aiNavigator); } catch(e) { console.warn("drawRiskHeatmap failed", e); }
      try { this.drawNavMarkers(ctx); } catch(e) { console.warn("drawNavMarkers failed", e); }
      try { this.drawSafeRoute(ctx, aiNavigator, ship); } catch(e) { console.warn("drawSafeRoute failed", e); }
      try { this.drawIcebergTrajectories(ctx, icebergs); } catch(e) { console.warn("drawIcebergTrajectories failed", e); }
      try { this.drawIcebergs(ctx, icebergs); } catch(e) { console.warn("drawIcebergs failed", e); }
      try { this.drawShip(ctx, ship); } catch(e) { console.warn("drawShip failed", e); }
      try { this.drawValidationOverlays(ctx); } catch(e) { console.warn("drawValidationOverlays failed", e); }

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
    
    // Draw Antarctic central landmass (stylized)
    ctx.fillStyle = 'rgba(218, 226, 253, 0.15)';
    ctx.beginPath();
    ctx.arc(ScX, ScY, Rg * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(218, 226, 253, 0.3)';
    ctx.stroke();

    // Title
    ctx.fillStyle = '#a1eff8';
    ctx.font = 'bold 12px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.fillText('POLAR ORTHOGRAPHIC PROJECTION', ScX, ScY - Rg - 15);
    
    // Draw projected destinations, route, ship, and icebergs
    if (this.startPoint) {
      const gPt = this.worldToGlobe(this.startPoint.x, this.startPoint.y);
      ctx.fillStyle = '#a4d64c';
      ctx.beginPath(); ctx.arc(gPt.x, gPt.y, 5, 0, Math.PI * 2); ctx.fill();
    }
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
    if (this.startPoint) {
      this.drawMarker(ctx, this.startPoint.x, this.startPoint.y, '#a4d64c', 'START', true);
    }
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

    ctx.fillStyle = '#131b2e';
    ctx.strokeStyle = '#3f494a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, this.worldHeight - 200);
    ctx.bezierCurveTo(400, this.worldHeight - 250, 800, this.worldHeight - 150, 1200, this.worldHeight - 300);
    ctx.bezierCurveTo(1800, this.worldHeight - 400, 2400, this.worldHeight - 200, this.worldWidth, this.worldHeight - 350);
    ctx.lineTo(this.worldWidth, this.worldHeight);
    ctx.lineTo(0, this.worldHeight);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.worldWidth - 600, 0);
    ctx.bezierCurveTo(this.worldWidth - 550, 200, this.worldWidth - 400, 400, this.worldWidth - 200, 600);
    ctx.bezierCurveTo(this.worldWidth - 50, 700, this.worldWidth, 750, this.worldWidth, 800);
    ctx.lineTo(this.worldWidth, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();

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
    const step = 180;
    const startX = Math.floor(this.camera.x / step) * step;
    const startY = Math.floor(this.camera.y / step) * step;
    const endX = this.camera.x + this.camera.visibleWidth + step;
    const endY = this.camera.y + this.camera.visibleHeight + step;
    for (let y = startY; y < endY; y += step) {
      for (let x = startX; x < endX; x += step) {
        const conc = vectorField.getSeaIceConcentration(x, y);
        if (conc < 0.08) continue;
        const radius = step * 0.7;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, `rgba(210, 235, 255, ${conc * 0.20})`);
        grad.addColorStop(0.6, `rgba(200, 225, 250, ${conc * 0.10})`);
        grad.addColorStop(1, 'rgba(190, 215, 245, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
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

  drawSafeRoute(ctx, aiNavigator, ship) {
    this.drawHypotheticalRoute(ctx);
    if (!ship.routeWaypoints || ship.routeWaypoints.length === 0) return;
    ctx.save();
    const remaining = ship.routeWaypoints.slice(ship.waypointIndex);
    if (remaining.length === 0) { ctx.restore(); return; }

    const pts = [{ x: ship.x, y: ship.y }, ...remaining];
    const icebergs = this.getIcebergs ? this.getIcebergs() : [];

    ctx.lineWidth = Math.max(2.0, 3 / this.camera.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([8 / this.camera.zoom, 6 / this.camera.zoom]);

    let shipSpeed = 20.0;
    const currentSpeed = Math.hypot(ship.vx, ship.vy);
    if (currentSpeed > 5.0) {
      shipSpeed = currentSpeed;
    } else {
      const state = window.simEngine && window.simEngine.state;
      const throttle = ship.throttle || 65;
      const maxSpd = (state && state.vessel && state.vessel.maxSpeed) || 30.0;
      shipSpeed = maxSpd * Math.sqrt(throttle / 100);
    }

    let accumulatedDistance = 0;

    for (let i = 1; i < pts.length; i++) {
      const ptA = pts[i - 1];
      const ptB = pts[i];

      // Safeguard: Ensure points are finite world coordinates
      if (!Number.isFinite(ptA.x) || !Number.isFinite(ptA.y) || !Number.isFinite(ptB.x) || !Number.isFinite(ptB.y)) {
        continue;
      }

      let isCritical = false;
      const dx = ptB.x - ptA.x;
      const dy = ptB.y - ptA.y;
      const segLen = Math.hypot(dx, dy);
      const segLen2 = dx * dx + dy * dy;

      const numSamples = Math.max(3, Math.ceil(segLen / 40));
      for (let k = 0; k <= numSamples; k++) {
        const ratio = k / numSamples;
        const sx = ptA.x + ratio * dx;
        const sy = ptA.y + ratio * dy;
        const sampleDist = accumulatedDistance + ratio * segLen;
        const etaSample = sampleDist / (3600 * shipSpeed);

        for (let ice of icebergs) {
          const icePos = ice.getPositionAt(etaSample);
          // Physical collision boundary only — no soft margin
          const hardR = ice.collisionRadius + 15;
          
          if (Math.hypot(icePos.x - sx, icePos.y - sy) < hardR) {
            isCritical = true;
            break;
          }
        }
        if (isCritical) break;
      }

      // 2. Sample risk check using RiskIntelligenceEngine
      if (!isCritical) {
        const samples = 3;
        const ri = window.simEngine && window.simEngine.riskIntelligenceEngine;
        if (ri) {
          for (let s = 0; s <= samples; s++) {
            const sx = ptA.x + (s / samples) * dx;
            const sy = ptA.y + (s / samples) * dy;
            const riskObj = ri.getRiskAt(sx, sy);
            if (riskObj && riskObj.risk > 0.6) {
              isCritical = true;
              break;
            }
          }
        }
      }

      ctx.strokeStyle = isCritical ? '#ef4444' : '#fcd34d';
      accumulatedDistance += segLen;

      ctx.beginPath();
      ctx.moveTo(ptA.x, ptA.y);
      ctx.lineTo(ptB.x, ptB.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    const r = Math.max(4, 5 / this.camera.zoom);
    for (let i = 0; i < pts.length; i++) {
      if (i === 0 || i === pts.length - 1) {
        ctx.fillStyle = i === 0 ? (aiNavigator.riskScore > 0.65 ? '#ef4444' : '#fcd34d') : '#fcd34d';
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, i === pts.length - 1 ? r : r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawHypotheticalRoute(ctx) {
    const cs = window.simEngine && window.simEngine.counterfactualSimulator;
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
    ctx.save();
    for (let ice of icebergs) {
      const isML = !!(ice.mlTrajectory && ice.mlTrajectory.length > 0);
      const points = isML ? ice.mlTrajectory : ice.trajectoryForecast;

      if (!points || points.length === 0) continue;

      ctx.strokeStyle = isML 
        ? 'rgba(236, 72, 153, 0.8)' 
        : (ice.isSelected ? 'rgba(255, 180, 171, 0.9)' : 'rgba(165, 243, 252, 0.4)');
      
      ctx.lineWidth = isML ? 2 : 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(ice.x, ice.y);
      for (let f of points) ctx.lineTo(f.x, f.y);
      ctx.stroke(); ctx.setLineDash([]);

      // Draw uncertainty ellipses if toggled
      const showUncertainty = document.getElementById('conf-chk-show-uncertainty')?.checked !== false;
      if (showUncertainty) {
        const cie = window.simEngine && window.simEngine.confidenceIntelligenceEngine;
        const u6 = cie ? cie.icebergConfidence.uncertainty6 : 15;
        const u12 = cie ? cie.icebergConfidence.uncertainty12 : 30;
        const u24 = cie ? cie.icebergConfidence.uncertainty24 : 60;

        for (let f of points) {
          const h = f.hour || f.time;
          let radius = isML ? (f.uncertainty || 12) : (f.hour * 2.5);
          if (h === 6 || h === 30) radius = u6;
          else if (h === 12 || h === 60) radius = u12;
          else if (h === 24 || h === 120) radius = u24;

          ctx.fillStyle = isML ? 'rgba(236, 72, 153, 0.08)' : 'rgba(165, 243, 252, 0.05)';
          ctx.strokeStyle = isML ? 'rgba(236, 72, 153, 0.25)' : 'rgba(165, 243, 252, 0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      for (let f of points) {

        ctx.fillStyle = isML 
          ? '#f472b6' 
          : (ice.isSelected ? '#ffb4ab' : '#a1eff8');
        ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '8px "JetBrains Mono"';
        const labelText = isML ? `+${f.time}m (ML)` : `+${f.hour}h`;
        ctx.fillText(labelText, f.x + 6, f.y + 3);
      }
    }
    ctx.restore();
  }

  drawIcebergs(ctx, icebergs) {
    ctx.save();
    for (let ice of icebergs) {
      ctx.save();
      ctx.translate(ice.x, ice.y);
      ctx.rotate((ice.heading * Math.PI) / 180);
      const r = Math.max(10, ice.size / 35);
      if (ice.isSelected || ice === this.hoveredEntity) {
        ctx.strokeStyle = '#a4d64c'; ctx.lineWidth = 1;
        ctx.strokeRect(-r - 8, -r - 8, r * 2 + 16, r * 2 + 16);
      }
      
      // Seeded random for shape perturbation based on iceberg id
      let seed = ice.id;
      const rand = () => {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };
      
      const p1 = -0.1 + rand() * 0.2;
      const p2 = -0.15 + rand() * 0.3;
      const p3 = -0.1 + rand() * 0.2;
      const p4 = -0.2 + rand() * 0.3;
      const p5 = -0.15 + rand() * 0.2;

      const shade = 215 + Math.floor(rand() * 40); // 215 to 255
      const color = ice.isSelected ? '#ffffff' : `rgb(${shade - 15}, ${shade}, 253)`;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.moveTo(2, -r * (1 + p1) + 2); 
      ctx.lineTo(r * (0.8 + p2) + 2, -r * (0.3 + p3) + 2);
      ctx.lineTo(r * (0.9 + p4) + 2, r * (0.7 + p5) + 2); 
      ctx.lineTo(-r * (0.4 + p1) + 2, r * (1 + p2) + 2);
      ctx.lineTo(-r * (0.9 + p3) + 2, r * (0.2 + p4) + 2); 
      ctx.closePath(); 
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -r * (1 + p1)); 
      ctx.lineTo(r * (0.8 + p2), -r * (0.3 + p3));
      ctx.lineTo(r * (0.9 + p4), r * (0.7 + p5)); 
      ctx.lineTo(-r * (0.4 + p1), r * (1 + p2));
      ctx.lineTo(-r * (0.9 + p3), r * (0.2 + p4)); 
      ctx.closePath(); 
      ctx.fill();

      // Debug collision circle
      const dbgHud = document.getElementById('debug-hud');
      if (dbgHud && !dbgHud.classList.contains('hidden')) {
        ctx.strokeStyle = 'rgba(255, 114, 114, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, ice.collisionRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(164, 214, 76, 0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, ice.collisionRadius + 15 + 30, 0, Math.PI * 2); // Avoidance radius
        ctx.stroke();
      }

      ctx.restore();
    }
    ctx.restore();
  }

  drawShip(ctx, ship) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate((ship.heading * Math.PI) / 180);
    if (ship.speedKnots > 2.0) {
      const wakeLength = Math.min(60, ship.speedKnots * 2);
      const wakeSpread = Math.min(20, ship.speedKnots * 0.8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(-10 - wakeLength, -wakeSpread);
      ctx.lineTo(-10 - wakeLength - 10, 0); ctx.lineTo(-10 - wakeLength, wakeSpread);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(22, 2); ctx.lineTo(-12, -8); ctx.lineTo(-14, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d95a2b';
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(-12, -10); ctx.lineTo(-14, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-8, -4, 12, 8);
    ctx.fillStyle = '#3f494a'; ctx.fillRect(-4, -5, 4, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(60, 0); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Inter"';
    ctx.fillText(ship.name, ship.x + 22, ship.y - 6);

    // Debug collision circle
    const dbgHud = document.getElementById('debug-hud');
    if (dbgHud && !dbgHud.classList.contains('hidden')) {
      ctx.save();
      ctx.strokeStyle = 'rgba(164, 214, 76, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, ship.collisionRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
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
    this.canvas.addEventListener('mousedown',  (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove',  (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup',    (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', ()  => this.handleMouseUp());
    this.canvas.addEventListener('wheel',      (e) => this.handleWheel(e), { passive: false });
    window.addEventListener('keydown',   (e) => { if (e.code === 'Space') { this.spaceHeld = true; e.preventDefault(); } });
    window.addEventListener('keyup',     (e) => { if (e.code === 'Space') this.spaceHeld = false; });
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
    const screenPos = this.getMousePos(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.camera.zoomAt(screenPos.x, screenPos.y, this.camera.zoom * factor);
    this.camera.followShip = false;
  }

  handleMouseDown(e) {
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
    if (!foundHover) {
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
    const valEngine = window.simEngine && window.simEngine.validationEngine;
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
}
