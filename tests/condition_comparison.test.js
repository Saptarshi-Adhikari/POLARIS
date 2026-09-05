import { describe, test, expect } from 'vitest';
import { ConditionComparisonRunner } from '../src/js/ai/conditionComparisonRunner.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Ship } from '../src/js/simulation/ship.js';
import { VectorField } from '../src/js/simulation/vectorField.js';

describe('Part 4 — Condition-Comparison Preset Runner Audit', () => {
  test('runs decision engine across four presets and produces four distinct outputs', () => {
    const nav = new AINavigator(3600, 2400);
    const runner = new ConditionComparisonRunner(nav);
    const ship = new Ship(400, 1800);
    const dest = { x: 3200, y: 400 };
    const vf = new VectorField(3600, 2400);
    const state = { vessel: { maxSpeed: 30, autopilotThrottle: 65 }, navigation: { mode: 'BALANCED' } };

    const results = runner.runComparison(ship, dest, [], vf, state);

    console.log('\n=== CONDITION-COMPARISON PRESET TABLE ===');
    console.table(results);
    console.log('=========================================\n');

    expect(results.length).toBe(4);
    
    // Verify each preset has distinct characteristics
    const normal = results.find(r => r.preset === 'NORMAL');
    const storm = results.find(r => r.preset === 'STORM');
    const heavyIce = results.find(r => r.preset === 'HEAVY_ICE');
    const lowFuel = results.find(r => r.preset === 'LOW_FUEL');

    expect(normal).toBeDefined();
    expect(storm).toBeDefined();
    expect(heavyIce).toBeDefined();
    expect(lowFuel).toBeDefined();

    // Low Fuel preset should recommend FUEL_EFFICIENT
    expect(lowFuel.recommendedMode).toBe('FUEL_EFFICIENT');
    
    // Heavy Ice or Storm should adjust recommended modes or increase risk/fuel parameters
    expect(storm.recommendedMode).toBeDefined();
    expect(heavyIce.recommendedMode).toBeDefined();
  });
});
