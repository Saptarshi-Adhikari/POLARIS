import { DecisionEngine } from '../src/js/ai/decisionEngine.js';

const engine = new DecisionEngine();

const candidateRoutes = {
  FASTEST: { mode: 'FASTEST', shipSpeed: 28.5, totalDistance: 3000, eta: 0.03, estimatedFuelConsumption: 14.5, maxRisk: 0.40 },
  BALANCED: { mode: 'BALANCED', shipSpeed: 22.5, totalDistance: 3100, eta: 0.04, estimatedFuelConsumption: 11.2, maxRisk: 0.25 },
  SAFEST: { mode: 'SAFEST', shipSpeed: 19.5, totalDistance: 3400, eta: 0.05, estimatedFuelConsumption: 12.0, maxRisk: 0.12 },
  FUEL_EFFICIENT: { mode: 'FUEL_EFFICIENT', shipSpeed: 16.5, totalDistance: 3150, eta: 0.05, estimatedFuelConsumption: 8.8, maxRisk: 0.28 }
};

console.log("=== ALL CANDIDATES REJECTED SCENARIO (SPEED CAP = 10.0 SU/s) ===");
const contextImpossibleCap = {
  seaIceTrend: { slope: 0.0, horizonHours: 24, predicted: 0.1 },
  weather: { severity: 0.2, stormMode: false },
  vesselState: { engineIssue: true, reducedSpeedCap: 10.0, fuelRemaining: 85.0, lowFuelFlag: false, sensorDegradedFlag: false }
};

console.log(JSON.stringify(engine.evaluate(candidateRoutes, contextImpossibleCap), null, 2));
