/**
 * POLARIS Real Replay Engine
 * Controls deterministic historical replay clock, playback speed multiplier, and timestamp stepping.
 */

export class RealReplayEngine {
  constructor(provider) {
    this.provider = provider;
    this.isPlaying = true;
    this.speedMultiplier = 1.0;
    this.simTimeHours = 14.0; // Start at 14:00 UTC
    this.baseTimeUTC = new Date('2026-03-15T12:00:00Z').getTime();
  }

  setProvider(provider) {
    this.provider = provider;
  }

  play() {
    this.isPlaying = true;
  }

  pause() {
    this.isPlaying = false;
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }

  setSpeed(multiplier) {
    this.speedMultiplier = Math.max(0.25, Math.min(10.0, Number(multiplier) || 1.0));
  }

  reset() {
    this.simTimeHours = 14.0;
  }

  update(dtSeconds) {
    if (!this.isPlaying) return;
    const dtHours = (dtSeconds * this.speedMultiplier) / 3600.0;
    this.simTimeHours += dtHours;
  }

  getFormattedTimestampUTC() {
    const elapsedMs = (this.simTimeHours - 14.0) * 3600 * 1000;
    const currentDate = new Date(this.baseTimeUTC + elapsedMs);
    return currentDate.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }

  getCurrentState() {
    const hazards = this.provider ? this.provider.getHazards(this.simTimeHours) : [];
    const env = this.provider ? this.provider.getEnvironment(this.simTimeHours) : null;
    const vesselObs = this.provider ? this.provider.getVesselObservation(this.simTimeHours) : null;

    return {
      simTimeHours: this.simTimeHours,
      timestampUTC: this.getFormattedTimestampUTC(),
      hazards,
      environment: env,
      vesselObservation: vesselObs,
      metadata: this.provider ? this.provider.getMetadata() : null
    };
  }
}
