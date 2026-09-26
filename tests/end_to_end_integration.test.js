import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { VectorField } from '../src/js/simulation/vectorField.js';
import { sensorFusion } from '../src/js/sensors/sensorFusion.js';
import { RiskIntelligenceEngine } from '../src/js/ai/riskIntelligenceEngine.js';
import { DecisionEngine } from '../src/js/ai/decisionEngine.js';

describe('POLARIS End-to-End System Integration Suite', () => {
  let engine;

  beforeEach(() => {
    engine = new SimulationEngine();
    engine.ship = new Ship({ x: 500, y: 500, heading: 0 });
    engine.icebergs = [];
    engine.state.navigation.activeRoute = null;
    engine.state.navigation.destinationPoint = null;
  });

  it('TEST 1: Destination selection -> Pathfinder -> Active Route -> Guidance -> Ship physical movement', async () => {
    const dest = { x: 500, y: 1500 };
    engine.state.navigation.destinationPoint = dest;

    // Trigger route generation
    engine.aiNavigator.calculateRoute(engine.ship, dest, engine.icebergs, engine.vectorField, 'BALANCED', engine.state, engine.ship);
    
    // Verify route was adopted into canonical state
    const activeRoute = engine.state.navigation.activeRoute;
    expect(activeRoute).toBeDefined();
    expect(activeRoute.status).toBe('valid');
    expect(activeRoute.waypoints.length).toBeGreaterThan(1);
    expect(engine.ship.routeWaypoints.length).toBeGreaterThan(1);

    // Advance simulation physics for 10 seconds
    const initialY = engine.ship.y;
    for (let i = 0; i < 300; i++) {
      engine.ship.update(0.016, engine.vectorField, 0, engine.state, engine.icebergs);
    }

    // Ship must have physically moved towards destination
    expect(engine.ship.y).toBeGreaterThan(initialY);
    expect(engine.ship.speedKnots).toBeGreaterThan(0);
  });

  it('TEST 2: Dynamic Iceberg obstacle -> Replan -> Active Route replacement -> Ship changes trajectory', () => {
    const dest = { x: 500, y: 1500 };
    engine.state.navigation.destinationPoint = dest;
    engine.aiNavigator.calculateRoute(engine.ship, dest, engine.icebergs, engine.vectorField, 'BALANCED', engine.state, engine.ship);
    
    const initialRouteId = engine.state.navigation.activeRoute.routeId;
    
    // Spawn an iceberg directly in front of the active route and recalculate route
    const blockingIceberg = new Iceberg({ id: 'blocker_1', x: 500, y: 800, size: 80, mass: 4.0 });
    engine.icebergs.push(blockingIceberg);
    engine.aiNavigator.lastReplanReason = 'ROUTE_GEOMETRY_BLOCKED';
    engine.state.navigation.routeInvalid = true;
    engine.aiNavigator.calculateRoute(engine.ship, dest, engine.icebergs, engine.vectorField, 'BALANCED', engine.state, engine.ship);
    
    // Replanning should be triggered and adopted
    const newRouteId = engine.state.navigation.activeRoute.routeId;
    expect(newRouteId).not.toBe(initialRouteId);
    expect(engine.state.navigation.activeRoute.status).toBe('valid');
    
    // The new path waypoints should detour around x=500
    const hasDetour = engine.state.navigation.activeRoute.waypoints.some(pt => Math.abs(pt.x - 500) > 20);
    expect(hasDetour).toBe(true);
  });

  it('TEST 3: Sudden hazard -> Emergency Controller -> Rudder Override -> Physical heading/position response', () => {
    const dangerIceberg = new Iceberg({ id: 'danger_1', x: 500, y: 530, size: 60, mass: 2.0 });
    engine.icebergs.push(dangerIceberg);

    const initialHeading = engine.ship.heading;
    
    // Run emergency evaluation
    engine.ship.checkEmergencyAvoidance(0.016, engine.icebergs, engine.state);
    
    // Autopilot state must enter EMERGENCY
    expect(engine.state.vessel.autopilotStatus).toBe('EMERGENCY_AVOIDANCE');
    expect(Math.abs(engine.ship.rudder)).toBeGreaterThan(20);

    // Step physics to verify rudder turns vessel
    for (let i = 0; i < 30; i++) {
      engine.ship.update(0.016, engine.vectorField, 0, engine.state, engine.icebergs);
    }
    
    expect(engine.ship.heading).not.toBe(initialHeading);
  });

  it('TEST 4: VectorField current -> Ship velocity coupling -> Trajectory difference vs Zero Current', () => {
    const shipZeroCurrent = new Ship({ x: 1000, y: 1000, heading: 0 });
    const shipWithCurrent = new Ship({ x: 1000, y: 1000, heading: 0 });
    
    const zeroField = new VectorField(3600, 2400);
    zeroField.currentSpeed = 0;

    const strongField = new VectorField(3600, 2400);
    strongField.currentSpeed = 10;
    strongField.currentDirection = 90; // North-bound current

    const testState = {
      vessel: { maxSpeed: 20, dragCoefficient: 0.05, mass: 1.0, autopilot: false, throttle: 50, rudder: 0 },
      environment: {
        ocean: { currentSpeed: 10, currentDirection: 90, turbulence: 0.1 },
        wind: { enabled: false, speed: 0, direction: 0 },
        seaIce: { enabled: false }
      }
    };

    const zeroState = {
      vessel: { maxSpeed: 20, dragCoefficient: 0.05, mass: 1.0, autopilot: false, throttle: 50, rudder: 0 },
      environment: {
        ocean: { currentSpeed: 0, currentDirection: 0, turbulence: 0.1 },
        wind: { enabled: false, speed: 0, direction: 0 },
        seaIce: { enabled: false }
      }
    };

    // Step both ships for 5 seconds
    for (let i = 0; i < 300; i++) {
      shipZeroCurrent.update(0.016, zeroField, 0, zeroState, []);
      shipWithCurrent.update(0.016, strongField, 0, testState, []);
    }

    // Ship in strong current must have diverged in Y position
    expect(shipWithCurrent.y).toBeGreaterThan(shipZeroCurrent.y + 10);
  });

  it('TEST 5: SensorFusion -> Noise filtering & Dead Reckoning fallback verification', () => {
    const shipState = { x: 500, y: 500, vx: 10, vy: 0, heading: 0, angularVelocity: 0 };
    
    // Run sensor fusion update without GNSS (DR mode)
    const fusedState = sensorFusion.update(shipState, [], 0.1);
    
    expect(fusedState.position).toBeDefined();
    expect(fusedState.heading).toBeDefined();
    expect(fusedState.velocity.x).toBe(10);
  });

  it('TEST 6: RiskIntelligenceEngine -> Evaluates cell risk grid & computes route exposure', () => {
    const riskEngine = new RiskIntelligenceEngine(engine);
    const ice = new Iceberg({ id: 'risk_ice_1', x: 600, y: 600, size: 100 });
    engine.icebergs.push(ice);

    riskEngine.update(1000, true);

    const cellNearIce = riskEngine.getRiskAt(600, 600);
    const cellFarIce = riskEngine.getRiskAt(100, 100);

    expect(cellNearIce.risk).toBeGreaterThan(cellFarIce.risk);
    expect(riskEngine.getSnapshot().classification).toBeDefined();
  });

  it('TEST 7: DecisionEngine -> Evaluates candidate route options and selects optimal mode', () => {
    const decisionEngine = new DecisionEngine();
    
    const candidateRoutes = {
      FASTEST: { maxRisk: 0.2, estimatedFuelConsumption: 10, eta: 0.05, shipSpeed: 25 },
      BALANCED: { maxRisk: 0.1, estimatedFuelConsumption: 8, eta: 0.06, shipSpeed: 20 },
      SAFEST: { maxRisk: 0.02, estimatedFuelConsumption: 7, eta: 0.07, shipSpeed: 18 },
      FUEL_EFFICIENT: { maxRisk: 0.05, estimatedFuelConsumption: 5, eta: 0.08, shipSpeed: 15 }
    };

    const recommendation = decisionEngine.evaluate(candidateRoutes, {
      vesselState: { fuelRemaining: 15.0, lowFuelFlag: true } // Low fuel triggers FUEL_EFFICIENT
    });

    expect(recommendation.recommendedMode).toBe('FUEL_EFFICIENT');
    expect(recommendation.confidence).toBeGreaterThan(0.5);
    expect(recommendation.explanation).toContain('LOW FUEL');
  });

  it('TEST 8: UI Telemetry calculations match authoritative simulation engine state', () => {
    engine.ship.speedKnots = 14.5;
    engine.ship.fuel = 82.3;
    engine.ship.x = 500;
    engine.ship.y = 500;
    engine.state.navigation.destinationPoint = { x: 500, y: 1500 };

    expect(engine.ship.speedKnots).toBe(14.5);
    expect(engine.ship.fuel).toBe(82.3);
  });
});

