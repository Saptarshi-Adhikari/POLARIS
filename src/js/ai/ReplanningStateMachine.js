/**
 * POLARIS DIGITAL TWIN — Tiered Replanning Trigger State Machine
 *
 * Implements four explicit replanning states:
 *   - NORMAL: Route is fully safe. Obey 3-second stability hysteresis for route updates.
 *   - CAUTION: Hazard predicted to enter route corridor. Immediately begin background route evaluation.
 *   - URGENT: Hard safety margin likely violated within short horizon (<30s). Bypass cooldown, generate first-safe route.
 *   - EMERGENCY: Imminent collision (<15s) or physical breach. Bypass cooldown completely, reduce speed, reroute immediately.
 */

import { continuousCollisionValidator } from './continuousCollisionValidator.js';

export class ReplanningStateMachine {
  constructor(options = {}) {
    this.state = 'NORMAL';
    this.lastState = 'NORMAL';
    this.lastTriggerTimeMs = 0;
    this.cautionDcpaThreshold = options.cautionDcpaThreshold || 120.0;
    this.cautionTcpaThresholdHours = options.cautionTcpaThresholdHours || (60.0 / 3600.0); // 60 seconds
  }

  /**
   * Evaluate current vessel state, active route, and moving hazards to determine state tier.
   */
  evaluateState(shipState, activeRoute, icebergs = [], vessel = null) {
    if (!activeRoute || !activeRoute.waypoints || activeRoute.waypoints.length < 2) {
      this.state = 'NORMAL';
      return { state: 'NORMAL', bypassCooldown: false, triggerReason: 'INITIAL' };
    }

    const vState = {
      x: shipState.x,
      y: shipState.y,
      heading: shipState.heading || 0,
      speed: Math.hypot(shipState.vx || 0, shipState.vy || 0) || shipState.speed || 15.0,
      vx: shipState.vx || 0,
      vy: shipState.vy || 0,
      length: vessel?.length || 80.0,
      beam: vessel?.beam || 20.0
    };

    let shortestTcpa = Infinity;
    let minDcpa = Infinity;
    let minClearance = Infinity;
    let threatHazard = null;

    for (const ice of icebergs) {
      const { cpa, tcpa } = continuousCollisionValidator.calculateCPATCPA(vState, ice);
      const res = continuousCollisionValidator.calculateVesselToIcebergClearance(vState, ice, 0);

      if (res.clearance < minClearance) minClearance = res.clearance;

      if (tcpa > 0 && tcpa < shortestTcpa) {
        shortestTcpa = tcpa;
        minDcpa = cpa;
        threatHazard = ice;
      }
    }

    // 1. EMERGENCY check
    if (minClearance <= 15.0 || (shortestTcpa <= 15.0 && minDcpa < 60.0)) {
      this.lastState = this.state;
      this.state = 'EMERGENCY';
      return {
        state: 'EMERGENCY',
        bypassCooldown: true,
        triggerReason: 'IMMINENT_COLLISION',
        threatHazard,
        minClearance,
        shortestTcpa,
        minDcpa
      };
    }

    // 2. URGENT check: Route space/time validation fails or CPA within 30s
    const routeVal = continuousCollisionValidator.validateFullRoute(activeRoute.waypoints, vessel, icebergs, vState.speed);
    if (!routeVal.isValid || (shortestTcpa <= 30.0 && minDcpa < 80.0)) {
      this.lastState = this.state;
      this.state = 'URGENT';
      return {
        state: 'URGENT',
        bypassCooldown: true,
        triggerReason: !routeVal.isValid ? 'ROUTE_INVALIDATED' : 'URGENT_DCPA_BREACH',
        threatHazard,
        minClearance: routeVal.minPredictedClearance,
        shortestTcpa,
        minDcpa
      };
    }

    // 3. CAUTION check: Hazard predicted to enter corridor within 60s
    if (shortestTcpa <= 60.0 && minDcpa < this.cautionDcpaThreshold) {
      this.lastState = this.state;
      this.state = 'CAUTION';
      return {
        state: 'CAUTION',
        bypassCooldown: false, // Evaluate alternatives in background
        triggerReason: 'CAUTION_PREDICTED_APPROACH',
        threatHazard,
        minClearance,
        shortestTcpa,
        minDcpa
      };
    }

    // 4. NORMAL state
    this.lastState = this.state;
    this.state = 'NORMAL';
    return {
      state: 'NORMAL',
      bypassCooldown: false,
      triggerReason: 'ROUTE_CLEAR',
      minClearance,
      shortestTcpa,
      minDcpa
    };
  }
}

export const replanningStateMachine = new ReplanningStateMachine();
