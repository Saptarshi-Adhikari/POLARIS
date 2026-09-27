/**
 * POLARIS — Phase 5B Radar CA-CFAR & Signal Processing Test Suite
 */

import { describe, it, expect } from 'vitest';
import {
  RadarPreprocessor,
  CfarRadarDetector,
  createRadarSensorConfig
} from '../src/js/data/RadarPerceptionEngine.js';

describe('POLARIS Phase 5B — CA-CFAR Local Noise Estimation & Range Loss Compensation', () => {

  it('1. Range-dependent normalization is separate from CFAR local noise estimation', () => {
    const preproc = new RadarPreprocessor();
    const config = createRadarSensorConfig({ rangeCompensationEnabled: true, rangeLossReferenceM: 500.0 });

    const rawIntensity = 0.0; // 0 dB
    const comp1 = preproc.applyRangeCompensation(rawIntensity, 500.0, 500.0);
    expect(comp1).toBeCloseTo(0.0, 2);

    const comp2 = preproc.applyRangeCompensation(rawIntensity, 5000.0, 500.0);
    // 10 * log10(5000/500) = 10 dB attenuation adjustment
    expect(comp2).toBeCloseTo(-10.0, 2);
  });

  it('2. CA-CFAR estimates noise from reference cells excluding guard cells', () => {
    const preproc = new RadarPreprocessor();
    const config = createRadarSensorConfig({
      guardCellsRange: 2,
      referenceCellsRange: 5,
      rangeResolution: 10.0,
      noiseFloorDb: -30.0
    });

    const pointTargets = [
      { range: 100, bearing: 0, intensity: 10.0 }, // Target under test (CUT)
      { range: 110, bearing: 0, intensity: -5.0 },  // In Guard cell window (range delta 10m <= 2*10m) -> EXCLUDED from noise estimate
      { range: 140, bearing: 0, intensity: -20.0 }, // In Ref cell window (range delta 40m <= 5*10m) -> INCLUDED in noise estimate
      { range: 150, bearing: 0, intensity: -20.0 }  // In Ref cell window -> INCLUDED
    ];

    const estimatedNoise = preproc.estimateCfarLocalNoise(0, pointTargets, config);
    expect(estimatedNoise).toBeCloseTo(-20.0, 1);
  });

  it('3. CFAR detector outputs simulation-grade detection mask', () => {
    const preproc = new RadarPreprocessor();
    const detector = new CfarRadarDetector();
    const config = createRadarSensorConfig({ detectionThresholdDb: -12.0, cfarScaleFloorDb: 3.0 });

    const rawScan = {
      scanId: 'TEST-SCAN-CFAR',
      timestamp: Date.now(),
      pointTargets: [
        { range: 1000, bearing: 45, intensity: 5.0 },  // Above threshold
        { range: 1000, bearing: 50, intensity: -40.0 } // Below noise floor / threshold
      ]
    };

    const preprocResult = preprocessorScanHelper(preproc, rawScan, config);
    const detectResult = detector.detectObjects(preprocResult, { x: 0, y: 0, heading: 0 });

    expect(detectResult.detections.length).toBe(1);
    expect(detectResult.detectionMethod).toBe('CA_CFAR_BASELINE_SIMULATION_GRADE');
    expect(detectResult.detections[0].confidenceType).toBe('NORMALIZED_DETECTION_SCORE');
  });
});

function preprocessorScanHelper(preproc, rawScan, config) {
  return preproc.preprocessRadarScan(rawScan, config);
}
