export class CounterfactualSimulator {
  constructor(engine) {
    this.engine = engine;
    this.baseline = null;
    this.hypothetical = {
      windMult: 1.0,
      currentMult: 1.0,
      seaIceDelta: 0.0,
      icebergUncertainty: 1.0,
      targetEtaHours: null
    };
    this.results = null;
    this.showHypotheticalRoute = false;
    this.hypotheticalRoute = null;
  }

  captureBaseline() {
    const state = this.engine.state;
    const aiNav = this.engine.aiNavigator;
    const ship = this.engine.ship;

    if (!state || !aiNav || !ship) return;

    const baseEta = aiNav.route ? aiNav.route.eta : 12.0;
    const baseFuel = aiNav.route ? aiNav.route.fuelUsed : 45.0;
    const baseRisk = aiNav.route ? (aiNav.route.icebergRisk || 0.1) : 0.1;

    this.baseline = {
      eta: baseEta,
      fuel: baseFuel,
      risk: baseRisk,
      environment: JSON.parse(JSON.stringify(state.environment)),
      vessel: {
        x: ship.x,
        y: ship.y,
        heading: ship.heading,
        throttle: state.vessel.throttle
      }
    };
  }

  setHypotheticalConditions(wind, current, ice, iceberg, targetEta = null) {
    this.hypothetical.windMult = wind;
    this.hypothetical.currentMult = current;
    this.hypothetical.seaIceDelta = ice;
    this.hypothetical.icebergUncertainty = iceberg;
    this.hypothetical.targetEtaHours = targetEta;
  }

  runSimulation() {
    if (!this.baseline) {
      this.captureBaseline();
    }
    if (!this.baseline) return;

    const aiNav = this.engine.aiNavigator;
    if (!aiNav || !aiNav.route) return;

    // 1. Analytical ETA Estimation
    // Traverse segments of the active route, scaling travel speed based on current/wind vectors and sea-ice resistance
    let totalTime = 0;
    let totalFuel = 0;
    const waypoints = aiNav.route.waypoints || [];
    const speedBase = this.engine.state.vessel.maxSpeed || 20.0;
    const dragCoeff = this.engine.state.vessel.dragCoefficient || 0.04;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i+1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypotenuse ? Math.hypotenuse(dx, dy) : Math.hypot(dx, dy);

      // Environment at midpoint
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;

      // Current factor
      const vec = this.engine.vectorField.getVelocityAt(mx, my, totalTime, this.engine.state);
      const hypCurrentU = vec.u * this.hypothetical.currentMult;
      const hypCurrentV = vec.v * this.hypothetical.currentMult;

      // Project currents along segment directions
      const segLen = dist || 1.0;
      const ux = dx / segLen;
      const uy = dy / segLen;
      const projCurrent = (hypCurrentU * ux) + (hypCurrentV * uy);

      // Ice resistance delta
      const baseIce = this.engine.vectorField.getSeaIceConcentration(mx, my);
      const hypIce = Math.max(0.0, Math.min(1.0, baseIce + this.hypothetical.seaIceDelta));
      const iceSlowdown = 1.0 - (hypIce * 0.6);

      const speed = Math.max(2.0, (speedBase + projCurrent) * iceSlowdown);
      const segTime = dist / speed;

      totalTime += segTime;
      // Fuel consumption scales with velocity + drag + wind gust drag
      const gustDrag = 1.0 + (this.hypothetical.windMult * 0.15);
      totalFuel += segTime * (this.baseline.vessel.throttle * 0.02) * gustDrag * (1.0 + hypIce * 0.4);
    }

    // Convert estimated simulator frames to simulated hours
    const hypEta = Math.max(2.0, totalTime / 15);
    const hypFuel = Math.min(100.0, totalFuel * 2.5);

    // 2. Risk Estimation
    const hypRiskVal = Math.min(0.95, this.baseline.risk * this.hypothetical.icebergUncertainty * (1.0 + this.hypothetical.seaIceDelta * 1.5));
    let riskStr = "LOW";
    if (hypRiskVal > 0.6) riskStr = "CRITICAL";
    else if (hypRiskVal > 0.4) riskStr = "HIGH";
    else if (hypRiskVal > 0.25) riskStr = "MODERATE";

    // Build Hypothetical Shadow Route path (slightly offset for rendering preview)
    this.hypotheticalRoute = waypoints.map(wp => ({
      x: wp.x + (hypRiskVal > 0.4 ? 12 : 5),
      y: wp.y - (hypRiskVal > 0.4 ? 12 : 5)
    }));

    // 3. AI Recommendation & Tradeoffs
    let recStrategy = "BALANCED";
    let recAction = "MAINTAIN COURSE";
    let reasons = [];
    let warnings = [];

    const mp = this.engine.missionPlan;
    const maxRiskLimit = mp && mp.constraints ? mp.constraints.maxRisk : 0.45;
    const maxFuelLimit = mp && mp.constraints ? mp.constraints.maxFuelPercent : 65;

    if (hypRiskVal > maxRiskLimit) {
      recStrategy = "SAFEST";
      recAction = "REROUTE REQUIRED (WESTWAY)";
      reasons.push(`Hypothetical risk (${(hypRiskVal * 100).toFixed(0)}%) exceeds mission threshold (${(maxRiskLimit * 100).toFixed(0)}%).`);
      warnings.push("ICE RISK CORRIDOR DETECTED");
    } else if (hypFuel > maxFuelLimit) {
      recStrategy = "DELAY_DEPARTURE";
      recAction = "REDUCE VELOCITY / DELAY";
      reasons.push(`Estimated fuel consumption (${hypFuel.toFixed(0)}%) exceeds constraints.`);
    } else {
      reasons.push("Hypothetical settings remain safe for active strategy transit.");
    }

    this.results = {
      baseline: {
        eta: this.baseline.eta,
        fuel: this.baseline.fuel,
        risk: this.baseline.risk
      },
      hypothetical: {
        eta: hypEta,
        fuel: hypFuel,
        risk: hypRiskVal,
        riskLabel: riskStr
      },
      recommendation: {
        strategy: recStrategy,
        action: recAction,
        confidence: Math.max(0.4, 0.90 - (hypRiskVal * 0.3)),
        reasons,
        warnings
      }
    };
  }

  reset() {
    this.hypothetical = {
      windMult: 1.0,
      currentMult: 1.0,
      seaIceDelta: 0.0,
      icebergUncertainty: 1.0,
      targetEtaHours: null
    };
    this.results = null;
    this.hypotheticalRoute = null;
  }

  invalidate() {
    this.baseline = null;
  }
}
