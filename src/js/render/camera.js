/**
 * Centralized Camera — viewport only, never modifies simulation state.
 * World space is authoritative (3600 x 2400).
 */

export const WORLD_WIDTH  = 3600;
export const WORLD_HEIGHT = 2400;

export class Camera {
  constructor(viewportWidth = 1200, viewportHeight = 800) {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.25;
    this.maxZoom = 4;
    this.defaultZoom = 1;

    this.viewportWidth  = viewportWidth;
    this.viewportHeight = viewportHeight;

    this.followShip = true;
    this.followLerp = 0.12;
    this.safeZone = 0.18;

    // 3D / Perspective Camera Controls
    this.is3D = false;
    this.pitch = 0; // pitch in degrees (0 = 2D top-down, 55 = 3D perspective)
    this.heading = 0; // rotation/yaw in degrees
    this.targetPitch = 0;
    this.targetHeading = 0;
  }

  setViewport(w, h) {
    this.viewportWidth  = w;
    this.viewportHeight = h;
    this.clampToWorld();
  }

  setMode3D(enabled) {
    this.is3D = !!enabled;
    this.targetPitch = this.is3D ? 55 : 0;
    this.targetHeading = this.is3D ? 0 : 0;
  }

  toggle3D() {
    this.setMode3D(!this.is3D);
    return this.is3D;
  }

  updateCameraTransition() {
    // Smooth interpolation for pitch and heading
    if (Math.abs(this.pitch - this.targetPitch) > 0.01) {
      this.pitch += (this.targetPitch - this.pitch) * 0.15;
    } else {
      this.pitch = this.targetPitch;
    }
    if (Math.abs(this.heading - this.targetHeading) > 0.01) {
      this.heading += (this.targetHeading - this.heading) * 0.15;
    } else {
      this.heading = this.targetHeading;
    }
  }

  /** Visible world-space width/height at current zoom */
  get visibleWidth()  { return this.viewportWidth  / this.zoom; }
  get visibleHeight() { return this.viewportHeight / this.zoom; }

  /** Check if a world-space point (with optional radius margin) is inside visible viewport */
  isVisible(wx, wy, margin = 0) {
    return (
      wx + margin >= this.x &&
      wx - margin <= this.x + this.visibleWidth &&
      wy + margin >= this.y &&
      wy - margin <= this.y + this.visibleHeight
    );
  }

  /** World → screen (CSS pixels) with 3D perspective transformation */
  worldToScreen(wx, wy) {
    const rawX = (wx - this.x) * this.zoom;
    const rawY = (wy - this.y) * this.zoom;

    if (this.pitch === 0 && this.heading === 0) {
      return { x: rawX, y: rawY };
    }

    const cx = this.viewportWidth / 2;
    const cy = this.viewportHeight / 2;
    let dx = rawX - cx;
    let dy = rawY - cy;

    // Apply Heading / Yaw rotation
    if (this.heading !== 0) {
      const radH = (-this.heading * Math.PI) / 180;
      const cosH = Math.cos(radH);
      const sinH = Math.sin(radH);
      const rx = dx * cosH - dy * sinH;
      const ry = dx * sinH + dy * cosH;
      dx = rx;
      dy = ry;
    }

    // Apply Pitch / Tilt foreshortening
    if (this.pitch !== 0) {
      const radP = (this.pitch * Math.PI) / 180;
      const cosP = Math.cos(radP);
      dy = dy * cosP;
    }

    return { x: cx + dx, y: cy + dy };
  }

  /** Screen (CSS pixels) → world with inverse 3D perspective transformation */
  screenToWorld(sx, sy) {
    if (this.pitch === 0 && this.heading === 0) {
      return {
        x: sx / this.zoom + this.x,
        y: sy / this.zoom + this.y
      };
    }

    const cx = this.viewportWidth / 2;
    const cy = this.viewportHeight / 2;
    let dx = sx - cx;
    let dy = sy - cy;

    // Inverse Pitch / Tilt
    if (this.pitch !== 0) {
      const radP = (this.pitch * Math.PI) / 180;
      const cosP = Math.cos(radP);
      if (Math.abs(cosP) > 0.001) dy = dy / cosP;
    }

    // Inverse Heading / Yaw
    if (this.heading !== 0) {
      const radH = (this.heading * Math.PI) / 180;
      const cosH = Math.cos(radH);
      const sinH = Math.sin(radH);
      const rx = dx * cosH - dy * sinH;
      const ry = dx * sinH + dy * cosH;
      dx = rx;
      dy = ry;
    }

    const rawX = cx + dx;
    const rawY = cy + dy;

    return {
      x: rawX / this.zoom + this.x,
      y: rawY / this.zoom + this.y
    };
  }

  /** Clamp camera so the viewport stays inside world bounds */
  clampToWorld() {
    const maxX = Math.max(0, WORLD_WIDTH  - this.visibleWidth);
    const maxY = Math.max(0, WORLD_HEIGHT - this.visibleHeight);
    this.x = Math.max(0, Math.min(maxX, this.x));
    this.y = Math.max(0, Math.min(maxY, this.y));
  }

  /** Cursor-centered zoom — world point under cursor stays fixed */
  zoomAt(screenX, screenY, newZoom) {
    const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    if (clamped === this.zoom) return;

    const worldBefore = this.screenToWorld(screenX, screenY);
    this.zoom = clamped;
    this.x = worldBefore.x - screenX / this.zoom;
    this.y = worldBefore.y - screenY / this.zoom;
    this.clampToWorld();
  }

  /** Pan by screen-pixel delta */
  panByScreenDelta(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clampToWorld();
  }

  /** Center camera on a world point */
  centerOn(wx, wy) {
    this.x = wx - this.visibleWidth  / 2;
    this.y = wy - this.visibleHeight / 2;
    this.clampToWorld();
  }

  /** Smooth follow-ship with safe-zone guarantee */
  updateFollow(ship) {
    if (!this.followShip) return;

    const shipSX = (ship.x - this.x) * this.zoom;
    const shipSY = (ship.y - this.y) * this.zoom;

    const marginX = this.viewportWidth  * this.safeZone;
    const marginY = this.viewportHeight * this.safeZone;

    const outOfSafe =
      shipSX < marginX || shipSX > this.viewportWidth  - marginX ||
      shipSY < marginY || shipSY > this.viewportHeight - marginY;

    const targetX = ship.x - this.visibleWidth  / 2;
    const targetY = ship.y - this.visibleHeight / 2;

    if (outOfSafe) {
      this.x = targetX;
      this.y = targetY;
    } else {
      this.x += (targetX - this.x) * this.followLerp;
      this.y += (targetY - this.y) * this.followLerp;
    }
    this.clampToWorld();
  }

  /** Apply camera transform to a 2D canvas context (world-space drawing) */
  applyTransform(ctx) {
    this.updateCameraTransition();

    if (this.pitch !== 0 || this.heading !== 0) {
      const cx = this.viewportWidth / 2;
      const cy = this.viewportHeight / 2;
      ctx.translate(cx, cy);
      if (this.pitch !== 0) {
        const radP = (this.pitch * Math.PI) / 180;
        ctx.scale(1, Math.cos(radP));
      }
      if (this.heading !== 0) {
        ctx.rotate((this.heading * Math.PI) / 180);
      }
      ctx.translate(-cx, -cy);
    }

    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = this.defaultZoom;
    this.followShip = true;
    this.is3D = false;
    this.pitch = 0;
    this.heading = 0;
    this.targetPitch = 0;
    this.targetHeading = 0;
    this.clampToWorld();
  }
}
