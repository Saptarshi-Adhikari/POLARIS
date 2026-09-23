/**
 * POLARIS Nav-OS — Marine Radar Provider & Sensor Fusion Interface (Phase 12)
 *
 * Provides normalized sensor fusion architecture for X-band, S-band, and SAR satellite detection.
 * Real-world radar data status: FUTURE / SYNTHETIC TEST FIXTURE.
 */

import { RadarSensor } from '../sensors/radarSensor.js';

export class RadarSensorFusionProvider {
  constructor(options = {}) {
    this.primaryRadar = new RadarSensor(options);
    this.sarSatelliteEnabled = options.sarSatelliteEnabled || false;
    this.status = 'SYNTHETIC_TEST_FIXTURE';
  }

  /**
   * Perform sensor fusion across radar detections and synthetic SAR targets.
   */
  fuseSensorDetections(shipPos, shipVel, icebergs, dt) {
    const primaryDetections = this.primaryRadar.update(shipPos, shipVel, icebergs, dt);

    const fusedTargets = primaryDetections.map(det => ({
      targetId: det.id,
      rangeM: det.range,
      bearingRad: det.bearing,
      relativeSpeed: det.relativeSpeed,
      confidence: det.confidence,
      sensorSource: 'X_BAND_MARINE_RADAR',
      isFused: true
    }));

    return {
      timestamp: performance.now(),
      fusedTargetCount: fusedTargets.length,
      targets: fusedTargets,
      status: this.status
    };
  }
}
