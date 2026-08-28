/**
 * POLARIS DIGITAL TWIN - High-DPI Interactive 2D Canvas Renderer
 * Supports: Ship tracking camera, hand-pan viewport, world-space coordinates
 */

export class CanvasRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.width = canvasElement.clientWidth || 1200;
    this.height = canvasElement.clientHeight || 800;

    // ── Camera / Viewport ──────────────────────────────────────────────
    // cameraX/Y = world coords of the top-left corner of the viewport
    this.cameraX = 0;
    this.cameraY = 0;
    this.trackShip = true;        // follow the ship by default
    this.trackLerpFactor = 0.12;  // smooth camera lag
    // Safe-zone: fraction of screen from each edge inside which ship must stay
    this.safeZone = 0.18;

    // ── Hand-pan tool ──────────────────────────────────────────────────
    this.panToolActive = false;
    this.isPanning = false;
    this.panStartMouse  = { x: 0, y: 0 };
    this.panStartCamera = { x: 0, y: 0 };

    // ── World dimensions ─────────────────────────────────────────────
    this.worldWidth  = 3600;
    this.worldHeight = 2400;

    // ── Add-Iceberg placement mode ────────────────────────────────────
    this.addIcebergMode   = false;  // when true, next canvas click places an iceberg
    this.onPlaceIceberg   = null;   // callback(worldX, worldY)
    this.pendingIcebergCfg = { mass: 3.5, size: 550 }; // defaults from panel

    // ── Entity interaction ─────────────────────────────────────────────
    this.selectedEntity = null;
    this.hoveredEntity  = null;
    this.draggedIceberg = null;
    this.dragOffset     = { x: 0, y: 0 };
    this.wavePhase      = 0;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.setupInteraction();
  }

  // ── Canvas resize / HiDPI ─────────────────────────────────────────────
  resizeCanvas() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width  = rect.width  || window.innerWidth;
    this.height = rect.height || window.innerHeight;
    this.canvas.width  = this.width  * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  // ── Pan-tool toggle (called from UI) ─────────────────────────────────
  setPanTool(active) {
    this.panToolActive = active;
    if (active) {
      this.canvas.style.cursor = 'grab';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  // ── Camera helpers ────────────────────────────────────────────────────
  /** Convert a world-space point to canvas (screen) coordinates */
  worldToScreen(wx, wy) {
    return { x: wx - this.cameraX, y: wy - this.cameraY };
  }

  /** Convert canvas (screen) coordinates to world coordinates */
  screenToWorld(sx, sy) {
    return { x: sx + this.cameraX, y: sy + this.cameraY };
  }

  /**
   * Camera tracking with safe-zone guarantee.
   * – If the ship is INSIDE the safe zone: smooth lerp (cinematic).
   * – If the ship is OUTSIDE the safe zone: snap camera instantly so the
   *   ship can never appear off-screen, even at 1000× time warp.
   */
  updateCamera(ship) {
    if (!this.trackShip) return;

    // Where would the ship appear on screen with the CURRENT camera?
    const shipSX = ship.x - this.cameraX;
    const shipSY = ship.y - this.cameraY;

    const marginX = this.width  * this.safeZone;
    const marginY = this.height * this.safeZone;

    const outOfSafeZone =
      shipSX < marginX || shipSX > this.width  - marginX ||
      shipSY < marginY || shipSY > this.height - marginY;

    const targetCamX = ship.x - this.width  / 2;
    const targetCamY = ship.y - this.height / 2;

    if (outOfSafeZone) {
      // Snap: guarantee ship is centred immediately
      this.cameraX = targetCamX;
      this.cameraY = targetCamY;
    } else {
      // Smooth lerp when ship is safely inside the visible zone
      this.cameraX += (targetCamX - this.cameraX) * this.trackLerpFactor;
      this.cameraY += (targetCamY - this.cameraY) * this.trackLerpFactor;
    }

    // Clamp to world bounds
    this.cameraX = Math.max(0, Math.min(this.worldWidth  - this.width,  this.cameraX));
    this.cameraY = Math.max(0, Math.min(this.worldHeight - this.height, this.cameraY));
  }

  // ── Main render ───────────────────────────────────────────────────────
  render(vectorField, ship, icebergs, aiNavigator, simTimeHours, dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.wavePhase += dt * (vectorField.stormMode ? 4 : 1.5);

    // Update camera to follow ship (smooth)
    this.updateCamera(ship);

    // Apply world→screen transform for all drawing
    ctx.save();
    ctx.translate(-this.cameraX, -this.cameraY);

    // 1. Background grid & deep ocean base
    this.drawBackgroundGrid(ctx, vectorField);

    // 2. Wave ripples
    this.drawWaveRipples(ctx, vectorField);

    // 3. Ocean vector current particles & arrows
    this.drawVectorFieldCurrents(ctx, vectorField, simTimeHours);

    // 4. Collision risk heatmap
    this.drawRiskHeatmap(ctx, aiNavigator);

    // 5. AI optimal safe route (Cyber Lime)
    this.drawSafeRoute(ctx, aiNavigator, ship);

    // 6. Iceberg trajectory forecasts
    this.drawIcebergTrajectories(ctx, icebergs);

    // 7. Icebergs
    this.drawIcebergs(ctx, icebergs);

    // 8. Vessel V-ALPHA
    this.drawShip(ctx, ship);

    // 9. Storm weather effects
    if (vectorField.stormMode) {
      this.drawStormOverlay(ctx);
    }

    ctx.restore();

    // ── HUD overlays (screen space – drawn AFTER restore) ──────────────
    this.drawHUD(ctx, ship);
  }

  // ── HUD (always screen-space, not affected by camera) ─────────────────
  drawHUD(ctx, ship) {
    // Ship tracking indicator (top-right mini badge)
    ctx.save();
    const badgeX = this.width - 16;
    const badgeY = 60;
    ctx.font      = '10px "JetBrains Mono"';
    ctx.textAlign = 'right';

    if (this.trackShip) {
      ctx.fillStyle = 'rgba(164,214,76,0.9)';
      ctx.fillText('⦿ TRACKING V-ALPHA', badgeX, badgeY);
    } else {
      ctx.fillStyle = 'rgba(136,147,148,0.7)';
      ctx.fillText('○ FREE CAM', badgeX, badgeY);
    }

    // Pan-tool indicator
    if (this.panToolActive) {
      ctx.fillStyle = 'rgba(161,239,248,0.9)';
      ctx.fillText('✋ PAN MODE', badgeX, badgeY + 16);
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── Background & grid ─────────────────────────────────────────────────
  drawBackgroundGrid(ctx, vectorField) {
    ctx.save();

    // Fill world canvas
    ctx.fillStyle = '#0b1326';
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // Grid lines across the full world
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.05)';
    ctx.lineWidth = 1;
    const spacing = vectorField.gridSpacing;

    for (let x = 0; x < this.worldWidth; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.worldHeight);
      ctx.stroke();
    }
    for (let y = 0; y < this.worldHeight; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.worldWidth, y);
      ctx.stroke();
    }

    // Latitude & Longitude labels
    ctx.fillStyle = 'rgba(136, 147, 148, 0.5)';
    ctx.font = '10px "JetBrains Mono"';
    for (let x = 100; x < this.worldWidth; x += 300) {
      const lonStr = (72.821 + (x / 1000) * 0.8).toFixed(3) + '°E';
      ctx.fillText(lonStr, x, this.cameraY + 18);
    }
    for (let y = 100; y < this.worldHeight; y += 200) {
      const latStr = (-64.382 - (y / 1000) * 0.5).toFixed(3) + '°S';
      ctx.fillText(latStr, this.cameraX + 15, y);
    }

    ctx.restore();
  }

  // ── Wave ripples ──────────────────────────────────────────────────────
  drawWaveRipples(ctx, vectorField) {
    ctx.save();
    ctx.strokeStyle = vectorField.stormMode
      ? 'rgba(255, 180, 171, 0.15)'
      : 'rgba(165, 243, 252, 0.06)';
    ctx.lineWidth = 1.5;

    const waveLines = 16;
    const gap       = this.worldHeight / waveLines;

    for (let i = 0; i < waveLines; i++) {
      const baseY = i * gap + (this.wavePhase * 10) % gap;
      ctx.beginPath();
      for (let x = 0; x < this.worldWidth; x += 40) {
        const waveAmp = vectorField.waveHeight * 4.0;
        const waveY   = baseY + Math.sin(x * 0.015 + this.wavePhase + i) * waveAmp;
        if (x === 0) ctx.moveTo(x, waveY);
        else         ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Vector-field current arrows ───────────────────────────────────────
  drawVectorFieldCurrents(ctx, vectorField, simTimeHours) {
    ctx.save();

    // Particles
    for (let p of vectorField.particles) {
      const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.5;
      ctx.fillStyle = `rgba(165, 243, 252, ${alpha})`;
      ctx.fillRect(p.x, p.y, 2, 2);
    }

    // Grid vector arrows — only draw those visible in viewport
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.2)';
    ctx.fillStyle   = 'rgba(165, 243, 252, 0.3)';
    ctx.lineWidth   = 1;

    const step = vectorField.gridSpacing * 2;
    const startX = Math.floor(this.cameraX / step) * step;
    const startY = Math.floor(this.cameraY / step) * step;
    const endX   = this.cameraX + this.width  + step;
    const endY   = this.cameraY + this.height + step;

    for (let y = startY; y < endY; y += step) {
      for (let x = startX; x < endX; x += step) {
        const vel   = vectorField.getVelocityAt(x, y, simTimeHours);
        const len   = Math.min(24, vel.speed * 8);
        const angle = Math.atan2(vel.v, vel.u);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(len, 0);
        ctx.lineTo(len - 4, -3);
        ctx.lineTo(len - 4,  3);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    }

    ctx.restore();
  }

  // ── Risk heatmap ──────────────────────────────────────────────────────
  drawRiskHeatmap(ctx, aiNavigator) {
    ctx.save();
    const { rows, cols, cellW, cellH } = aiNavigator;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const risk = aiNavigator.riskGrid[r][c];
        if (risk > 0.15) {
          const cx   = c * cellW + cellW / 2;
          const cy   = r * cellH + cellH / 2;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellW * 1.2);

          if (risk > 0.6) {
            grad.addColorStop(0, `rgba(255, 114, 114, ${risk * 0.4})`);
            grad.addColorStop(1, 'rgba(255, 114, 114, 0)');
          } else {
            grad.addColorStop(0, `rgba(255, 183, 131, ${risk * 0.3})`);
            grad.addColorStop(1, 'rgba(255, 183, 131, 0)');
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, cellW * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // ── Safe route ────────────────────────────────────────────────────────
  drawSafeRoute(ctx, aiNavigator, ship) {
    if (!aiNavigator.optimalRoute || aiNavigator.optimalRoute.length < 2) return;

    ctx.save();
    const pts = aiNavigator.optimalRoute;

    ctx.shadowColor = 'rgba(164, 214, 76, 0.8)';
    ctx.shadowBlur  = 10;
    ctx.strokeStyle = '#a4d64c';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      ctx.fillStyle = '#a4d64c';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, i === pts.length - 1 ? 6 : 3, 0, Math.PI * 2);
      ctx.fill();

      if (i === pts.length - 1) {
        ctx.strokeStyle = '#a4d64c';
        ctx.lineWidth   = 1.5;
        ctx.shadowBlur  = 0;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#a4d64c';
        ctx.font      = '10px "JetBrains Mono"';
        ctx.shadowBlur = 0;
        ctx.fillText('DEST // TARGET', pt.x + 20, pt.y + 4);
      }
    }

    ctx.restore();
  }

  // ── Iceberg trajectories ──────────────────────────────────────────────
  drawIcebergTrajectories(ctx, icebergs) {
    ctx.save();

    for (let ice of icebergs) {
      if (!ice.trajectoryForecast || ice.trajectoryForecast.length === 0) continue;

      ctx.strokeStyle  = ice.isSelected ? 'rgba(255, 180, 171, 0.9)' : 'rgba(165, 243, 252, 0.5)';
      ctx.lineWidth    = 1.5;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(ice.x, ice.y);
      for (let f of ice.trajectoryForecast) {
        ctx.lineTo(f.x, f.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      for (let f of ice.trajectoryForecast) {
        ctx.fillStyle = ice.isSelected ? '#ffb4ab' : '#a1eff8';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
        ctx.fill();

        if (ice.isSelected) {
          ctx.fillStyle = 'rgba(255, 180, 171, 0.9)';
          ctx.font      = '9px "JetBrains Mono"';
          ctx.fillText(`+${f.hour}h`, f.x + 6, f.y - 4);
        }
      }
    }

    ctx.restore();
  }

  // ── Icebergs ──────────────────────────────────────────────────────────
  drawIcebergs(ctx, icebergs) {
    ctx.save();

    for (let ice of icebergs) {
      ctx.save();
      ctx.translate(ice.x, ice.y);
      ctx.rotate((ice.heading * Math.PI) / 180);

      const r = Math.max(10, ice.size / 35);

      if (ice.isSelected || ice === this.hoveredEntity) {
        ctx.strokeStyle = ice.isSelected ? '#ffb4ab' : '#a1eff8';
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(-r - 8, -r - 8, r * 2 + 16, r * 2 + 16);
      }

      ctx.fillStyle   = ice.isSelected ? 'rgba(255, 180, 171, 0.25)' : 'rgba(165, 243, 252, 0.2)';
      ctx.strokeStyle = ice.isSelected ? '#ffb4ab' : 'rgba(165, 243, 252, 0.8)';
      ctx.lineWidth   = 1.5;

      ctx.beginPath();
      ctx.moveTo( 0,       -r);
      ctx.lineTo( r * 0.8, -r * 0.3);
      ctx.lineTo( r * 0.9,  r * 0.7);
      ctx.lineTo(-r * 0.4,  r);
      ctx.lineTo(-r * 0.9,  r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = ice.isSelected ? '#ffb4ab' : '#a1eff8';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      ctx.fillStyle = ice.isSelected ? '#ffb4ab' : 'rgba(165, 243, 252, 0.9)';
      ctx.font      = '10px "JetBrains Mono"';
      ctx.fillText(`${ice.name}`, ice.x + r + 10, ice.y - 2);

      const speedKnots = (Math.hypot(ice.vx, ice.vy) / 1.8).toFixed(1);
      ctx.fillStyle    = 'rgba(136, 147, 148, 0.8)';
      ctx.font         = '9px "JetBrains Mono"';
      ctx.fillText(`${speedKnots} kts // ${ice.mass}Mt`, ice.x + r + 10, ice.y + 10);

      if (ice.manualTarget) {
        ctx.strokeStyle = '#ffb4ab';
        ctx.lineWidth   = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(ice.x, ice.y);
        ctx.lineTo(ice.manualTarget.x, ice.manualTarget.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  // ── Ship ──────────────────────────────────────────────────────────────
  drawShip(ctx, ship) {
    ctx.save();
    ctx.translate(ship.x, ship.y);

    // Pulsing radar ring
    const scanR     = 30 + (this.wavePhase * 25) % 50;
    const scanAlpha = Math.max(0, 1 - scanR / 80);
    ctx.strokeStyle = `rgba(164, 214, 76, ${scanAlpha})`;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(0, 0, scanR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate((ship.heading * Math.PI) / 180);

    ctx.fillStyle  = '#a4d64c';
    ctx.shadowColor = 'rgba(164, 214, 76, 0.8)';
    ctx.shadowBlur  = 12;

    ctx.beginPath();
    ctx.moveTo( 18,   0);   // Bow
    ctx.lineTo(-12, -10);   // Starboard
    ctx.lineTo( -8,   0);   // Engine notch
    ctx.lineTo(-12,  10);   // Port
    ctx.closePath();
    ctx.fill();

    // Heading vector
    ctx.strokeStyle = '#a4d64c';
    ctx.lineWidth   = 2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(50, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // Labels (still in world space but not rotated)
    ctx.fillStyle  = '#a4d64c';
    ctx.font       = 'bold 11px "JetBrains Mono"';
    ctx.shadowColor = 'rgba(164, 214, 76, 0.6)';
    ctx.shadowBlur  = 6;
    ctx.fillText(`${ship.name}`, ship.x + 22, ship.y - 6);

    ctx.fillStyle  = '#dae2fd';
    ctx.font       = '10px "JetBrains Mono"';
    ctx.shadowBlur = 0;
    ctx.fillText(`${ship.speedKnots.toFixed(1)} kts`, ship.x + 22, ship.y + 8);
  }

  // ── Storm overlay ─────────────────────────────────────────────────────
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

  // ── Interaction setup ─────────────────────────────────────────────────
  setupInteraction() {
    this.canvas.addEventListener('mousedown',  (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove',  (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup',    (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', ()  => this.handleMouseUp());
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  bindEntitiesGetter(getIcebergs, getShip) {
    this.getIcebergs = getIcebergs;
    this.getShip     = getShip;
  }

  // ── Mouse handlers ────────────────────────────────────────────────────
  handleMouseDown(e) {
    const screenPos = this.getMousePos(e);
    const worldPos  = this.screenToWorld(screenPos.x, screenPos.y);

    // ── Add-Iceberg placement mode ────────────────────────────────────
    if (this.addIcebergMode) {
      if (this.onPlaceIceberg) {
        this.onPlaceIceberg(worldPos.x, worldPos.y, this.pendingIcebergCfg);
      }
      return; // don't fall through to selection / pan
    }

    // ── Pan tool: start dragging viewport ─────────────────────────────
    if (this.panToolActive) {
      this.isPanning        = true;
      this.panStartMouse    = { x: screenPos.x, y: screenPos.y };
      this.panStartCamera   = { x: this.cameraX, y: this.cameraY };
      this.trackShip        = false;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // ── Iceberg picking (in world coords) ─────────────────────────────
    if (!this.getIcebergs) return;
    const icebergs = this.getIcebergs();

    let clickedIceberg = null;
    for (let ice of icebergs) {
      const dist = Math.hypot(worldPos.x - ice.x, worldPos.y - ice.y);
      const hitR = Math.max(25, ice.size / 25);
      if (dist < hitR) {
        clickedIceberg = ice;
        break;
      }
    }

    for (let ice of icebergs) ice.isSelected = false;

    if (clickedIceberg) {
      clickedIceberg.isSelected  = true;
      clickedIceberg.isDragging  = true;
      this.selectedEntity        = clickedIceberg;
      this.draggedIceberg        = clickedIceberg;
      this.dragOffset = {
        x: worldPos.x - clickedIceberg.x,
        y: worldPos.y - clickedIceberg.y
      };
      if (this.onSelectIceberg) this.onSelectIceberg(clickedIceberg);
    } else {
      this.selectedEntity = null;
      if (this.onSelectIceberg) this.onSelectIceberg(null);
    }
  }

  handleMouseMove(e) {
    const screenPos = this.getMousePos(e);
    const worldPos  = this.screenToWorld(screenPos.x, screenPos.y);

    // ── Pan viewport ──────────────────────────────────────────────────
    if (this.isPanning) {
      const dx = screenPos.x - this.panStartMouse.x;
      const dy = screenPos.y - this.panStartMouse.y;
      this.cameraX = Math.max(0, Math.min(
        this.worldWidth  - this.width,
        this.panStartCamera.x - dx
      ));
      this.cameraY = Math.max(0, Math.min(
        this.worldHeight - this.height,
        this.panStartCamera.y - dy
      ));
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // ── Iceberg drag (world-space) ────────────────────────────────────
    if (this.draggedIceberg && this.draggedIceberg.isDragging) {
      this.draggedIceberg.x = worldPos.x - this.dragOffset.x;
      this.draggedIceberg.y = worldPos.y - this.dragOffset.y;
      if (typeof this.draggedIceberg.updateLatLon === 'function') {
        this.draggedIceberg.updateLatLon();
      }
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // ── Hover detection ───────────────────────────────────────────────
    if (!this.getIcebergs) return;
    const icebergs = this.getIcebergs();

    let foundHover = false;
    for (let ice of icebergs) {
      const dist = Math.hypot(worldPos.x - ice.x, worldPos.y - ice.y);
      if (dist < Math.max(25, ice.size / 25)) {
        this.hoveredEntity = ice;
        this.canvas.style.cursor = 'pointer';
        foundHover = true;
        break;
      }
    }

    if (!foundHover) {
      this.hoveredEntity = null;
      if (this.addIcebergMode) {
        this.canvas.style.cursor = 'cell';
      } else if (this.panToolActive) {
        this.canvas.style.cursor = 'grab';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
    }
  }

  handleMouseUp() {
    // End panning
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.panToolActive ? 'grab' : 'crosshair';
    }

    // End iceberg drag
    if (this.draggedIceberg) {
      this.draggedIceberg.isDragging = false;
      this.draggedIceberg = null;
    }
  }
}
