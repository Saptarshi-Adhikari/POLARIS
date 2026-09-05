import { describe, test, expect } from 'vitest';
import { VectorField } from '../src/js/simulation/vectorField.js';
import { DecisionEngine } from '../src/js/ai/decisionEngine.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('Part 1 — Storm / Weather Detection & Dynamic Ramp', () => {
  test('detects storm threshold active when wind exceeds 60 kts', () => {
    const vf = new VectorField(3600, 2400);
    
    // Normal calm weather
    vf.windSpeed = 20;
    vf.currentSpeed = 5;
    vf.turbulence = 0.2;
    
    const calmState = vf.getStormState();
    expect(calmState.stormActive).toBe(false);
    expect(calmState.severity).toBe(0.0);

    // Raise wind speed past storm threshold (60 kts)
    vf.windSpeed = 85;
    const stormState = vf.getStormState();
    expect(stormState.stormActive).toBe(true);
    expect(stormState.severity).toBeGreaterThan(0.3);
  });

  test('decision engine scales weather penalty smoothly when storm is active', () => {
    const engine = new DecisionEngine();
    
    const dummyRoute = {
      FASTEST: { eta: 1.0, fuel: 100, maxRisk: 0.2, weatherExposure: 0.5, shipSpeed: 20 },
      BALANCED: { eta: 1.2, fuel: 80, maxRisk: 0.1, weatherExposure: 0.4, shipSpeed: 18 }
    };

    // Calm context
    const calmContext = {
      weather: { windSpeed: 20, currentSpeed: 5, stormMode: false, severity: 0.2, stormActive: false },
      stormState: { stormActive: false, severity: 0.0 },
      vesselState: { fuelRemaining: 100, lowFuelFlag: false }
    };
    const calmEval = engine.evaluate(dummyRoute, calmContext);

    // Storm context
    const stormContext = {
      weather: { windSpeed: 100, currentSpeed: 30, stormMode: true, severity: 0.8, stormActive: true },
      stormState: { stormActive: true, severity: 0.8 },
      vesselState: { fuelRemaining: 100, lowFuelFlag: false }
    };
    const stormEval = engine.evaluate(dummyRoute, stormContext);

    // Weather penalty should scale up in storm context
    expect(stormEval.details.BALANCED.weatherPenalty).toBeGreaterThan(calmEval.details.BALANCED.weatherPenalty);
  });

  test('aiNavigator triggers route re-evaluation when storm threshold transitions', () => {
    const nav = new AINavigator(3600, 2400);
    const ship = new Ship(100, 100);
    const vf = new VectorField(3600, 2400);
    const state = {
      navigation: { mode: 'BALANCED', isNavigating: true, destinationPoint: { x: 2000, y: 2000 }, routeInvalid: false },
      environment: { wind: { speed: 20, direction: 90 }, ocean: { currentSpeed: 5, turbulence: 0.2 } }
    };

    vf.windSpeed = 20;
    nav.evaluate(ship, [], vf, 0, state);
    const initialRouteTime = nav.lastRouteTime || 0;

    // Increase wind speed past storm threshold mid-transit
    vf.windSpeed = 95;
    state.environment.wind.speed = 95;
    nav.evaluate(ship, [], vf, 0.6, state);
    
    // Reroute timestamp should be updated when storm threshold transitions
    expect(nav.lastRouteTime).toBeGreaterThan(initialRouteTime);
  });
});
