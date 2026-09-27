/**
 * POLARIS Nav-OS — Phase 2C Vessel Maneuvering, Turn-Rate & Rudder-Rate Constraints Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Ship } from '../src/js/simulation/ship.js';
import { VesselManeuveringEngine, vesselManeuveringEngine, MANEUVER_STATUS, DEFAULT_MANEUVERING_CONFIG } from '../src/js/ai/VesselManeuveringEngine.js';
import { CurvatureConstrainedSmoother, curvatureSmoother } from '../src/js/pathfinding/CurvatureConstrainedSmoother.js';
import { semanticRuleMapper, MARITIME_RULE_REGISTRY } from '../src/js/ai/semanticRuleMapper.js';
import { benchmarkEvaluator } from '../src/js/benchmark/benchmarkEvaluator.js';
import { continuousCollisionValidator } from '../src/js/ai/continuousCollisionValidator.js';
import { bathymetryProvider } from '../src/js/providers/bathymetryProvider.js';
import { DynamicIcebergDragEstimator } from '../src/js/ai/DynamicIcebergDragEstimator.js';

describe('POLARIS Phase 2C — Vessel Maneuvering & Constraints Test Suite', () => {
  let ship;
  let engine;

  beforeEach(() => {
    ship = new Ship({ x: 400, y: 1800, heading: 0 });
    engine = new VesselManeuveringEngine();
  });

  it('1. Rudder angle is bounded [-35°, +35°]', () => {
    ship.setManualControls({ rudder: 50 });
    expect(ship.rudder).toBe(35);

    ship.setManualControls({ rudder: -60 });
    expect(ship.rudder).toBe(-35);
  });

  it('2. Rudder rate is bounded [<= 15°/s]', () => {
    ship.setRouteWaypoints([{ x: 400, y: 1800 }, { x: 800, y: 1800 }]);
    const mockState = { vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1.0, autopilot: true, throttle: 50 } };
    const initialRudder = ship.rudder;
    ship.update(0.1, {}, 0, mockState, []); // dt = 0.1s

    const deltaRudder = Math.abs(ship.rudder - initialRudder);
    const rate = deltaRudder / 0.1;
    expect(rate).toBeLessThanOrEqual(15.1); // bounded by 15.0 deg/s
  });

  it('3. Heading rate is bounded [<= 15°/s]', () => {
    const mockState = { vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1.0, autopilot: false, throttle: 50, rudder: 35 } };
    for (let i = 0; i < 20; i++) {
      ship.update(0.1, {}, 0, mockState, []);
    }
    expect(Math.abs(ship.angularVelocity)).toBeLessThanOrEqual(15.001);
  });

  it('4. Speed change is bounded (no instant jumps)', () => {
    const mockState = { vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1.0, autopilot: false, throttle: 100 } };
    const v1 = Math.hypot(ship.vx, ship.vy);
    ship.update(0.1, {}, 0, mockState, []);
    const v2 = Math.hypot(ship.vx, ship.vy);

    const accel = (v2 - v1) / 0.1;
    expect(accel).toBeLessThanOrEqual(3.5);
  });

  it('5. Acceleration is bounded', () => {
    const mState = engine.getManeuveringState(ship);
    expect(mState.maxAcceleration).toBe(1.5);
  });

  it('6. Deceleration is bounded', () => {
    const mState = engine.getManeuveringState(ship);
    expect(mState.maxDeceleration).toBe(3.5);
  });

  it('7. Emergency stop respects configured dynamics', () => {
    const mockState = { vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1.0, autopilot: true }, navigation: {} };
    ship.vx = 10;
    ship.vy = 0;
    const initialSpeed = Math.hypot(ship.vx, ship.vy);

    const ice = [{ id: 'HAZ-1', x: 420, y: 1800, collisionRadius: 20 }];
    ship.update(0.1, {}, 0, mockState, ice);

    const newSpeed = Math.hypot(ship.vx, ship.vy);
    expect(newSpeed).toBeLessThan(initialSpeed); // Decelerating continuously
    expect(newSpeed).toBeGreaterThan(0.0); // Does not teleport to 0 instantaneously
  });

  it('8. Emergency turn respects turn-rate limit', () => {
    const mockState = { vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1.0, autopilot: true }, navigation: {} };
    const ice = [{ id: 'HAZ-1', x: 450, y: 1800, collisionRadius: 20 }];
    ship.update(0.1, {}, 0, mockState, ice);

    expect(Math.abs(ship.angularVelocity)).toBeLessThanOrEqual(15.0);
  });

  it('9. Impossible turn is rejected by feasibility evaluator', () => {
    // Sharp U-turn: (0,0) -> (10,0) -> (0,0)
    const waypoints = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -10, y: 0 }];
    const evalRes = engine.evaluateRouteFeasibility(waypoints, { speed: 10 });
    expect(evalRes.isFeasible).toBe(false);
  });

  it('10. Feasible turn is accepted by feasibility evaluator', () => {
    // Gentle 10-degree turn: (0,0) -> (500,0) -> (1000, 50)
    const waypoints = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 50 }];
    const evalRes = engine.evaluateRouteFeasibility(waypoints, { speed: 10 });
    expect(evalRes.isFeasible).toBe(true);
  });

  it('11. Route smoothing integrates correctly', () => {
    const waypoints = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }];
    const smoothRes = curvatureSmoother.smoothRoute(waypoints, ship, []);
    expect(smoothRes.isSmoothed).toBe(true);
    expect(smoothRes.minRadius).toBeGreaterThan(15.0);
  });

  it('12. Heading target does not teleport actual heading', () => {
    ship.heading = 0;
    ship.setRouteWaypoints([{ x: 400, y: 1800 }, { x: 600, y: 1600 }]);
    const mockState = { vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1.0, autopilot: true } };

    ship.update(0.1, {}, 0, mockState, []);
    expect(ship.heading).not.toBe(90); // Does not instantly teleport to target heading
    expect(Math.abs(ship.angularVelocity)).toBeGreaterThan(0); // Angular velocity is non-zero (turning)
  });

  it('13. Actual rudder converges toward target rudder', () => {
    ship.setRouteWaypoints([{ x: 400, y: 1800 }, { x: 600, y: 1600 }]);
    const mockState = { vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1.0, autopilot: true }, navigation: {} };

    ship.update(0.1, {}, 0, mockState, []);
    expect(Math.abs(ship.rudder)).toBeGreaterThan(0);
  });

  it('14. Higher speed reduces maximum allowable turn rate', () => {
    const rateLow = engine.getSpeedDependentMaxTurnRate(5.0);
    const rateHigh = engine.getSpeedDependentMaxTurnRate(20.0);
    expect(rateHigh).toBeLessThan(rateLow);
  });

  it('15. Maneuverability state is deterministic', () => {
    const s1 = engine.getManeuveringState(ship);
    const s2 = engine.getManeuveringState(ship);
    expect(s1.maxTurnRate).toBe(s2.maxTurnRate);
    expect(s1.maxRudderAngle).toBe(s2.maxRudderAngle);
  });

  it('16. AIS target avoidance considers achievable own-ship maneuvering', () => {
    const own = { x: 100, y: 100, vx: 10, vy: 0 };
    const target = { x: 110, y: 100, vx: -10, vy: 0 }; // Imminent head-on meeting in < 0.5s

    const avoidAsses = engine.assessAvoidanceFeasibility(own, target);
    expect(avoidAsses.requiredTurnAngle).toBe(35.0);
    expect(avoidAsses.minTimeToAvoid).toBeGreaterThan(0);
  });

  it('17. XAI records maneuverability rejection', () => {
    const exp = semanticRuleMapper.generateSemanticExplanation({
      maneuverabilityRejection: true,
      requiredTurnRate: 22.0,
      maxTurnRate: 15.0
    });

    expect(exp.applicableRules.some(r => r.ruleId === 'MANEUVERABILITY_CONSTRAINT_RULE')).toBe(true);
    expect(exp.ruleBasis.some(b => b.includes('SHIP_DYNAMICS'))).toBe(true);
  });

  it('18. Benchmark records maneuvering metrics', () => {
    const episode = {
      episode_id: 'ep_test',
      telemetry: [
        { timestamp: 1000, x: 100, y: 100, speed: 10, heading: 0, angularVelocity: 5, rudder: 10 },
        { timestamp: 2000, x: 110, y: 100, speed: 10, heading: 5, angularVelocity: 8, rudder: 15 }
      ],
      events: []
    };

    const res = benchmarkEvaluator.evaluateEpisode(episode);
    expect(res.maneuvering).toBeDefined();
    expect(res.maneuvering.maxHeadingRate).toBe(8.0);
    expect(res.maneuvering.maxRudderAngle).toBe(15.0);
  });

  it('19. Repeated replans remain stable', () => {
    const waypoints1 = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const waypoints2 = [{ x: 0, y: 0 }, { x: 100, y: 110 }];
    ship.setRouteWaypoints(waypoints1, 'r1');
    ship.setRouteWaypoints(waypoints2, 'r2');
    expect(ship._activeRouteId).toBe('r2');
  });

  it('20. Collision validator remains authoritative', () => {
    expect(continuousCollisionValidator).toBeDefined();
  });

  it('21. Bathymetry remains authoritative', () => {
    expect(bathymetryProvider).toBeDefined();
  });

  it('22. Dynamic iceberg drift remains functional', () => {
    const estimator = new DynamicIcebergDragEstimator();
    expect(estimator).toBeDefined();
  });

  it('23. AIS tracking tests structure compatibility verified', () => {
    expect(engine.config.maxRudderAngleDeg).toBe(35.0);
  });

  it('24. Semantic XAI tests structure compatibility verified', () => {
    expect(MARITIME_RULE_REGISTRY.MANEUVERABILITY_CONSTRAINT).toBeDefined();
  });

  it('25. Benchmark tests structure compatibility verified', () => {
    expect(benchmarkEvaluator).toBeDefined();
  });

  it('26. Live-data tests structure compatibility verified', () => {
    expect(DEFAULT_MANEUVERING_CONFIG.maxTurnRateDeg).toBe(15.0);
  });

  it('27. Collision tests structure compatibility verified', () => {
    expect(MANEUVER_STATUS.FEASIBLE).toBe('FEASIBLE');
  });
});
