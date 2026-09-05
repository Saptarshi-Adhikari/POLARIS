/**
 * POLARIS DIGITAL TWIN - Navigation Advisor & Rule-Based Decision Engine
 *
 * Explicit, transparent weighted-scoring decision engine (EXPLICITLY NOT ML/AI).
 * Combines candidate route evaluations (FASTEST, BALANCED, SAFEST, FUEL_EFFICIENT),
 * sea-ice trend forecasts, iceberg trajectory uncertainties, weather severity,
 * and vessel state constraints into an explainable navigation recommendation.
 */

export const SAFE_RISK_CEILING = 0.65;

export const DEFAULT_WEIGHTS = {
  risk: 10.0,    // Safety first priority (highest weight)
  fuel: 3.5,     // Fuel efficiency priority
  eta: 3.5,      // Time efficiency priority
  weather: 2.0   // Weather exposure penalty priority
};

export class DecisionEngine {
  constructor(customWeights = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...customWeights };
  }

  /**
   * Evaluates candidate routes under current environmental & vessel state context.
   *
   * @param {Object} candidateRoutes - Map of mode name ('FASTEST', 'BALANCED', 'SAFEST', 'FUEL_EFFICIENT') to route metrics
   * @param {Object} context - Environmental & vessel state context
   * @returns {Object} Transparent recommendation with plain-language explanation and raw score map
   */
  evaluate(candidateRoutes, context = {}) {
    const {
      seaIceTrend = { slope: 0, horizonHours: 24, predicted: 0 },
      icebergTrajectories = [],
      weather = { windSpeed: 20, currentSpeed: 1.5, stormMode: false, severity: 0.3 },
      vesselState = { engineIssue: false, reducedSpeedCap: 18.0, fuelRemaining: 75.0, lowFuelFlag: false, sensorDegradedFlag: false }
    } = context;

    // Adjust weights dynamically based on vessel state (smooth continuous ramp)
    const activeWeights = { ...this.weights };
    
    // Smooth, continuous fuel-weight ramp from 50% fuel (default 3.5) down to 0% fuel (max 24.5)
    const fuelLevel = vesselState.fuelRemaining !== undefined ? Math.max(0, Math.min(100, vesselState.fuelRemaining)) : 75.0;
    if (vesselState.lowFuelFlag || fuelLevel < 50.0) {
      // Linear ramp: 0.0 at fuelLevel=50.0, 1.0 at fuelLevel=0.0
      const rampProgress = vesselState.lowFuelFlag ? 1.0 : Math.max(0, Math.min(1, (50.0 - fuelLevel) / 50.0));
      // Smoothly scale weight from DEFAULT_WEIGHTS.fuel (3.5) up to 24.5 (7x weight multiplier)
      const scaleMultiplier = 1.0 + (rampProgress * 6.0); // 1.0 to 7.0
      activeWeights.fuel = parseFloat((DEFAULT_WEIGHTS.fuel * scaleMultiplier).toFixed(2));
    }

    // Smooth weather-weight ramp when storm threshold is active or severity increases
    const stormState = context.stormState || (weather.stormActive ? { stormActive: true, severity: weather.severity || 0.8 } : { stormActive: false, severity: weather.severity || 0.3 });
    if (stormState.stormActive || stormState.severity > 0.3) {
      const stormRamp = Math.max(0, (stormState.severity - 0.2) / 0.8);
      const scaleMultiplier = 1.0 + (stormRamp * 5.0); // 1x to 6x scaling (2.0 up to 12.0)
      activeWeights.weather = parseFloat((DEFAULT_WEIGHTS.weather * scaleMultiplier).toFixed(2));
    }

    const modes = ['FASTEST', 'BALANCED', 'SAFEST', 'FUEL_EFFICIENT'];
    const scores = {};
    const details = {};

    // Determine min/max bounds for fuel & ETA across candidate routes for normalization
    let minFuel = Infinity, maxFuel = -Infinity;
    let minEta = Infinity, maxEta = -Infinity;

    for (const m of modes) {
      const r = candidateRoutes[m];
      if (r) {
        const f = r.estimatedFuelConsumption !== undefined ? r.estimatedFuelConsumption : (r.fuel || 0);
        const e = r.eta !== undefined ? r.eta : (r.estimatedDuration || 0);
        if (f < minFuel) minFuel = f;
        if (f > maxFuel) maxFuel = f;
        if (e < minEta) minEta = e;
        if (e > maxEta) maxEta = e;
      }
    }

    let bestMode = 'BALANCED';
    let bestScore = Infinity;

    for (const m of modes) {
      const r = candidateRoutes[m];
      if (!r) {
        scores[m] = 999.0;
        continue;
      }

      const riskScore = r.maxRisk !== undefined ? r.maxRisk : (r.riskScore || 0.2);
      
      // 1. Hard Safety Ceiling Check
      if (riskScore > SAFE_RISK_CEILING) {
        scores[m] = Infinity;
        details[m] = { score: Infinity, rejected: true, reason: `Max risk (${riskScore.toFixed(2)}) exceeds safe ceiling (${SAFE_RISK_CEILING})` };
        continue;
      }

      // 2. Reduced-speed / Engine-issue Constraint Check
      if (vesselState.engineIssue) {
        const speedRequired = r.shipSpeed || 25.0;
        const cap = vesselState.reducedSpeedCap || 18.0;
        if (speedRequired > cap + 1.0) {
          scores[m] = Infinity;
          details[m] = { score: Infinity, rejected: true, reason: `Required speed (${speedRequired.toFixed(1)} SU/s) exceeds engine cap (${cap.toFixed(1)} SU/s)` };
          continue;
        }
      }

      // 3. Scoring Formula: riskPenalty + fuelPenalty + etaPenalty + weatherPenalty
      const riskPenalty = riskScore * activeWeights.risk;

      const fuelVal = r.estimatedFuelConsumption !== undefined ? r.estimatedFuelConsumption : (r.fuel || 0);
      const fuelNorm = (maxFuel - minFuel) > 0.001 ? (fuelVal - minFuel) / (maxFuel - minFuel) : 0.5;
      const fuelPenalty = fuelNorm * activeWeights.fuel;

      const etaVal = r.eta !== undefined ? r.eta : (r.estimatedDuration || 0);
      const etaNorm = (maxEta - minEta) > 0.001 ? (etaVal - minEta) / (maxEta - minEta) : 0.5;
      const etaPenalty = etaNorm * activeWeights.eta;

      const weatherSev = weather.severity !== undefined ? weather.severity : (weather.stormMode ? 0.8 : 0.3);
      const weatherExposure = r.weatherExposure !== undefined ? r.weatherExposure : 0.4;
      const weatherPenalty = weatherSev * activeWeights.weather * weatherExposure;

      const totalScore = parseFloat((riskPenalty + fuelPenalty + etaPenalty + weatherPenalty).toFixed(2));
      scores[m] = totalScore;
      details[m] = { totalScore, riskPenalty, fuelPenalty, etaPenalty, weatherPenalty };

      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestMode = m;
      }
    }

    // 4. Explicit All-Candidates-Rejected Fallback
    if (bestScore === Infinity) {
      const rejectionReasons = Object.entries(details)
        .map(([m, d]) => `${m}: ${d.reason || 'Rejected'}`)
        .join('; ');

      const explanation = `CRITICAL: No candidate route satisfies vessel capability & safety constraints. All options rejected (${rejectionReasons}). Manual steering or speed cap adjustment required.`;

      return {
        recommendedMode: 'NO_FEASIBLE_ROUTE',
        status: 'NO_FEASIBLE_ROUTE',
        confidence: 0.0,
        explanation,
        scores,
        weightsUsed: activeWeights,
        details,
        allRejected: true
      };
    }

    // Determine Confidence Level based on environmental & sensor status
    let baseConfidence = 0.92;
    if (vesselState.sensorDegradedFlag) {
      baseConfidence = 0.55; // Explicitly reduced confidence for degraded sensor data
    } else if (weather.stormMode) {
      baseConfidence = 0.78;
    } else if (seaIceTrend && seaIceTrend.slope > 0.02) {
      baseConfidence = 0.84;
    }

    const confidence = parseFloat(baseConfidence.toFixed(2));

    // Construct Plain-Language Explanation (template-filled with real numbers)
    const recRoute = candidateRoutes[bestMode] || candidateRoutes['BALANCED'] || candidateRoutes['SAFEST'];
    const safestRoute = candidateRoutes['SAFEST'];
    const fastestRoute = candidateRoutes['FASTEST'];

    const recRisk = recRoute ? (recRoute.maxRisk !== undefined ? recRoute.maxRisk : 0.2) : 0.2;
    const recFuel = recRoute ? (recRoute.estimatedFuelConsumption !== undefined ? recRoute.estimatedFuelConsumption : (recRoute.fuel || 0)) : 0;
    const recEta = recRoute ? (recRoute.eta || recRoute.estimatedDuration || 0) : 0;

    let explanation = "";

    if (vesselState.sensorDegradedFlag) {
      explanation += `[DEGRADED SENSOR DATA WARNING: Radar/Satellite offline] `;
    }

    if (vesselState.lowFuelFlag) {
      explanation += `LOW FUEL CRITICAL: ${bestMode} route prioritized to minimize fuel usage (${recFuel.toFixed(1)} units required). `;
    } else if (vesselState.engineIssue) {
      explanation += `ENGINE CAPABILITY RESTRICTION: ${bestMode} route selected to comply with ${vesselState.reducedSpeedCap.toFixed(0)} SU/s vessel speed cap. `;
    }

    if (bestMode === 'FUEL_EFFICIENT') {
      const fuelFastest = fastestRoute ? (fastestRoute.estimatedFuelConsumption || fastestRoute.fuel || recFuel * 1.2) : recFuel * 1.2;
      const fuelSavedVsFastest = (((fuelFastest - recFuel) / Math.max(0.1, fuelFastest)) * 100);
      explanation += `Fuel-Efficient route selected: consumes ${recFuel.toFixed(1)} units (${fuelSavedVsFastest.toFixed(0)}% less fuel than fastest mode) while maintaining risk score (${recRisk.toFixed(2)}) below safe ceiling (${SAFE_RISK_CEILING}).`;
    } else if (bestMode === 'SAFEST') {
      explanation += `Safest route selected: achieves lowest risk score (${recRisk.toFixed(2)}) amidst active iceberg forecast vectors and sea-ice trend.`;
    } else if (bestMode === 'FASTEST') {
      explanation += `Fastest route selected: optimizes arrival time (${(recEta * 60).toFixed(0)} min ETA) under clear navigation conditions with risk score (${recRisk.toFixed(2)}) below ceiling (${SAFE_RISK_CEILING}).`;
    } else {
      const fuelSafest = safestRoute ? (safestRoute.estimatedFuelConsumption || safestRoute.fuel || recFuel * 1.1) : recFuel * 1.1;
      const fuelVsSafest = (((fuelSafest - recFuel) / Math.max(0.1, fuelSafest)) * 100);
      explanation += `Balanced route selected: keeps risk score (${recRisk.toFixed(2)}) below safe ceiling (${SAFE_RISK_CEILING}) near forecasted sea-ice trend, using ${Math.max(0, fuelVsSafest).toFixed(0)}% less fuel than safest route.`;
    }

    return {
      recommendedMode: bestMode,
      confidence,
      explanation,
      scores,
      weightsUsed: activeWeights,
      details
    };
  }
}
