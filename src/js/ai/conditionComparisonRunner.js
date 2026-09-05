/**
 * POLARIS DIGITAL TWIN — Condition-Comparison Preset Runner
 * Runs the Decision Engine across four environmental presets (Normal, Storm, Heavy Ice, Low Fuel)
 * and compares recommendations side-by-side.
 */

import { DecisionEngine } from './decisionEngine.js';

export class ConditionComparisonRunner {
  constructor(aiNavigator) {
    this.aiNavigator = aiNavigator;
    this.decisionEngine = new DecisionEngine();
  }

  /**
   * Run the decision engine across four presets under identical start, destination, and vessel specs.
   *
   * @param {Object} ship - Vessel state object
   * @param {Object} dest - Destination coordinates {x, y}
   * @param {Array} icebergs - Array of iceberg entities
   * @param {Object} vectorField - Base vector field simulator
   * @param {Object} state - Master state object
   * @returns {Array} List of results for each preset (Normal, Storm, Heavy Ice, Low Fuel)
   */
  runComparison(ship, dest, icebergs = [], vectorField = {}, state = {}) {
    const presets = [
      {
        name: 'NORMAL',
        windSpeed: 10,
        currentSpeed: 5,
        turbulence: 0.1,
        iceConc: 0.10,
        fuel: 100,
        stormActive: false
      },
      {
        name: 'STORM',
        windSpeed: 105,
        currentSpeed: 30,
        turbulence: 0.75,
        iceConc: 0.10,
        fuel: 100,
        stormActive: true
      },
      {
        name: 'HEAVY_ICE',
        windSpeed: 10,
        currentSpeed: 5,
        turbulence: 0.1,
        iceConc: 0.85,
        fuel: 100,
        stormActive: false
      },
      {
        name: 'LOW_FUEL',
        windSpeed: 10,
        currentSpeed: 5,
        turbulence: 0.1,
        iceConc: 0.10,
        fuel: 15,
        stormActive: false
      }
    ];

    const results = [];

    for (const p of presets) {
      const mockState = JSON.parse(JSON.stringify(state || {
        vessel: { maxSpeed: 30, autopilotThrottle: 65 },
        navigation: { mode: 'BALANCED' }
      }));
      if (!mockState.vessel) mockState.vessel = { maxSpeed: 30, autopilotThrottle: 65 };
      mockState.vessel.lowFuel = p.fuel < 25;

      const mockShip = { ...ship, fuel: p.fuel };
      const gridData = new Float32Array(72 * 48).fill(p.iceConc);
      const mockVf = {
        ...vectorField,
        windSpeed: p.windSpeed,
        currentSpeed: p.currentSpeed,
        turbulence: p.turbulence,
        stormMode: p.stormActive,
        seaIceGrid: { cols: 72, rows: 48, data: gridData },
        getSeaIceTrendForecast: () => ({ slope: p.iceConc > 0.5 ? 0.03 : 0, horizonHours: 24, predicted: p.iceConc })
      };
      mockState.environment = { seaIce: { enabled: p.iceConc > 0.2 } };

      const fastest = this.aiNavigator.computeRouteStrategy(mockShip, dest, icebergs, mockVf, 'FASTEST', mockState);
      const balanced = this.aiNavigator.computeRouteStrategy(mockShip, dest, icebergs, mockVf, 'BALANCED', mockState);
      const safest = this.aiNavigator.computeRouteStrategy(mockShip, dest, icebergs, mockVf, 'SAFEST', mockState);
      const fuelEfficient = this.aiNavigator.computeRouteStrategy(mockShip, dest, icebergs, mockVf, 'FUEL_EFFICIENT', mockState);

      const candidateRoutes = { FASTEST: fastest, BALANCED: balanced, SAFEST: safest, FUEL_EFFICIENT: fuelEfficient };

      const stormSeverity = p.stormActive ? 0.85 : 0.0;
      const context = {
        seaIceTrend: { slope: 0, horizonHours: 24, predicted: p.iceConc },
        icebergTrajectories: icebergs.flatMap(i => i.trajectoryForecast || []),
        weather: { windSpeed: p.windSpeed, currentSpeed: p.currentSpeed, stormMode: p.stormActive, severity: stormSeverity, stormActive: p.stormActive },
        stormState: { stormActive: p.stormActive, severity: stormSeverity },
        vesselState: { engineIssue: false, reducedSpeedCap: 18.0, fuelRemaining: p.fuel, lowFuelFlag: p.fuel < 25 }
      };

      const evalRes = this.decisionEngine.evaluate(candidateRoutes, context);
      const chosenRoute = candidateRoutes[evalRes.recommendedMode] || balanced;

      results.push({
        preset: p.name,
        recommendedMode: evalRes.recommendedMode,
        etaHours: (chosenRoute.eta * 60).toFixed(0) + ' m',
        fuelBurnL: (chosenRoute.estimatedFuelConsumption || chosenRoute.fuel || 0).toFixed(1) + ' u',
        maxRisk: (chosenRoute.maxRisk || 0).toFixed(2),
        confidence: Math.round((evalRes.confidence || 0.92) * 100) + '%'
      });
    }

    return results;
  }
}
