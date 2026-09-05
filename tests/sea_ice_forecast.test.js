import { describe, it, expect } from 'vitest';
import { VectorField } from '../src/js/simulation/vectorField.js';

describe('Sea-Ice Trend Forecast Linear Regression', () => {
  const createMockState = (avgConc = 0.5) => ({
    environment: {
      mode: 'PROCEDURAL',
      seaIce: {
        enabled: true,
        averageConcentration: avgConc
      }
    }
  });

  it('computes positive slope and higher +24h prediction for increasing concentration trend', () => {
    const vf = new VectorField(3600, 2400, 80);
    vf.lastState = createMockState(0.3);
    const col = 5;
    const row = 5;
    const x = col * 80 + 40;
    const y = row * 80 + 40;

    // Gentle increasing trend (e.g. +0.005 per hour)
    const samples = [
      { t: 0.0, conc: 0.20 },
      { t: 2.0, conc: 0.21 },
      { t: 4.0, conc: 0.22 },
      { t: 6.0, conc: 0.23 },
      { t: 8.0, conc: 0.24 },
      { t: 10.0, conc: 0.25 }
    ];

    for (let s of samples) {
      vf.recordSeaIceSample(col, row, s.t, s.conc);
    }

    const forecast6 = vf.getSeaIceTrendForecast(x, y, 6);
    const forecast24 = vf.getSeaIceTrendForecast(x, y, 24);

    expect(forecast6.label).toBe('Sea-Ice Trend Forecast');
    expect(forecast24.label).toBe('Sea-Ice Trend Forecast');
    expect(forecast6.slope).toBeGreaterThan(0);
    expect(forecast24.slope).toBeGreaterThan(0);
    expect(forecast24.predicted).toBeGreaterThan(forecast6.predicted);
    expect(forecast24.predicted).toBeLessThanOrEqual(1.0);
  });

  it('computes negative slope and lower +24h prediction for decreasing concentration trend', () => {
    const vf = new VectorField(3600, 2400, 80);
    vf.lastState = createMockState(0.6);
    const col = 8;
    const row = 8;
    const x = col * 80 + 40;
    const y = row * 80 + 40;

    // Gentle decreasing trend (e.g. -0.005 per hour)
    const samples = [
      { t: 0.0, conc: 0.60 },
      { t: 2.0, conc: 0.59 },
      { t: 4.0, conc: 0.58 },
      { t: 6.0, conc: 0.57 },
      { t: 8.0, conc: 0.56 },
      { t: 10.0, conc: 0.55 }
    ];

    for (let s of samples) {
      vf.recordSeaIceSample(col, row, s.t, s.conc);
    }

    const forecast6 = vf.getSeaIceTrendForecast(x, y, 6);
    const forecast24 = vf.getSeaIceTrendForecast(x, y, 24);

    expect(forecast6.slope).toBeLessThan(0);
    expect(forecast24.slope).toBeLessThan(0);
    expect(forecast24.predicted).toBeLessThan(forecast6.predicted);
    expect(forecast24.predicted).toBeGreaterThanOrEqual(0.0);
  });

  it('clamps predictions strictly to [0.0, 1.0]', () => {
    const vf = new VectorField(3600, 2400, 80);
    vf.lastState = createMockState(0.8);
    const col = 2;
    const row = 2;
    const x = col * 80 + 40;
    const y = row * 80 + 40;

    // High concentration with steep positive trend
    vf.recordSeaIceSample(col, row, 1.0, 0.80);
    vf.recordSeaIceSample(col, row, 2.0, 0.95);

    const forecast100 = vf.getSeaIceTrendForecast(x, y, 100);
    expect(forecast100.predicted).toBe(1.0);
  });
});
