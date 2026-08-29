export class RiskIntelligenceEngine {
  constructor(engine) {
    this.engine = engine;
    this.gridW = 48;
    this.gridH = 32;
    this.cellW = 3600 / this.gridW;
    this.cellH = 2400 / this.gridH;
    
    this.riskGrid = Array(this.gridW).fill(null).map(() => Array(this.gridH).fill(0).map(() => ({
      x: 0,
      y: 0,
      risk: 0.0,
      icebergRisk: 0.0,
      seaIceRisk: 0.0,
      uncertaintyRisk: 0.0,
      routeRisk: 0.0,
      confidence: 1.0,
      classification: "LOW"
    })));

    this.lastUpdateTime = 0;
    this.updateInterval = 1500; // 1.5 seconds throttle

    this.routeExposure = {
      averageRisk: 0.0,
      maximumRisk: 0.0,
      criticalDistance: 0.0,
      highRiskDistance: 0.0,
      safeDistance: 0.0,
      criticalZones: 0
    };

    this.heatmapActive = false;
  }

  getRiskAt(wx, wy) {
    const gx = Math.min(this.gridW - 1, Math.max(0, Math.floor(wx / this.cellW)));
    const gy = Math.min(this.gridH - 1, Math.max(0, Math.floor(wy / this.cellH)));
    return this.riskGrid[gx][gy];
  }

  update(timestamp, force = false) {
    if (!force && timestamp - this.lastUpdateTime < this.updateInterval) {
      return;
    }
    this.lastUpdateTime = timestamp;

    const ship = this.engine.ship;
    const icebergs = this.engine.icebergs;
    const state = this.engine.state;
    const client = this.engine.aiClient;
    const env = state.environment;

    // Resolve base metrics
    const averageSeaIce = env.seaIce.enabled ? env.seaIce.averageConcentration : 0.0;
    const seaIceTrendVal = client && client.seaIceForecast ? (client.seaIceForecast.ice_24h - client.seaIceForecast.current_ice) : 0.0;
    const seaIceConfVal = client && client.status === "ONLINE" && client.seaIceForecast ? client.seaIceForecast.confidence : 0.8;

    // Loop through cell grid
    for (let x = 0; x < this.gridW; x++) {
      for (let y = 0; y < this.gridH; y++) {
        const wx = (x + 0.5) * this.cellW;
        const wy = (y + 0.5) * this.cellH;
        
        let icebergRisk = 0.0;
        let totalConfidenceSum = 0.0;
        let predictionCount = 0;

        // Iceberg risk: smooth Gaussian decay around actual and predicted positions
        for (let ice of icebergs) {
          // Distance to actual position
          const distActual = Math.hypot(wx - ice.x, wy - ice.y);
          const influenceActual = Math.exp(-distActual / 75.0);
          icebergRisk = Math.max(icebergRisk, influenceActual);

          // Proximity to predicted ML coordinates
          if (ice.mlTrajectory && client && client.status === "ONLINE") {
            for (let p of ice.mlTrajectory) {
              const distPred = Math.hypot(wx - p.x, wy - p.y);
              const sigma = 60.0 + (p.uncertainty || 15.0);
              const influencePred = Math.exp(-distPred / sigma);
              
              // Scale risk influence by prediction confidence
              const weightedInfluence = influencePred * (p.confidence || 0.85);
              icebergRisk = Math.max(icebergRisk, weightedInfluence);
              
              totalConfidenceSum += p.confidence || 0.85;
              predictionCount++;
            }
          }
        }

        // Sea ice risk
        let seaIceRisk = averageSeaIce;
        if (seaIceTrendVal > 0.05) {
          // If trend is worsening, future risk scales higher
          seaIceRisk += seaIceTrendVal * 0.35;
        }
        seaIceRisk = Math.min(1.0, Math.max(0.0, seaIceRisk));

        // Combined risk
        const combinedRisk = Math.max(icebergRisk, seaIceRisk);
        
        // Expose parameters
        const cell = this.riskGrid[x][y];
        cell.x = wx;
        cell.y = wy;
        cell.icebergRisk = icebergRisk;
        cell.seaIceRisk = seaIceRisk;
        cell.risk = combinedRisk;
        cell.confidence = predictionCount > 0 ? (totalConfidenceSum / predictionCount) : 1.0;

        // Classification
        if (combinedRisk >= 0.75) {
          cell.classification = "CRITICAL";
        } else if (combinedRisk >= 0.50) {
          cell.classification = "HIGH";
        } else if (combinedRisk >= 0.25) {
          cell.classification = "MODERATE";
        } else {
          cell.classification = "LOW";
        }
      }
    }

    // Analyze Route Exposure
    this.analyzeRouteExposure();
  }

  analyzeRouteExposure() {
    const ship = this.engine.ship;
    const waypoints = ship.routeWaypoints || [];
    
    if (waypoints.length === 0) {
      this.routeExposure = {
        averageRisk: 0.0,
        maximumRisk: 0.0,
        criticalDistance: 0.0,
        highRiskDistance: 0.0,
        safeDistance: 0.0,
        criticalZones: 0
      };
      return;
    }

    let totalRisk = 0.0;
    let maxRisk = 0.0;
    let critDist = 0.0;
    let highDist = 0.0;
    let safeDist = 0.0;
    let critZones = 0;
    let inCriticalZone = false;

    // Sample route positions at discrete increments
    for (let i = 0; i < waypoints.length; i++) {
      const pt = waypoints[i];
      const cell = this.getRiskAt(pt.x, pt.y);
      const risk = cell ? cell.risk : 0.0;

      totalRisk += risk;
      maxRisk = Math.max(maxRisk, risk);

      if (risk >= 0.75) {
        critDist += 1.0; // conceptual segment length representation
        if (!inCriticalZone) {
          critZones++;
          inCriticalZone = true;
        }
      } else {
        inCriticalZone = false;
        if (risk >= 0.50) {
          highDist += 1.0;
        } else {
          safeDist += 1.0;
        }
      }
    }

    this.routeExposure = {
      averageRisk: totalRisk / waypoints.length,
      maximumRisk: maxRisk,
      criticalDistance: critDist * 10, // scaling helper
      highRiskDistance: highDist * 10,
      safeDistance: safeDist * 10,
      criticalZones: critZones
    };
  }

  getExplanation() {
    const exp = {
      classification: "LOW",
      topThreat: "NONE",
      reasons: []
    };

    const maxRisk = this.routeExposure.maximumRisk;
    const client = this.engine.aiClient;

    if (maxRisk >= 0.75) {
      exp.classification = "CRITICAL";
      exp.topThreat = this.routeExposure.criticalDistance > 0 ? "ICEBERG_CORRIDOR" : "EXTREME_SEA_ICE";
      exp.reasons.push("Critical hazard exposure detected along route corridor.");
    } else if (maxRisk >= 0.50) {
      exp.classification = "HIGH";
      exp.topThreat = "WORSENING_ICE";
      exp.reasons.push("High density navigation risk forecast on current path.");
    } else if (maxRisk >= 0.25) {
      exp.classification = "MODERATE";
      exp.topThreat = "ENVIRONMENTAL_Friction";
      exp.reasons.push("Moderate environmental resistance forces detected.");
    } else {
      exp.classification = "LOW";
      exp.topThreat = "NONE";
      exp.reasons.push("Safe navigation margins verified across all horizons.");
    }

    if (client && client.status === "ONLINE") {
      exp.reasons.push(`ML predictions processed with ${(client.confidence * 100).toFixed(0)}% confidence.`);
    } else {
      exp.reasons.push("Operating in local deterministic fallback mode (ML service offline).");
    }

    return exp;
  }

  getRouteExposure() {
    return this.routeExposure;
  }

  getSnapshot() {
    return {
      active: this.heatmapActive,
      maxRouteRisk: this.routeExposure.maximumRisk,
      avgRouteRisk: this.routeExposure.averageRisk,
      classification: this.getExplanation().classification
    };
  }
}
