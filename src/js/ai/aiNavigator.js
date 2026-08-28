/**
 * POLARIS DIGITAL TWIN - AI Navigation & Dynamic Risk Engine
 */

export class AINavigator {
  constructor(width = 1200, height = 800) {
    this.width = width;
    this.height = height;
    this.riskScore = 0.14; // 0.0 to 1.0
    this.riskLevel = 'LOW'; // 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    this.routeConfidence = 92.4; // %
    this.optimalFuelRate = 12.8; // t/d
    this.currentFuelRate = 14.2; // t/d
    this.isRerouting = false;
    this.rerouteAlert = false;
    this.rerouteMessage = '';

    this.optimalRoute = [];
    this.hazardZones = [];
    this.riskGrid = [];

    this.initRiskGrid(20, 15);
  }

  initRiskGrid(cols = 20, rows = 15) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = this.width / cols;
    this.cellH = this.height / rows;
    this.riskGrid = Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  evaluate(ship, icebergs, vectorField, simTimeHours) {
    // 1. Build Risk Grid Map
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cx = c * this.cellW + this.cellW / 2;
        const cy = r * this.cellH + this.cellH / 2;
        let risk = 0;

        for (let ice of icebergs) {
          // Distance to current iceberg position
          const dCurr = Math.hypot(cx - ice.x, cy - ice.y);
          const hazardRadius = (ice.size / 10) + 60; // px
          if (dCurr < hazardRadius * 2) {
            risk += Math.pow(1 - dCurr / (hazardRadius * 2), 2) * 0.8;
          }

          // Distance to projected future iceberg positions (6h, 12h, 24h)
          for (let f of ice.trajectoryForecast) {
            const dFut = Math.hypot(cx - f.x, cy - f.y);
            if (dFut < hazardRadius * 1.5) {
              risk += Math.pow(1 - dFut / (hazardRadius * 1.5), 2) * 0.5;
            }
          }
        }

        this.riskGrid[r][c] = Math.min(1.0, risk);
      }
    }

    // 2. Compute Ship's Collision Risk Score
    let maxShipRisk = 0;
    for (let ice of icebergs) {
      const dShip = Math.hypot(ship.x - ice.x, ship.y - ice.y);
      const minDistance = (ice.size / 10) + 40;

      if (dShip < minDistance * 3) {
        const rVal = Math.pow(1 - dShip / (minDistance * 3), 1.5);
        if (rVal > maxShipRisk) maxShipRisk = rVal;
      }

      // Check projected ship vector collision with iceberg forecast
      for (let f of ice.trajectoryForecast) {
        // Project ship forward 2 hours
        const shipFutureX = ship.x + ship.vx * 7200;
        const shipFutureY = ship.y + ship.vy * 7200;
        const dFutureCollision = Math.hypot(shipFutureX - f.x, shipFutureY - f.y);
        if (dFutureCollision < minDistance * 2.5) {
          const rVal = Math.pow(1 - dFutureCollision / (minDistance * 2.5), 1.2) * 0.9;
          if (rVal > maxShipRisk) maxShipRisk = rVal;
        }
      }
    }

    // Storm modifier
    if (vectorField.stormMode) {
      maxShipRisk = Math.min(1.0, maxShipRisk + 0.35);
    }

    this.riskScore = parseFloat(maxShipRisk.toFixed(2));

    if (this.riskScore < 0.25) this.riskLevel = 'LOW';
    else if (this.riskScore < 0.55) this.riskLevel = 'MEDIUM';
    else if (this.riskScore < 0.8) this.riskLevel = 'HIGH';
    else this.riskLevel = 'CRITICAL';

    // Route Confidence & Fuel Projections
    this.routeConfidence = parseFloat(Math.max(45, 98.5 - this.riskScore * 40 - (vectorField.stormMode ? 15 : 0)).toFixed(1));
    this.currentFuelRate = parseFloat(ship.fuelBurnRatePerDay.toFixed(1));
    this.optimalFuelRate = parseFloat((ship.fuelBurnRatePerDay * 0.88).toFixed(1));

    // Check if current route is obstructed
    const isObstructed = this.riskScore > 0.45;
    if (isObstructed && !this.isRerouting) {
      this.triggerReroute(ship, icebergs);
    }

    // Generate Safe Path if none exists or rerouted
    if (this.optimalRoute.length === 0 || this.isRerouting) {
      this.generateOptimalRoute(ship, icebergs);
    }
  }

  triggerReroute(ship, icebergs) {
    this.isRerouting = true;
    this.rerouteAlert = true;
    this.rerouteMessage = '🚨 EXISTING ROUTE NO LONGER OPTIMAL — AUTOMATIC REROUTING ENGAGED';
    setTimeout(() => {
      this.isRerouting = false;
    }, 1200);
  }

  generateOptimalRoute(ship, icebergs) {
    // Generate an optimal path around hazard zones towards destination target
    const startX = ship.x;
    const startY = ship.y;
    const endX = this.width - 150;
    const endY = 150;

    // Intermediate control waypoints with dynamic obstacle avoidance curve
    let midX1 = startX + (endX - startX) * 0.35;
    let midY1 = startY + (endY - startY) * 0.35;
    let midX2 = startX + (endX - startX) * 0.7;
    let midY2 = startY + (endY - startY) * 0.7;

    // Shift waypoints based on iceberg center of mass
    let avgIceX = 0, avgIceY = 0, count = 0;
    for (let ice of icebergs) {
      avgIceX += ice.x;
      avgIceY += ice.y;
      count++;
    }
    if (count > 0) {
      avgIceX /= count;
      avgIceY /= count;
      // Push route away from iceberg concentration
      const shiftDirY = avgIceY > this.height / 2 ? -120 : 120;
      midY1 += shiftDirY * 0.6;
      midY2 += shiftDirY * 0.4;
    }

    // Generate smoothed polyline waypoints
    this.optimalRoute = [
      { x: startX, y: startY },
      { x: midX1, y: midY1 },
      { x: midX2, y: midY2 },
      { x: endX, y: endY }
    ];

    // Assign route waypoints to ship if in Autopilot mode
    if (ship.mode === 'AUTOPILOT') {
      ship.setRouteWaypoints(this.optimalRoute);
    }
  }
}
