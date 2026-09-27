/**
 * POLARIS Nav-OS — Vessel Maneuvering, Turn-Rate & Rudder-Rate Constraints Engine (Phase 2C)
 *
 * Implements canonical vessel maneuvering state, Nomoto steering limits, speed-dependent turn rates,
 * rudder-rate constraints, longitudinal/lateral acceleration boundaries, and route feasibility evaluation.
 */

export const MANEUVER_STATUS = Object.freeze({
  FEASIBLE: 'FEASIBLE',
  RATE_LIMITED: 'RATE_LIMITED',
  CONSTRAINT_BREACH: 'CONSTRAINT_BREACH',
  EMERGENCY_OVERRIDE: 'EMERGENCY_OVERRIDE'
});

export const DEFAULT_MANEUVERING_CONFIG = {
  maxTurnRateDeg: 15.0,         // deg/s
  maxRudderAngleDeg: 35.0,      // deg
  maxRudderRateDeg: 15.0,       // deg/s
  maxAccelerationSU: 1.5,       // SU/s^2
  maxDecelerationSU: 3.5,       // SU/s^2
  maxLateralAccelSU: 5.0,       // SU/s^2 (v^2 / R)
  nomotoTimeConstantSec: 3.0,   // seconds
  nomotoGain: 1.0
};

export class VesselManeuveringEngine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_MANEUVERING_CONFIG, ...config };
  }

  /**
   * Derive canonical vessel maneuvering state snapshot from ship state.
   */
  getManeuveringState(ship) {
    if (!ship) {
      return {
        heading: 0,
        targetHeading: 0,
        headingRate: 0,
        rudderAngle: 0,
        targetRudderAngle: 0,
        rudderRate: 0,
        speed: 0,
        longitudinalAcceleration: 0,
        lateralAcceleration: 0,
        yawRate: 0,
        maxTurnRate: this.config.maxTurnRateDeg,
        maxRudderAngle: this.config.maxRudderAngleDeg,
        maxRudderRate: this.config.maxRudderRateDeg,
        maxAcceleration: this.config.maxAccelerationSU,
        maxDeceleration: this.config.maxDecelerationSU,
        maneuverabilityStatus: MANEUVER_STATUS.FEASIBLE
      };
    }

    const speed = Math.hypot(ship.vx || 0, ship.vy || 0);
    const headingRate = ship.angularVelocity || 0;
    const rudderAngle = ship.rudder || 0;
    const rudderRate = ship.rudderRate || 0;
    const maxTurnRate = this.getSpeedDependentMaxTurnRate(speed);

    // Compute lateral acceleration v * yawRateRad
    const yawRateRad = (headingRate * Math.PI) / 180.0;
    const lateralAccel = speed * yawRateRad;

    let status = MANEUVER_STATUS.FEASIBLE;
    if (ship._inEmergencyAvoidance) {
      status = MANEUVER_STATUS.EMERGENCY_OVERRIDE;
    } else if (Math.abs(headingRate) >= maxTurnRate || Math.abs(rudderAngle) >= this.config.maxRudderAngleDeg) {
      status = MANEUVER_STATUS.RATE_LIMITED;
    }

    return {
      heading: parseFloat((ship.heading || 0).toFixed(2)),
      targetHeading: parseFloat((ship.targetHeading ?? ship.heading ?? 0).toFixed(2)),
      headingRate: parseFloat(headingRate.toFixed(2)),
      rudderAngle: parseFloat(rudderAngle.toFixed(2)),
      targetRudderAngle: parseFloat((ship.targetRudder || ship.rudder || 0).toFixed(2)),
      rudderRate: parseFloat(rudderRate.toFixed(2)),
      speed: parseFloat(speed.toFixed(2)),
      longitudinalAcceleration: parseFloat((ship.ax || 0).toFixed(2)),
      lateralAcceleration: parseFloat(lateralAccel.toFixed(2)),
      yawRate: parseFloat(headingRate.toFixed(2)),
      maxTurnRate: parseFloat(maxTurnRate.toFixed(2)),
      maxRudderAngle: this.config.maxRudderAngleDeg,
      maxRudderRate: this.config.maxRudderRateDeg,
      maxAcceleration: this.config.maxAccelerationSU,
      maxDeceleration: this.config.maxDecelerationSU,
      maneuverabilityStatus: status
    };
  }

  /**
   * Speed-dependent maximum turn rate (higher speed reduces maximum allowable sharp turn rate).
   */
  getSpeedDependentMaxTurnRate(speedSU = 10.0) {
    if (speedSU <= 5.0) return this.config.maxTurnRateDeg;
    // Scaled turn rate limit: maxTurnRate decreases smoothly at higher speeds
    const factor = Math.max(0.4, 1.0 - (speedSU - 5.0) * 0.03);
    return parseFloat((this.config.maxTurnRateDeg * factor).toFixed(2));
  }

  /**
   * Evaluates if a proposed candidate route polyline is physically executable by vessel dynamics.
   *
   * @param {Array} waypoints - Polyline waypoints [{x,y}, ...]
   * @param {Object} vesselState - Vessel parameters / current state { speed, maxSpeed }
   * @returns {Object} Feasibility evaluation result
   */
  evaluateRouteFeasibility(waypoints = [], vesselState = {}) {
    if (!waypoints || waypoints.length < 2) {
      return { isFeasible: true, maxRequiredTurnRate: 0, maxRequiredRudderRate: 0, maxLateralAccel: 0, failureReason: null };
    }

    const speed = vesselState.speed || vesselState.speedKnots || 12.0;
    const maxTurnRate = this.getSpeedDependentMaxTurnRate(speed);

    let maxReqTurnRate = 0.0;
    let maxReqRudderRate = 0.0;
    let maxLatAccel = 0.0;

    for (let i = 0; i < waypoints.length - 2; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const p3 = waypoints[i + 2];

      const dx1 = p2.x - p1.x;
      const dy1 = p2.y - p1.y;
      const dist1 = Math.hypot(dx1, dy1);

      const dx2 = p3.x - p2.x;
      const dy2 = p3.y - p2.y;
      const dist2 = Math.hypot(dx2, dy2);

      if (dist1 < 1.0 || dist2 < 1.0) continue;

      const h1 = (Math.atan2(dy1, dx1) * 180 / Math.PI + 360) % 360;
      const h2 = (Math.atan2(dy2, dx2) * 180 / Math.PI + 360) % 360;

      let dTurn = Math.abs((h2 - h1 + 540) % 360 - 180);
      const estTimeOnSegment = dist1 / Math.max(1.0, speed);
      const reqTurnRate = dTurn / Math.max(0.5, estTimeOnSegment);

      if (reqTurnRate > maxReqTurnRate) maxReqTurnRate = reqTurnRate;

      // Estimate required rudder rate
      const reqRudderAngle = Math.min(this.config.maxRudderAngleDeg, (reqTurnRate / maxTurnRate) * this.config.maxRudderAngleDeg);
      const reqRudderRate = reqRudderAngle / Math.max(0.5, estTimeOnSegment);
      if (reqRudderRate > maxReqRudderRate) maxReqRudderRate = reqRudderRate;

      // Estimate lateral acceleration
      const yawRateRad = (reqTurnRate * Math.PI) / 180.0;
      const latAccel = speed * yawRateRad;
      if (latAccel > maxLatAccel) maxLatAccel = latAccel;

      // Rejection rules
      if (dTurn > 135.0) {
        return {
          isFeasible: false,
          maxRequiredTurnRate: parseFloat(reqTurnRate.toFixed(2)),
          maxRequiredRudderRate: parseFloat(reqRudderRate.toFixed(2)),
          maxLateralAccel: parseFloat(latAccel.toFixed(2)),
          failureReason: `EXCESSIVE_TURN_ANGLE_${dTurn.toFixed(0)}DEG`
        };
      }

      if (reqTurnRate > maxTurnRate * 1.5) {
        return {
          isFeasible: false,
          maxRequiredTurnRate: parseFloat(reqTurnRate.toFixed(2)),
          maxRequiredRudderRate: parseFloat(reqRudderRate.toFixed(2)),
          maxLateralAccel: parseFloat(latAccel.toFixed(2)),
          failureReason: `TURN_RATE_LIMIT_EXCEEDED_${reqTurnRate.toFixed(1)}DEG/S`
        };
      }

      if (latAccel > this.config.maxLateralAccelSU * 1.5) {
        return {
          isFeasible: false,
          maxRequiredTurnRate: parseFloat(reqTurnRate.toFixed(2)),
          maxRequiredRudderRate: parseFloat(reqRudderRate.toFixed(2)),
          maxLateralAccel: parseFloat(latAccel.toFixed(2)),
          failureReason: `LATERAL_ACCEL_LIMIT_EXCEEDED_${latAccel.toFixed(1)}SU/S2`
        };
      }
    }

    return {
      isFeasible: true,
      maxRequiredTurnRate: parseFloat(maxReqTurnRate.toFixed(2)),
      maxRequiredRudderRate: parseFloat(maxReqRudderRate.toFixed(2)),
      maxLateralAccel: parseFloat(maxLatAccel.toFixed(2)),
      failureReason: null
    };
  }

  /**
   * Assesses if own vessel can physically execute avoidance maneuver before CPA/TCPA breach with an AIS target.
   */
  assessAvoidanceFeasibility(ownShip = {}, targetState = {}, minSafeClearance = 45.0) {
    if (!ownShip || !targetState) return { achievable: true, minTimeToAvoid: 0.0, requiredTurnAngle: 0.0 };

    const dx = targetState.x - ownShip.x;
    const dy = targetState.y - ownShip.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 1500.0) return { achievable: true, minTimeToAvoid: 0.0, requiredTurnAngle: 0.0 };

    const speed = Math.hypot(ownShip.vx || 0, ownShip.vy || 0);
    const maxTurnRate = this.getSpeedDependentMaxTurnRate(speed);

    // Required evasion angle to clear safety envelope
    const requiredTurnAngle = 35.0; // Standard 35 deg avoidance alteration
    const timeToAchieveTurn = requiredTurnAngle / maxTurnRate; // e.g. 35 / 15 = 2.33s

    // Estimated TCPA
    const rvx = (ownShip.vx || 0) - (targetState.vx || 0);
    const rvy = (ownShip.vy || 0) - (targetState.vy || 0);
    const rvSq = rvx * rvx + rvy * rvy;
    let tcpa = 999.0;
    if (rvSq > 0.001) {
      tcpa = Math.max(0, -(dx * rvx + dy * rvy) / rvSq);
    }

    const achievable = tcpa >= timeToAchieveTurn;

    return {
      achievable,
      tcpa: parseFloat(tcpa.toFixed(1)),
      minTimeToAvoid: parseFloat(timeToAchieveTurn.toFixed(1)),
      requiredTurnAngle
    };
  }
}

export const vesselManeuveringEngine = new VesselManeuveringEngine();
