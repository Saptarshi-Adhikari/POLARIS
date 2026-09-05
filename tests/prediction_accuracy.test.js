import { describe, test, expect } from 'vitest';
import { IcebergPredictionTracker } from '../src/js/ai/icebergPredictionTracker.js';

describe('Part 2 — Prediction Accuracy Tracker (Iceberg)', () => {
  test('logs prediction and correctly evaluates Euclidean error at target sim time', () => {
    const tracker = new IcebergPredictionTracker();
    
    // Log prediction for Iceberg #101 made at simTime = 1.0h for +2.0h horizon (targetSimTime = 3.0h)
    tracker.recordPrediction(101, 1.0, 2.0, 500.0, 600.0);
    expect(tracker.predictionBuffer.length).toBe(1);
    expect(tracker.evaluatedErrors.length).toBe(0);

    // Update at simTime = 2.0h (target time 3.0h not reached yet)
    tracker.update(2.0, [{ id: 101, x: 500, y: 600 }]);
    expect(tracker.predictionBuffer.length).toBe(1);
    expect(tracker.evaluatedErrors.length).toBe(0);

    // Update at simTime = 3.0h (target time reached). Actual position is (530.0, 640.0)
    // Expected Euclidean distance = Math.hypot(30, 40) = 50.0 SU
    tracker.update(3.0, [{ id: 101, x: 530.0, y: 640.0 }]);
    
    expect(tracker.predictionBuffer.length).toBe(0);
    expect(tracker.evaluatedErrors.length).toBe(1);
    
    const lastError = tracker.getLastError();
    expect(lastError.icebergId).toBe(101);
    expect(lastError.errorSU).toBe(50.0);
    expect(tracker.getAverageError()).toBe(50.0);
  });
});
