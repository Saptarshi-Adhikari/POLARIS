/**
 * POLARIS — Phase 5B AIS & SAR Sensor Association Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AisRadarAssociationEngine,
  SarRadarAssociationEngine,
  AIS_RADAR_ASSOCIATION_STATE,
  SAR_RADAR_ASSOCIATION_STATE,
  createCanonicalRadarObservation
} from '../src/js/data/RadarPerceptionEngine.js';

describe('POLARIS Phase 5B — AIS/Radar & SAR/Radar Association Hardening', () => {
  let aisAssociator;
  let sarAssociator;

  beforeEach(() => {
    aisAssociator = new AisRadarAssociationEngine();
    sarAssociator = new SarRadarAssociationEngine();
  });

  it('1. Perfect AIS/Radar match associates with AIS_RADAR_ASSOCIATED without overwriting AIS truth', () => {
    const aisTrack = { mmsi: 316001234, lat: -68.5, lon: 45.0, worldX: 1000.0, worldY: 1000.0, sog: 12.0, cog: 90.0 };
    const radarTrack = { trackId: 'TRK-RAD-01', position: { worldX: 1010.0, worldY: 1005.0 }, rangeMeters: 500, bearingDegrees: 45, uncertainty: { positionUncertainty: 10.0 } };

    const assoc = aisAssociator.associate([aisTrack], [radarTrack]);

    expect(assoc.length).toBe(1);
    expect(assoc[0].associationState).toBe(AIS_RADAR_ASSOCIATION_STATE.AIS_RADAR_ASSOCIATED);
    expect(assoc[0].aisEvidence.mmsi).toBe(316001234);
    expect(assoc[0].radarEvidence.trackId).toBe('TRK-RAD-01');
  });

  it('2. Radar-only target creates RADAR_ONLY association', () => {
    const radarTrack = { trackId: 'TRK-RAD-SOLO', position: { worldX: 2500.0, worldY: 3000.0 }, rangeMeters: 1200, bearingDegrees: 180, uncertainty: { positionUncertainty: 15.0 } };

    const assoc = aisAssociator.associate([], [radarTrack]);

    expect(assoc.length).toBe(1);
    expect(assoc[0].associationState).toBe(AIS_RADAR_ASSOCIATION_STATE.RADAR_ONLY);
    expect(assoc[0].radarEvidence.trackId).toBe('TRK-RAD-SOLO');
  });

  it('3. AIS-only target creates AIS_ONLY association', () => {
    const aisTrack = { mmsi: 316009999, lat: -68.6, lon: 45.2, worldX: 5000.0, worldY: 5000.0 };

    const assoc = aisAssociator.associate([aisTrack], []);

    expect(assoc.length).toBe(1);
    expect(assoc[0].associationState).toBe(AIS_RADAR_ASSOCIATION_STATE.AIS_ONLY);
    expect(assoc[0].aisEvidence.mmsi).toBe(316009999);
  });

  it('4. SAR/Radar candidate spatial match generates SAR_RADAR_POSSIBLE_ASSOCIATION', () => {
    const sarObs = { observationId: 'SAR-OBS-01', centroid: { worldX: 1000.0, worldY: 1000.0 } };
    const radObs = createCanonicalRadarObservation({ observationId: 'RAD-OBS-01', shipX: 0, shipY: 0, rangeMeters: 1414.2, bearingDegrees: 45.0 }); // world ~ (1000, 1000)

    const matches = sarAssociator.associateSarAndRadar([sarObs], [radObs]);

    expect(matches.length).toBe(1);
    expect(matches[0].associationType).toBe(SAR_RADAR_ASSOCIATION_STATE.SAR_RADAR_PROBABLE_ASSOCIATION);
    expect(matches[0].sarObservationId).toBe('SAR-OBS-01');
    expect(matches[0].radarObservationId).toBe('RAD-OBS-01');
  });
});
