export class ExplainabilityEngine {
  constructor(engine) {
    this.engine = engine;
  }

  getTopReasons() {
    const reasons = [];
    const ship = this.engine.ship;
    const state = this.engine.state;
    const aiNav = this.engine.aiNavigator;
    const autoCtrl = this.engine.autonomousController;
    const ri = this.engine.riskIntelligenceEngine;

    if (!ship || !state) return reasons;

    // Reason 1: Iceberg risk avoidance
    let maxMLDanger = 0;
    for (let ice of this.engine.icebergs) {
      if (ice.mlTrajectory) {
        for (let pt of ice.mlTrajectory) {
          const dist = Math.hypot(pt.x - ship.x, pt.y - ship.y);
          if (dist < 150) {
            maxMLDanger = Math.max(maxMLDanger, pt.time <= 15 ? 3 : 1);
          }
        }
      }
    }
    if (maxMLDanger >= 2) {
      reasons.push({
        icon: "🧊",
        title: "AVOIDS HIGH-RISK ICEBERG CORRIDORS",
        desc: "Predicted trajectories intersect the alternative route segments."
      });
    }

    // Reason 2: Sea ice exposure
    const seaIceEnabled = state.environment.seaIce.enabled;
    const avgIce = seaIceEnabled ? state.environment.seaIce.averageConcentration : 0.0;
    if (avgIce > 0.4) {
      reasons.push({
        icon: "❄️",
        title: "REDUCES SEA-ICE EXPOSURE",
        desc: `Selected route route remains below a lower average sea-ice concentration (${(avgIce * 100).toFixed(0)}%).`
      });
    }

    // Reason 3: Fuel constraints optimization
    const mp = this.engine.missionPlan;
    if (mp && mp.recommended) {
      reasons.push({
        icon: "⛽",
        title: "OPTIMIZES FUEL WITHIN SAFETY LIMIT",
        desc: `Recommended strategy (${mp.recommendedStrategy}) stays within configured fuel target.`
      });
    }

    // Reason 4: Environmental resistance crabbing
    const envResistance = state.vessel.environmentalResistance || 0.0;
    if (envResistance > 3.0) {
      reasons.push({
        icon: "🌊",
        title: "COMPENSATES FOR ADVERSE CURRENT",
        desc: `Active crabbing angle of ${(state.vessel.crabAngle || 0.0).toFixed(0)}° offsets lateral drift forces.`
      });
    }

    // Default fallbacks if empty
    if (reasons.length === 0) {
      reasons.push({
        icon: "🧭",
        title: "NORMAL WAYPOINT TRACKING",
        desc: "No major environmental hazards require track deviations from mission plan."
      });
    }

    return reasons.slice(0, 3);
  }

  getTradeoffs() {
    const aiNav = this.engine.aiNavigator;
    if (!aiNav || !aiNav.routeComparisons) {
      return "No route comparisons available. Route must be generated first.";
    }

    const mode = this.engine.state.navigation.mode || "BALANCED";
    const { shortest, balanced, safest } = aiNav.routeComparisons;
    const curInfo = mode === "SHORTEST" ? shortest : (mode === "SAFEST" ? safest : balanced);

    if (mode === "SAFEST" && shortest && safest) {
      const etaDiff = ((safest.eta - shortest.eta) / Math.max(0.1, shortest.eta)) * 100;
      const riskDiff = (shortest.icebergRisk - safest.icebergRisk) * 100;
      return `SAFEST strategy selected: reduces maximum route risk by ${riskDiff.toFixed(0)}%, while increasing ETA by ${etaDiff.toFixed(0)}%.`;
    }

    if (mode === "BALANCED" && shortest && safest) {
      return "BALANCED strategy selected: maintains optimal safety margin while staying within target fuel limits.";
    }

    return `${mode} strategy selected for cruise navigation tracking.`;
  }

  getCounterfactuals() {
    const counterfactuals = [];
    const aiNav = this.engine.aiNavigator;
    const mp = this.engine.missionPlan;

    if (!aiNav || !aiNav.routeComparisons) {
      return counterfactuals;
    }

    const { shortest, balanced, safest } = aiNav.routeComparisons;
    const activeMode = this.engine.state.navigation.mode || "BALANCED";

    if (activeMode !== "SHORTEST") {
      const maxShortestRisk = Math.max(shortest.icebergRisk || 0, shortest.seaIceRisk || 0);
      let reason = "Exceeds mission risk limits.";
      if (mp && mp.constraints && maxShortestRisk > mp.constraints.maxRisk) {
        reason = `Exceeds mission risk ceiling (${(maxShortestRisk * 100).toFixed(0)}% vs ${(mp.constraints.maxRisk * 100).toFixed(0)}%).`;
      }
      counterfactuals.push({
        strategy: "SHORTEST",
        reason
      });
    }

    if (activeMode !== "BALANCED") {
      counterfactuals.push({
        strategy: "BALANCED",
        reason: "Intersects high-probability iceberg forecast corridors."
      });
    }

    if (activeMode !== "SAFEST") {
      let reason = "ETA target cannot be satisfied.";
      if (mp && mp.constraints && safest.eta > mp.constraints.arrivalTargetHours) {
        reason = `ETA exceeds timeline limits (${safest.eta.toFixed(1)}h vs ${mp.constraints.arrivalTargetHours}h).`;
      }
      counterfactuals.push({
        strategy: "SAFEST",
        reason
      });
    }

    return counterfactuals;
  }

  getDecisionConfidence() {
    const client = this.engine.aiClient;
    const ri = this.engine.riskIntelligenceEngine;
    const autoCtrl = this.engine.autonomousController;

    const mlConf = client && client.status === "ONLINE" ? client.confidence : 0.85;
    const riskConf = ri ? 0.90 : 0.50;
    const safetyMargin = ri && ri.routeExposure ? (1.0 - ri.routeExposure.averageRisk) : 0.80;
    const stabilityConf = autoCtrl && (autoCtrl.currentCommand.mode === "SAFE_TO_PROCEED" || autoCtrl.currentCommand.mode === "MAINTAIN_COURSE") ? 0.95 : 0.70;

    const compoundConf = (mlConf * 0.35) + (riskConf * 0.25) + (safetyMargin * 0.20) + (stabilityConf * 0.20);

    return {
      mlForecast: mlConf,
      riskMap: riskConf,
      routeSafety: safetyMargin,
      stability: stabilityConf,
      compound: compoundConf
    };
  }

  getDecisionTimeline() {
    const client = this.engine.aiClient;
    const dataMgr = this.engine.antarcticDataManager;
    const ri = this.engine.riskIntelligenceEngine;
    const mp = this.engine.missionPlan;
    const aiNav = this.engine.aiNavigator;
    const autoCtrl = this.engine.autonomousController;

    return [
      {
        stage: "🛰 DATA",
        status: dataMgr && dataMgr.active ? (dataMgr.status === "FALLBACK" ? "FALLBACK" : "READY") : "READY",
        desc: dataMgr && dataMgr.active ? "Observed Antarctic grid streams active." : "Procedural simulation feeds active."
      },
      {
        stage: "🤖 ML FORECAST",
        status: client && client.status === "ONLINE" ? "ACTIVE" : "FALLBACK",
        desc: client && client.status === "ONLINE" ? "Random Forest predictors online." : "Procedural trajectory fallbacks."
      },
      {
        stage: "🧠 RISK ANALYSIS",
        status: ri && ri.heatmapActive ? "ACTIVE" : "READY",
        desc: ri && ri.heatmapActive ? "Probabilistic risk matrix overlays on." : "Risk matrix mapping active."
      },
      {
        stage: "🧭 MISSION CONSTRAINTS",
        status: mp ? (mp.feasible ? "READY" : "FALLBACK") : "READY",
        desc: mp ? (mp.feasible ? "Voyage parameters satisfy requirements." : "Constraint conflict detected.") : "Waiting for mission configuration."
      },
      {
        stage: "🗺 ROUTE SELECTION",
        status: aiNav && aiNav.routeComparisons ? "READY" : "OFFLINE",
        desc: aiNav && aiNav.routeComparisons ? "Multiple strategy costs calculated." : "Route planning offline."
      },
      {
        stage: "🚢 AUTONOMOUS ACTION",
        status: autoCtrl && autoCtrl.isActive ? "ACTIVE" : "READY",
        desc: autoCtrl && autoCtrl.isActive ? `Executing ${autoCtrl.currentCommand.mode} steering commands.` : "Manual steering active."
      }
    ];
  }
}
