import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { DnvMaritimeSchemaAdapter } from '../src/js/data/DnvMaritimeSchemaAdapter.js';

describe('DNV Maritime Schema Export Adapter', () => {
  it('1. Exports valid DNV Traffic Situation JSON schema structure', () => {
    const engine = new SimulationEngine();
    const adapter = new DnvMaritimeSchemaAdapter();

    const trafficSit = adapter.exportTrafficSituation(engine);

    expect(trafficSit).toBeDefined();
    expect(trafficSit.schemaVersion).toContain('DNV');
    expect(trafficSit.trafficSituationId).toContain('POLARIS_SITUATION');
    expect(Array.isArray(trafficSit.vessels)).toBe(true);
    expect(trafficSit.vessels.length).toBeGreaterThan(0);
    expect(trafficSit.vessels[0].role).toBe('OWN_SHIP');
    expect(Array.isArray(trafficSit.hazards)).toBe(true);
  });

  it('2. Exports valid DNV Situation Output evaluation result JSON', () => {
    const engine = new SimulationEngine();
    const adapter = new DnvMaritimeSchemaAdapter();

    const output = adapter.exportSituationOutput(engine);

    expect(output).toBeDefined();
    expect(output.result).toBeDefined();
    expect(output.result.activeMode).toBe('BALANCED');
    expect(output.result.colavCompliance).toBe('COLREG_COMPLIANT');
  });
});
