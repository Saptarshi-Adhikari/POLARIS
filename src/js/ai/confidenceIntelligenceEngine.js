import uncertaintyCalibration from '../../data/uncertaintyCalibration.json';

export class ConfidenceIntelligenceEngine {
  constructor(engine) {
    this.engine = engine;
    this.lastUpdateTime = 0;
    this.updateIntervalMs = 1500; // Throttle to 1.5s

    // Cached states
    this.decisionConfidence = 85;
    this.decisionLevel = "HIGH";
    this.dataCompleteness = 1.0;
    this.envStability = 1.0;
    this.controllerStability = "STABLE";

    this.validationMetrics = {
      meanError: 0.0,
      latestError: 0.0,
      trend: "INSUFFICIENT_DATA",
      samples: 0
    };

    this.icebergConfidence = {
      c6: 0.90,
      c12: 0.81,
      c24: 0.68,
      reliability6: "HIGH",
      reliability12: "HIGH",
      reliability24: "MODERATE",
      uncertainty6: 15,
      uncertainty12: 30,
      uncertainty24: 60
    };

    this.seaIceConfidence = {
      confidence: 0.85,
      horizon: 24,
      uncertainty: 0.15,
      reliability: "HIGH"
    };

    // Environmental tracking logs
    this.windHistory = [];
    this.currentHistory = [];
  }

  update(timestamp) {
    if (timestamp - this.lastUpdateTime < this.updateIntervalMs) return;
    this.lastUpdateTime = timestamp;

    this.evaluateValidationAccuracy();
    this.evaluateEnvironmentalStability();
    this.evaluateIcebergConfidence();
    this.evaluateSeaIceConfidence();
    this.calculateDecisionConfidence();
  }

  evaluateValidationAccuracy() {
    const ve = this.engine.validationEngine;
    if (!ve || ve.validatedCount === 0) {
      this.validationMetrics = {
        meanError: 0.0,
        latestError: 0.0,
        trend: "INSUFFICIENT_DATA",
        samples: 0
      };
      return;
    }

    const samples = ve.validatedCount;
    const meanError = ve.averageError;
    const latestError = ve.currentError;

    // Trend calculation comparing last history entries
    let trend = "STABLE";
    if (ve.history && ve.history.length >= 2) {
      const len = ve.history.length;
      const recentAvg = (ve.history[len - 1].error + ve.history[Math.max(0, len - 2)].error) / 2;
      if (recentAvg < meanError - 2) trend = "IMPROVING";
      else if (recentAvg > meanError + 2) trend = "DEGRADING";
    }

    this.validationMetrics = {
      meanError,
      latestError,
      trend,
      samples
    };
  }

  evaluateEnvironmentalStability() {
    const state = this.engine.state;
    if (!state) return;

    const wSpeed = state.environment.wind.speed || 0;
    const cSpeed = state.environment.ocean.currentSpeed || 0;

    this.windHistory.push(wSpeed);
    this.currentHistory.push(cSpeed);

    if (this.windHistory.length > 5) this.windHistory.shift();
    if (this.currentHistory.length > 5) this.currentHistory.shift();

    if (this.windHistory.length < 2) {
      this.envStability = 1.0;
      return;
    }

    // Rate-of-change variances
    let wVar = 0;
    for (let i = 1; i < this.windHistory.length; i++) {
      wVar += Math.abs(this.windHistory[i] - this.windHistory[i-1]);
    }
    wVar /= (this.windHistory.length - 1);

    this.envStability = Math.max(0.5, Math.min(1.0, 1.0 - (wVar / 35.0)));
  }

  evaluateIcebergConfidence() {
    const client = this.engine.aiClient;
    const baseConf = client && client.status === "ONLINE" ? client.confidence : 0.85;

    // Bounded time degradation: baseUncertainty * (1 + growthRate * t)
    const growth6 = 1.0 + 0.15 * 6;
    const growth12 = 1.0 + 0.15 * 12;
    const growth24 = 1.0 + 0.15 * 24;

    const errorPenalty = Math.max(0.0, Math.min(0.2, this.validationMetrics.meanError * 0.005));

    const c6 = Math.max(0.3, baseConf * (1.0 / growth6) - errorPenalty);
    const c12 = Math.max(0.2, baseConf * (1.0 / growth12) - errorPenalty);
    const c24 = Math.max(0.1, baseConf * (1.0 / growth24) - errorPenalty);

    const getReliability = (c) => c > 0.8 ? "HIGH" : (c > 0.55 ? "MODERATE" : "LOW");

    this.icebergConfidence = {
      c6,
      c12,
      c24,
      reliability6: getReliability(c6),
      reliability12: getReliability(c12),
      reliability24: getReliability(c24),
      uncertainty6: uncertaintyCalibration?.uncertainty_30 || (12 * growth6),
      uncertainty12: uncertaintyCalibration?.uncertainty_60 || (12 * growth12),
      uncertainty24: (uncertaintyCalibration?.uncertainty_60 * 2.0) || (12 * growth24)
    };
  }

  evaluateSeaIceConfidence() {
    const state = this.engine.state;
    if (!state) return;

    const baseIce = state.environment.seaIce.averageConcentration || 0.0;
    this.seaIceConfidence = {
      confidence: Math.max(0.4, 0.90 - baseIce * 0.3),
      horizon: 24,
      uncertainty: baseIce * 0.25,
      reliability: baseIce > 0.5 ? "MODERATE" : "HIGH"
    };
  }

  calculateDecisionConfidence() {
    const ri = this.engine.riskIntelligenceEngine;
    const autoCtrl = this.engine.autonomousController;
    const client = this.engine.aiClient;

    // Check availability
    this.dataCompleteness = client && client.status === "ONLINE" ? 1.0 : 0.75;

    // 1. Iceberg reliability component (avg of c6/c12/c24)
    const icebergComp = (this.icebergConfidence.c6 + this.icebergConfidence.c12 + this.icebergConfidence.c24) / 3;

    // 2. Sea-ice component
    const seaIceComp = this.seaIceConfidence.confidence;

    // 3. Validation accuracy component
    const validationComp = Math.max(0.5, 1.0 - (this.validationMetrics.meanError * 0.004));

    // 4. Route safety margin
    const safetyComp = ri && ri.routeExposure ? Math.max(0.2, 1.0 - ri.routeExposure.averageRisk) : 0.80;

    // 5. Environmental Stability
    const envComp = this.envStability;

    // 6. Autonomous controller stability state
    let ctrlComp = 0.95;
    this.controllerStability = "STABLE";
    if (autoCtrl) {
      if (autoCtrl.currentCommand.mode === "EMERGENCY_DODGE" || autoCtrl.currentCommand.mode === "REROUTE_WAIT") {
        ctrlComp = 0.60;
        this.controllerStability = "ADAPTING";
      }
    }

    // Weighted aggregation:
    // Iceberg (25%), Sea-ice (15%), Validation (20%), Safety margin (20%), Env stability (10%), Controller (10%)
    const score = (icebergComp * 0.25) +
                  (seaIceComp * 0.15) +
                  (validationComp * 0.20) +
                  (safetyComp * 0.20) +
                  (envComp * 0.10) +
                  (ctrlComp * 0.10);

    this.decisionConfidence = Math.round(score * 100);
    this.decisionLevel = this.decisionConfidence >= 90 ? "VERY HIGH" :
                         (this.decisionConfidence >= 75 ? "HIGH" :
                         (this.decisionConfidence >= 55 ? "MODERATE" :
                         (this.decisionConfidence >= 35 ? "LOW" : "VERY LOW")));
  }

  getConfidenceExplanation() {
    const boosters = [];
    const reducers = [];

    if (this.validationMetrics.trend === "IMPROVING") {
      boosters.push("Recent prediction accuracy improving");
    } else if (this.validationMetrics.trend === "DEGRADING") {
      reducers.push("Mean prediction errors degrading");
    }

    if (this.envStability > 0.85) {
      boosters.push("Low sea-ice variability and stable winds");
    } else {
      reducers.push("Strong environmental wind variation");
    }

    if (this.icebergConfidence.c24 < 0.6) {
      reducers.push("High uncertainty at +24h forecast horizon");
    } else {
      boosters.push("Long-range forecast confidence stable");
    }

    return {
      boosters: boosters.slice(0, 2),
      reducers: reducers.slice(0, 2),
      desc: `Decision confidence is ${this.decisionLevel} because recent iceberg prediction errors are ${this.validationMetrics.trend.toLowerCase()} and environmental stability remains ${this.envStability > 0.85 ? 'high' : 'variable'}.`
    };
  }

  reset() {
    this.windHistory = [];
    this.currentHistory = [];
    this.validationMetrics = {
      meanError: 0.0,
      latestError: 0.0,
      trend: "INSUFFICIENT_DATA",
      samples: 0
    };
  }
}
