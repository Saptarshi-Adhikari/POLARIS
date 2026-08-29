export class DecisionIntelligenceEngine {
  constructor(engine) {
    this.engine = engine;
    this.events = [];
    this.cooldowns = {};
    this.lastUpdateTime = 0;
    this.updateIntervalMs = 1500;

    // Seed initial event
    this.logEvent("Decision engine initialized", "INFO", "init");
  }

  update(timestamp) {
    if (timestamp - this.lastUpdateTime < this.updateIntervalMs) return;
    this.lastUpdateTime = timestamp;

    this.checkStateChanges();
  }

  logEvent(msg, severity = "INFO", typeKey = null) {
    const now = Date.now();
    
    // Cooldown/Debounce check (cooldown of 15 seconds for identical type keys)
    if (typeKey) {
      const lastLogged = this.cooldowns[typeKey] || 0;
      if (now - lastLogged < 15000) return;
      this.cooldowns[typeKey] = now;
    }

    // Deduplicate exact consecutive messages
    if (this.events.length > 0 && this.events[0].msg === msg) return;

    this.events.unshift({
      time: new Date().toLocaleTimeString(),
      msg,
      severity
    });

    if (this.events.length > 40) {
      this.events.pop();
    }
  }

  checkStateChanges() {
    const state = this.engine.state;
    if (!state) return;

    // 1. Sea Ice warning trigger
    const seaIceEnabled = state.environment.seaIce.enabled;
    const avgIce = seaIceEnabled ? state.environment.seaIce.averageConcentration : 0.0;
    if (avgIce > 0.45) {
      this.logEvent(`Sea ice density warning: average concentration at ${(avgIce * 100).toFixed(0)}%`, "WARNING", "ice_density");
    }

    // 2. Iceberg trajectory corridor collision warning
    const ri = this.engine.riskIntelligenceEngine;
    if (ri && ri.routeExposure && ri.routeExposure.maxRisk > 0.5) {
      this.logEvent(`Iceberg corridor conflict: route risk high (${(ri.routeExposure.maxRisk * 100).toFixed(0)}%)`, "CRITICAL", "corridor_risk");
    }

    // 3. Confidence drop warning
    const cie = this.engine.confidenceIntelligenceEngine;
    if (cie && cie.decisionConfidence < 60) {
      this.logEvent(`Confidence alert: AI decision stability degraded to ${cie.decisionConfidence}%`, "WARNING", "conf_drop");
    }

    // 4. Mission Planner feasibility override
    const mp = this.engine.missionPlan;
    if (mp && !mp.feasible) {
      this.logEvent("Mission constraints warning: travel time exceeds limits", "CRITICAL", "constraint_conflict");
    }

    // 5. Autopilot crabbing active alert
    const crabAngle = Math.abs(state.vessel.crabAngle || 0);
    if (crabAngle > 10) {
      this.logEvent(`Cross-track compensation: crabbing angle adjusted to ${crabAngle.toFixed(0)}°`, "INFO", "drift_crab");
    }

    // 6. Navigation strategy change
    const activeStrat = state.navigation.mode || "BALANCED";
    this.logEvent(`Nav Strategy tracking: active cruise target mode is ${activeStrat}`, "SUCCESS", `strat_${activeStrat}`);
  }

  getPipeline() {
    const state = this.engine.state;
    const client = this.engine.aiClient;
    const adm = this.engine.antarcticDataManager;
    const ri = this.engine.riskIntelligenceEngine;
    const cie = this.engine.confidenceIntelligenceEngine;
    const mp = this.engine.missionPlan;
    const autoCtrl = this.engine.autonomousController;

    const dataMode = state ? state.environment.mode : 'SIMULATION';

    return [
      {
        stage: "🛰 DATA",
        status: adm && adm.active ? (adm.status === "FALLBACK" ? "FALLBACK" : "ACTIVE") : "READY",
        metric: dataMode === 'DATA-DRIVEN' ? "OBSERVED GRID" : "PROCEDURAL",
        desc: "Environmental data inputs source provenance."
      },
      {
        stage: "🤖 ML FORECAST",
        status: client && client.status === "ONLINE" ? "ACTIVE" : "FALLBACK",
        metric: client && client.status === "ONLINE" ? `${(client.confidence * 100).toFixed(0)}% CONF` : "Procedural",
        desc: "Random Forest trajectory predictors."
      },
      {
        stage: "⚠ RISK ANALYSIS",
        status: ri && ri.routeExposure ? (ri.routeExposure.maxRisk > 0.45 ? "WARNING" : "READY") : "READY",
        metric: ri && ri.routeExposure ? `Max risk ${(ri.routeExposure.maxRisk * 100).toFixed(0)}%` : "N/A",
        desc: "Gaussian decay hazard corridor maps."
      },
      {
        stage: "📈 CONFIDENCE",
        status: cie ? (cie.decisionConfidence < 60 ? "WARNING" : "READY") : "READY",
        metric: cie ? `${cie.decisionConfidence}% compound` : "N/A",
        desc: "Validation performance aggregates."
      },
      {
        stage: "🧭 CONSTRAINTS",
        status: mp ? (mp.feasible ? "READY" : "WARNING") : "READY",
        metric: mp ? (mp.feasible ? "FEASIBLE" : "CONFLICT") : "N/A",
        desc: "Voyage parameter target checks."
      },
      {
        stage: "🗺 ROUTE DECISION",
        status: "READY",
        metric: state ? state.navigation.mode : "BALANCED",
        desc: "A* cost evaluations."
      },
      {
        stage: "🚢 ACTION",
        status: autoCtrl && autoCtrl.isActive ? "ACTIVE" : "READY",
        metric: autoCtrl && autoCtrl.isActive ? autoCtrl.currentCommand.mode : "MANUAL",
        desc: "Autopilot cross-track corrections."
      }
    ];
  }

  getCurrentDecision() {
    const autoCtrl = this.engine.autonomousController;
    const ri = this.engine.riskIntelligenceEngine;
    const cie = this.engine.confidenceIntelligenceEngine;

    const command = autoCtrl ? autoCtrl.currentCommand.mode : "STANDBY";
    const reason = autoCtrl ? autoCtrl.currentCommand.reason : "Console initialized.";
    const confidence = cie ? cie.decisionConfidence : 85;

    return {
      decision: command,
      reason: reason,
      confidence: confidence,
      expectedImpact: {
        riskDelta: ri && ri.routeExposure ? `-${(ri.routeExposure.averageRisk * 20).toFixed(0)}%` : "-5%",
        etaDelta: "+0.8h",
        fuelDelta: "+4%"
      }
    };
  }
}
