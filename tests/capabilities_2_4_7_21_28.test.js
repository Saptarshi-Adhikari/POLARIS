import { describe, it, expect } from 'vitest';
import { icebergMLPredictor } from '../src/js/ml/icebergMLPredictor.js';
import { openDriftProvider } from '../src/js/providers/OpenDriftReferenceProvider.js';
import { curvatureSmoother } from '../src/js/pathfinding/CurvatureConstrainedSmoother.js';
import { hybridForecaster } from '../src/js/ai/HybridIcebergForecaster.js';
import { adaptiveCalibrationEngine } from '../src/js/ai/AdaptiveCalibrationEngine.js';

describe('POLARIS — Capabilities #2, #4, #7, #21, #28 Implementation Verification', () => {

  it('Capability #2: ML Short-Term Trajectory Forecasting & Uncertainty', () => {
    const mockIceberg = { id: 'ice_001', x: 400, y: 1800, vx: 2.5, vy: -1.2 };
    const mockEnv = { wind: { speed: 45, direction: 220 }, ocean: { currentSpeed: 2.0, currentDirection: 130 } };

    const predictions = icebergMLPredictor.predictTrajectory(mockIceberg, null, mockEnv);
    expect(predictions.length).toBe(4); // +2h, +6h, +12h, +24h

    const h24 = predictions.find(p => p.horizonHours === 24);
    expect(h24).toBeDefined();
    expect(h24.hybridX).toBeGreaterThan(0);
    expect(h24.uncertaintyRadius).toBeGreaterThan(10.0);
    expect(h24.confidence).toBeGreaterThanOrEqual(0.40);
  });

  it('Capability #4: Actual OpenDrift Reference Provider & Trajectory Schema', () => {
    const mockIceberg = { id: 'ice_001', x: 500, y: 1200 };
    const mockEnv = { wind: { speed: 40, direction: 240 }, ocean: { currentSpeed: 1.8, currentDirection: 120 } };

    const ref = openDriftProvider.getOpenDriftTrajectory(mockIceberg, mockEnv, 24);
    expect(ref).toBeDefined();
    expect(ref.source).toBe('OPENDRIFT_REFERENCE');
    expect(ref.model).toBe('OpenBerg-v2.4');
    expect(ref.trajectory.length).toBe(13); // 0h to 24h step 2h
    expect(ref.trajectory[0].x).toBe(500);
  });

  it('Capability #7: Curvature-Constrained Route Smoothing & Safety Validation', () => {
    const waypoints = [
      { x: 100, y: 100 },
      { x: 500, y: 100 }, // Sharp 90-degree corner
      { x: 500, y: 600 }
    ];
    const vessel = { speedKnots: 15.0, maxYawRate: 0.15 };
    const hazards = [];

    const result = curvatureSmoother.smoothRoute(waypoints, vessel, hazards);
    expect(result.isSmoothed).toBe(true);
    expect(result.validationPassed).toBe(true);
    expect(result.smoothedWaypoints.length).toBeGreaterThan(waypoints.length);
    expect(result.minRadius).toBeGreaterThan(15.0);

    // Obstacle Safety Fallback Check: Add hazard directly at arc tangent
    const blockingHazards = [{ x: 450, y: 150, collisionRadius: 50 }];
    const fallbackResult = curvatureSmoother.smoothRoute(waypoints, vessel, blockingHazards);
    expect(fallbackResult.isSmoothed).toBe(false);
    expect(fallbackResult.validationPassed).toBe(false);
    expect(fallbackResult.fallbackReason).toBe('SAFETY_VALIDATION_FAILED');
  });

  it('Capability #21: Hybrid Physical + Data-Driven Forecasting & Fusion', () => {
    const mockIceberg = { id: 'ice_001', x: 600, y: 1400, vx: 1.8, vy: -0.9 };
    const mockEnv = { wind: { speed: 30, direction: 180 }, ocean: { currentSpeed: 1.5, currentDirection: 90 } };

    const hybrid = hybridForecaster.forecastHybridTrajectory(mockIceberg, mockEnv, 24);
    expect(hybrid).toBeDefined();
    expect(hybrid.horizons.length).toBeGreaterThan(0);
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(hybrid.overallAgreement);
    expect(hybrid.openDriftReference).toBeDefined();
  });

  it('Capability #28: Adaptive Learning & Online EWMA Prediction Error Calibration', () => {
    adaptiveCalibrationEngine.reset();
    expect(adaptiveCalibrationEngine.uncertaintyScaleFactor).toBe(1.0);

    // Observe an error higher than baseline
    adaptiveCalibrationEngine.observePredictionError(100, 100, 120, 100, 24); // 20 SU error
    const summary = adaptiveCalibrationEngine.getCalibrationSummary();

    expect(summary.sampleCount).toBe(1);
    expect(summary.ewmaErrorMeanSU).toBeGreaterThan(5.0);
    expect(summary.uncertaintyScaleFactor).toBeGreaterThan(1.0);
    expect(summary.activeModelVersion).toBe('v1.0.0');
  });
});
