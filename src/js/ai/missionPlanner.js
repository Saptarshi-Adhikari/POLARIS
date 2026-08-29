export class MissionPlanner {
  constructor(engine) {
    this.engine = engine;
    this.currentPlan = null;
    this.outdated = false;
  }

  planMission(constraints) {
    const aiNav = this.engine.aiNavigator;
    if (!aiNav || !aiNav.routeComparisons) {
      return {
        feasible: false,
        recommendedStrategy: "BALANCED",
        confidence: 0.5,
        constraints,
        recommended: null,
        alternatives: [],
        tradeoffs: ["No calculated route strategies available. Recalculate route first."],
        explanation: "Cannot formulate plan: A* route strategies are unavailable."
      };
    }

    const { shortest, balanced, safest } = aiNav.routeComparisons;
    const strategies = [
      { name: "SHORTEST", label: "SPEED", info: shortest },
      { name: "BALANCED", label: "BALANCED", info: balanced },
      { name: "SAFEST", label: "SAFETY", info: safest }
    ];

    const maxFuelLimit = 2500.0; // Reference maximum fuel volume
    const evaluated = strategies.map(strat => {
      const fuelPercent = Math.min(100, Math.max(0, (strat.info.fuel / maxFuelLimit) * 100));
      const maxRisk = Math.min(1.0, Math.max(0.0, Math.max(strat.info.icebergRisk || 0, strat.info.seaIceRisk || 0)));
      const safetyMargin = Math.min(1.0, Math.max(0.0, strat.info.overallSafety || (1.0 - maxRisk)));
      const eta = strat.info.eta;

      // Feasibility checks
      const fuelFeasible = fuelPercent <= constraints.maxFuelPercent;
      const riskFeasible = maxRisk <= constraints.maxRisk;
      const etaFeasible = eta <= constraints.arrivalTargetHours;
      const feasible = fuelFeasible && riskFeasible && etaFeasible;

      // Scoring
      let score = 0;
      if (constraints.priority === "SAFETY") {
        score = safetyMargin * 2.0 - maxRisk * 1.5 - (fuelFeasible ? 0 : 2.0) - (etaFeasible ? 0 : 1.0);
      } else if (constraints.priority === "SPEED") {
        score = (1.0 - Math.min(2.0, eta / constraints.arrivalTargetHours)) * 2.0 - maxRisk * 3.0 - (fuelFeasible ? 0 : 1.0);
      } else {
        // BALANCED
        score = safetyMargin * 1.0 + (1.0 - Math.min(2.0, eta / constraints.arrivalTargetHours)) * 1.0 - (fuelPercent / constraints.maxFuelPercent) * 0.5;
      }

      return {
        strategy: strat.name,
        etaHours: eta,
        fuelPercent,
        maxRisk,
        safetyMargin,
        feasible,
        score
      };
    });

    // Pick best strategy
    let recommended = null;
    const feasibleOptions = evaluated.filter(e => e.feasible);
    
    if (feasibleOptions.length > 0) {
      feasibleOptions.sort((a, b) => b.score - a.score);
      recommended = feasibleOptions[0];
    } else {
      // Pick strategy with lowest risk / least violations
      const sortedByRisk = [...evaluated].sort((a, b) => a.maxRisk - b.maxRisk);
      recommended = sortedByRisk[0];
    }

    const recommendedInfo = recommended;
    const isPlanFeasible = feasibleOptions.length > 0;

    // Compile tradeoffs
    const tradeoffs = [];
    const fastestStrat = evaluated.find(e => e.strategy === "SHORTEST");
    const safestStrat = evaluated.find(e => e.strategy === "SAFEST");

    if (recommendedInfo.strategy !== "SHORTEST" && fastestStrat) {
      const etaDiff = recommendedInfo.etaHours - fastestStrat.etaHours;
      tradeoffs.push(`+${etaDiff.toFixed(1)}h duration compared with fastest route.`);
    }
    if (recommendedInfo.strategy !== "SAFEST" && safestStrat) {
      const riskDiff = recommendedInfo.maxRisk - safestStrat.maxRisk;
      tradeoffs.push(`+${(riskDiff * 100).toFixed(0)}% predicted hazard exposure compared with safest route.`);
    } else if (safestStrat) {
      tradeoffs.push(`-${((fastestStrat.maxRisk - safestStrat.maxRisk) * 100).toFixed(0)}% risk reduction achieved.`);
    }

    if (recommendedInfo.fuelPercent <= constraints.maxFuelPercent) {
      tradeoffs.push("Maintains fuel consumption within budget targets.");
    } else {
      tradeoffs.push("Exceeds fuel budget limits.");
    }

    // Determine explanation
    let explanation = "";
    if (isPlanFeasible) {
      explanation = `ASTRALIS recommends ${recommendedInfo.strategy} because it meets all voyage constraints and maximizes ${constraints.priority.toLowerCase()} priorities.`;
    } else {
      explanation = `CONSTRAINT CONFLICT: No route fully satisfies all constraints. Recommended alternative is ${recommendedInfo.strategy} as it minimizes hazard exposure.`;
    }

    const client = this.engine.aiClient;
    const confidence = client && client.status === "ONLINE" ? client.confidence : 0.85;

    this.currentPlan = {
      feasible: isPlanFeasible,
      recommendedStrategy: recommendedInfo.strategy,
      confidence,
      constraints,
      recommended: recommendedInfo,
      alternatives: evaluated.filter(e => e.strategy !== recommendedInfo.strategy),
      tradeoffs,
      explanation
    };

    this.outdated = false;
    return this.currentPlan;
  }
}
