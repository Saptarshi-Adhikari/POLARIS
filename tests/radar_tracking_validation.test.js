/**
 * POLARIS — Phase 5B Radar Target Tracker Lifecycle Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RadarTargetTracker,
  createCanonicalRadarObservation,
  RADAR_TRACK_STATUS
} from '../src/js/data/RadarPerceptionEngine.js';

describe('POLARIS Phase 5B — Radar Target Tracker State Machine & Uncertainty Growth', () => {
  let tracker;

  beforeEach(() => {
    tracker = new RadarTargetTracker();
  });

  it('1. Regular detection transitions track to FRESH', () => {
    const obs = createCanonicalRadarObservation({ observationId: 'TRK-100', rangeMeters: 1000, bearingDegrees: 45 });
    const now = 100000;
    const tracks = tracker.updateTracks([obs], now);

    expect(tracks.length).toBe(1);
    expect(tracks[0].state).toBe(RADAR_TRACK_STATUS.FRESH);
    expect(tracks[0].observationCount).toBe(1);
  });

  it('2. Missed scan (1000ms < dt <= 3000ms) transitions track to PREDICTED', () => {
    const obs = createCanonicalRadarObservation({ observationId: 'TRK-100', rangeMeters: 1000, bearingDegrees: 45 });
    const t0 = 100000;
    tracker.updateTracks([obs], t0);

    // Update at t0 + 1500ms without new observations
    const t1 = t0 + 1500;
    const tracks = tracker.updateTracks([], t1);

    expect(tracks.length).toBe(1);
    expect(tracks[0].state).toBe(RADAR_TRACK_STATUS.PREDICTED);
  });

  it('3. Prolonged missed scan (3000ms < dt <= 10000ms) transitions track to STALE with uncertainty growth', () => {
    const obs = createCanonicalRadarObservation({ observationId: 'TRK-100', rangeMeters: 1000, bearingDegrees: 45 });
    const t0 = 100000;
    tracker.updateTracks([obs], t0);
    const initialUncertainty = tracker.getActiveTracks()[0].uncertainty.positionUncertainty;

    // Update at t0 + 4000ms without new observations
    const t1 = t0 + 4000;
    const tracks = tracker.updateTracks([], t1);

    expect(tracks.length).toBe(1);
    expect(tracks[0].state).toBe(RADAR_TRACK_STATUS.STALE);
    expect(tracks[0].uncertainty.positionUncertainty).toBeGreaterThan(initialUncertainty);
  });

  it('4. Track age > 10000ms expires and is pruned from active tracks', () => {
    const obs = createCanonicalRadarObservation({ observationId: 'TRK-100', rangeMeters: 1000, bearingDegrees: 45 });
    const t0 = 100000;
    tracker.updateTracks([obs], t0);

    // Update at t0 + 11000ms
    const t1 = t0 + 11000;
    const tracks = tracker.updateTracks([], t1);

    expect(tracks.length).toBe(0);
    expect(tracker.getActiveTracks().length).toBe(0);
  });

  it('5. Reappearance of track resets state to FRESH and updates position centroid', () => {
    const obs1 = createCanonicalRadarObservation({ observationId: 'TRK-100', rangeMeters: 1000, bearingDegrees: 45, shipX: 0, shipY: 0, shipHeadingDeg: 0 });
    const t0 = 100000;
    tracker.updateTracks([obs1], t0);

    // Miss scan at t0 + 2000
    tracker.updateTracks([], t0 + 2000);

    // Reappear at t0 + 3500
    const obs2 = createCanonicalRadarObservation({ observationId: 'TRK-100', rangeMeters: 1050, bearingDegrees: 45, shipX: 0, shipY: 0, shipHeadingDeg: 0 });
    const tracks = tracker.updateTracks([obs2], t0 + 3500);

    expect(tracks.length).toBe(1);
    expect(tracks[0].state).toBe(RADAR_TRACK_STATUS.FRESH);
    expect(tracks[0].observationCount).toBe(2);
  });
});
