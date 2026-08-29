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
  }

  setViewport(w, h) {
    this.viewportWidth  = w;
    this.viewportHeight = h;
    this.clampToWorld();
  }

  /** Visible world-space width/height at current zoom */
  get visibleWidth()  { return this.viewportWidth  / this.zoom; }
  get visibleHeight() { return this.viewportHeight / this.zoom; }

  /** World → screen (CSS pixels) */
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom
    };
  }

  /** Screen (CSS pixels) → world */
  screenToWorld(sx, sy) {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y
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
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = this.defaultZoom;
    this.followShip = true;
    this.clampToWorld();
  }
}
