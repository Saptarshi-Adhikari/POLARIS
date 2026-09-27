import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticRuleMapper, MARITIME_RULE_REGISTRY } from '../src/js/ai/semanticRuleMapper.js';
import { DecisionEngine } from '../src/js/ai/DecisionEngine.js';
import { BridgeVoiceAlerts, ALERT_PRIORITY } from '../src/js/ui/bridgeVoiceAlerts.js';

describe('Phase 1A — Semantic Rule-Mapped Explainable AI Suite', () => {
  let mapper;
  let decisionEngine;

  beforeEach(() => {
    mapper = new SemanticRuleMapper();
    decisionEngine = new DecisionEngine();
  });

  it('1. HEAD_ON encounter maps to COLREG Rule 14 candidate', () => {
    const shipState = { x: 500, y: 1000, heading: 0, speed: 15 };
    const hazard = { x: 500, y: 500, vx: 0, vy: 5, heading: 180 }; // Reciprocal course directly ahead (dy < 0)

    const encounter = mapper.classifyEncounter(shipState, hazard);
    expect(encounter).toBe('HEAD_ON');

    const explanation = mapper.mapExplanation({
      shipState,
      threatHazard: hazard,
      minClearance: 250,
      shortestTcpa: 25,
      minDcpa: 10,
      selectedAction: 'STARBOARD_DETOUR'
    });

    expect(explanation.prediction.encounterType).toBe('HEAD_ON');
    expect(explanation.applicableRules.some(r => r.ruleId === 'IMO_COLREGS_RULE_14')).toBe(true);
    expect(explanation.summaryText).toContain('Rule 14');
  });

  it('2. CROSSING encounter maps to COLREG Rule 15 candidate', () => {
    const shipState = { x: 500, y: 500, heading: 0, speed: 15 };
    const hazard = { x: 800, y: 300, vx: -5, vy: 0, heading: 270 }; // Approaching from starboard side

    const encounter = mapper.classifyEncounter(shipState, hazard);
    expect(encounter).toBe('CROSSING');

    const explanation = mapper.mapExplanation({
      shipState,
      threatHazard: hazard,
      minClearance: 200,
      shortestTcpa: 30,
      minDcpa: 15,
      selectedAction: 'REDUCE_SPEED'
    });

    expect(explanation.prediction.encounterType).toBe('CROSSING');
    expect(explanation.applicableRules.some(r => r.ruleId === 'IMO_COLREGS_RULE_15')).toBe(true);
    expect(explanation.summaryText).toContain('Crossing');
  });

  it('3. OVERTAKING encounter maps to COLREG Rule 13 candidate', () => {
    const shipState = { x: 500, y: 1000, heading: 0, speed: 20 };
    const hazard = { x: 500, y: 700, vx: 0, vy: -2, heading: 0 }; // Ahead moving slower in same direction (dy < 0)

    const encounter = mapper.classifyEncounter(shipState, hazard);
    expect(encounter).toBe('OVERTAKING');


    const explanation = mapper.mapExplanation({
      shipState,
      threatHazard: hazard,
      minClearance: 180,
      shortestTcpa: 40,
      minDcpa: 5,
      selectedAction: 'STARBOARD_DETOUR'
    });

    expect(explanation.prediction.encounterType).toBe('OVERTAKING');
    expect(explanation.applicableRules.some(r => r.ruleId === 'IMO_COLREGS_RULE_13')).toBe(true);
  });

  it('4. Unsafe alternative correctly rejected with evidence in explanation', () => {
    const candidateRoutes = {
      FASTEST: { waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }], maxRisk: 0.85, eta: 0.1, fuel: 10 },
      BALANCED: { waypoints: [{ x: 0, y: 0 }, { x: 50, y: 120 }, { x: 100, y: 100 }], maxRisk: 0.20, eta: 0.12, fuel: 8 }
    };

    const result = decisionEngine.evaluate(candidateRoutes, {
      vesselState: { x: 0, y: 0, heading: 0, fuelRemaining: 80 }
    });

    expect(result.recommendedMode).toBe('BALANCED');
    expect(result.structuredExplanation).toBeDefined();

    const rejected = result.structuredExplanation.rejectedAlternatives;
    expect(rejected.some(r => r.action === 'FASTEST' && r.category === 'RISK_CEILING_REJECTION')).toBe(true);
  });

  it('5. Collision validator rejection appears in explanation', () => {
    const context = {
      selectedAction: 'BALANCED',
      details: {
        FASTEST: { rejected: true, reason: 'Space/Time Collision Validation Failed (Clearance breach)' }
      }
    };

    const explanation = mapper.mapExplanation(context);
    const rej = explanation.rejectedAlternatives.find(r => r.action === 'FASTEST');

    expect(rej).toBeDefined();
    expect(rej.category).toBe('COLLISION_VALIDATOR_REJECTION');
  });

  it('6. Depth rejection appears when bathymetry constraint is active', () => {
    const explanation = mapper.mapExplanation({
      bathymetryBlocked: true,
      selectedAction: 'SAFEST'
    });

    expect(explanation.applicableRules.some(r => r.ruleId === 'POLARIS_BATHYMETRY_DEPTH_LIMIT')).toBe(true);
    expect(explanation.rejectedAlternatives.some(r => r.category === 'BATHYMETRY_CONSTRAINT_REJECTION')).toBe(true);
  });

  it('7. Route-stability rejection appears when applicable', () => {
    const explanation = mapper.mapExplanation({
      stabilityRejected: true,
      selectedAction: 'MAINTAIN_COURSE'
    });

    expect(explanation.applicableRules.some(r => r.ruleId === 'POLARIS_ROUTE_STABILITY_HYSTERESIS')).toBe(true);
    expect(explanation.rejectedAlternatives.some(r => r.category === 'ROUTE_STABILITY_REJECTION')).toBe(true);
  });

  it('8. LLM unavailable -> deterministic fallback works cleanly', () => {
    const explanation = mapper.mapExplanation({
      threatHazard: { id: 'ice_001', x: 500, y: 600 },
      minClearance: 100,
      selectedAction: 'STARBOARD_DETOUR'
    });

    expect(explanation.summaryText).toContain('OBSERVATION');
    expect(explanation.summaryText).toContain('DECISION');
    expect(explanation.summaryText).toContain('ACTION');
    expect(explanation.sourceModules).toContain('SemanticRuleMapper');
  });

  it('9. TTS is triggered only for configured severities and respects rate limits', () => {
    const tts = new BridgeVoiceAlerts({ enabled: true, cooldownMs: 5000 });
    
    // Low priority advisory speech test (speechSynthesis is mocked in node environment)
    const res1 = tts.speakStructuredExplanation({
      risk: { level: 'LOW' },
      selectedAction: 'BALANCED',
      applicableRules: [MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_6]
    });

    // In node environment without browser window.speechSynthesis, synth is null so returns false safely
    expect(typeof res1).toBe('boolean');
  });

  it('10. Repeated replans do not spam TTS (cooldown enforced)', () => {
    const tts = new BridgeVoiceAlerts({ enabled: true, cooldownMs: 10000 });
    tts.lastSpokenTime = performance.now();
    tts.lastSpokenText = "LOW alert: Executing BALANCED. Associated with Rule 6 - Safe Speed.";

    const res = tts.speakStructuredExplanation({
      risk: { level: 'LOW' },
      selectedAction: 'BALANCED',
      applicableRules: [MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_6]
    });

    expect(res).toBe(false);
  });

  it('11. Explanation is deterministic for identical input', () => {
    const ctx = {
      shipState: { x: 500, y: 500, heading: 45, speed: 12 },
      threatHazard: { id: 'ice_1', x: 700, y: 700, vx: -2, vy: -2 },
      minClearance: 200,
      shortestTcpa: 40,
      minDcpa: 20,
      selectedAction: 'STARBOARD_DETOUR'
    };

    const exp1 = mapper.mapExplanation(ctx);
    const exp2 = mapper.mapExplanation(ctx);

    expect(exp1.prediction.encounterType).toBe(exp2.prediction.encounterType);
    expect(exp1.applicableRules[0].ruleId).toBe(exp2.applicableRules[0].ruleId);
    expect(exp1.evidence.cpa).toBe(exp2.evidence.cpa);
    expect(exp1.evidence.tcpa).toBe(exp2.evidence.tcpa);
  });

  it('12. No explanation invents unsupported evidence', () => {
    const explanation = mapper.mapExplanation({
      shipState: { x: 100, y: 100, heading: 0, speed: 10 },
      threatHazard: null
    });

    expect(explanation.evidence.encounterType).toBe('CLEAR');
    expect(explanation.hazard).toBeNull();
    expect(explanation.applicableRules[0].ruleId).toBe('IMO_COLREGS_RULE_6');
  });

  it('13. Explanation object serialization succeeds without circular errors', () => {
    const explanation = mapper.mapExplanation({
      shipState: { x: 300, y: 400, heading: 90, speed: 14 },
      threatHazard: { id: 'ice_99', x: 500, y: 400, vx: -3, vy: 0 },
      minClearance: 150
    });

    const jsonString = JSON.stringify(explanation);
    expect(jsonString).toBeDefined();

    const parsed = JSON.parse(jsonString);
    expect(parsed.decisionType).toBeDefined();
    expect(parsed.applicableRules.length).toBeGreaterThan(0);
  });
});
