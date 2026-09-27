import { describe, it, expect } from 'vitest';
import { DifferentiationEngine } from '../src/js/ai/DifferentiationEngine.js';
import { SimulationEngine } from '../src/js/main.js';

describe('POLARIS Differentiation Engine & 30-Capability Audit Suite', () => {
  it('1. Registry contains exactly 30 capabilities', () => {
    const engine = new DifferentiationEngine(null);
    expect(engine.registry.length).toBe(30);
  });

  it('2. Every capability has valid required fields', () => {
    const engine = new DifferentiationEngine(null);
    engine.registry.forEach(c => {
      expect(c.id).toBeGreaterThanOrEqual(1);
      expect(c.id).toBeLessThanOrEqual(30);
      expect(typeof c.name).toBe('string');
      expect(['IMPLEMENTED', 'PARTIAL', 'EXPERIMENTAL', 'RESEARCH_ONLY', 'NOT_IMPLEMENTED']).toContain(c.status);
      expect(typeof c.implementationModule).toBe('string');
      expect(Array.isArray(c.inputs)).toBe(true);
      expect(Array.isArray(c.outputs)).toBe(true);
      expect(typeof c.tests).toBe('string');
      expect(typeof c.demoScenario).toBe('string');
      expect(typeof c.realDataStatus).toBe('string');
      expect(c.confidence).toBeGreaterThan(0);
      expect(typeof c.limitations).toBe('string');
    });
  });

  it('3. Closed-loop audit returns 14 sequential operational steps', () => {
    const simEngine = new SimulationEngine();
    const diffEngine = new DifferentiationEngine(simEngine);
    const audit = diffEngine.executeClosedLoopAudit();

    expect(audit.loopSteps.length).toBe(14);
    expect(audit.loopSteps[0].name).toBe('OBSERVE');
    expect(audit.loopSteps[13].name).toBe('VERIFY AGAIN');
    expect(audit.summary.totalCapabilities).toBe(30);
    expect(audit.summary.implementationPercentage).toBeGreaterThanOrEqual(90);
  });
});
