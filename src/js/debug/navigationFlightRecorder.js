/**
 * ASTRALIS Nav-OS — Navigation Flight Recorder
 *
 * Captures high-frequency structured navigation snapshots & discrete events
 * into a bounded ring buffer for offline JSON export and live telemetry.
 */

export class NavigationFlightRecorder {
  constructor(options = {}) {
    this.enabled = false;
    this.samples = [];
    this.events = [];
    this.maxSamples = options.maxSamples || 3600; // ~15 minutes at 4 Hz
    this.sampleIntervalMs = options.sampleIntervalMs || 250; // 4 Hz rate limit
    this.lastSampleTime = 0;
    this.sessionId = null;
    this.sessionStartTime = 0;
    this.lastRouteId = null;
    this.lastGuidanceMode = null;
  }

  start() {
    this.enabled = true;
    this.sessionId = `session_${Date.now()}`;
    this.sessionStartTime = performance.now();
    this.recordEvent('session_started', { sessionId: this.sessionId });
  }

  stop() {
    if (this.enabled) {
      this.recordEvent('session_stopped', { sessionId: this.sessionId, sampleCount: this.samples.length });
    }
    this.enabled = false;
  }

  clear() {
    this.samples = [];
    this.events = [];
    this.lastRouteId = null;
    this.lastGuidanceMode = null;
  }

  recordEvent(type, details = {}) {
    const event = {
      timestamp_ms: Date.now(),
      simulation_time_ms: performance.now() - (this.sessionStartTime || performance.now()),
      type,
      route_id: details.route_id || this.lastRouteId || 'none',
      details
    };
    this.events.push(event);
    if (this.events.length > 1000) {
      this.events.shift(); // Bound event log
    }
  }

  recordSample(snapshot) {
    if (!this.enabled) return;

    const now = performance.now();
    if (now - this.lastSampleTime < this.sampleIntervalMs) {
      return; // Enforce 4 Hz rate limit
    }
    this.lastSampleTime = now;

    // Detect state change events
    if (snapshot.route && snapshot.route.id !== this.lastRouteId) {
      this.recordEvent('route_id_changed', { previousRouteId: this.lastRouteId, nextRouteId: snapshot.route.id });
      this.lastRouteId = snapshot.route.id;
    }
    if (snapshot.guidance && snapshot.guidance.mode !== this.lastGuidanceMode) {
      this.recordEvent('guidance_mode_changed', { previousMode: this.lastGuidanceMode, nextMode: snapshot.guidance.mode });
      this.lastGuidanceMode = snapshot.guidance.mode;
    }

    this.samples.push(snapshot);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift(); // Bounded ring buffer
    }
  }

  getSummary() {
    return {
      enabled: this.enabled,
      sessionId: this.sessionId,
      totalSamples: this.samples.length,
      totalEvents: this.events.length,
      lastRouteId: this.lastRouteId,
      lastGuidanceMode: this.lastGuidanceMode
    };
  }

  exportJson() {
    const exportData = {
      version: '1.0.0',
      sessionId: this.sessionId,
      exportTimestamp: new Date().toISOString(),
      summary: this.getSummary(),
      events: this.events,
      samples: this.samples
    };
    return JSON.stringify(exportData, null, 2);
  }
}
