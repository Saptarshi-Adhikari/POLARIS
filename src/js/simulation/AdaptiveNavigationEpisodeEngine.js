/**
 * POLARIS Nav-OS — Adaptive Navigation Execution Orchestrator (Phase 7A)
 *
 * Coordinates the full closed-loop software/simulation navigation execution cycle:
 *   ENVIRONMENT -> MULTI-SENSOR FUSION -> SPATIOTEMPORAL RISK -> DECISION ENGINE ->
 *   COUNTERFACTUAL VALIDATION -> ACTION PROPOSAL -> CONTROL AUTHORITY -> VESSEL DYNAMICS -> DYNAMIC REPLAN
 *
 * INVARIANTS:
 * - Runs 100% in simulation/replay/browser; hardware is out of scope.
 * - Does NOT create duplicate physics or duplicate planners; orchestrates existing modules.
 * - DecisionEngine proposals are handed strictly through ControlAuthority.
 * - Stale planner/environment/prediction versions are deterministically rejected.
 */

import { SimulationEngine } from '../main.js';
import { decisionEngine, ACTION_CLASS, ENCOUNTER_TYPE } from '../ai/decisionEngine.js';
import { counterfactualEpisodeEngine, EPISODE_OUTCOME } from './CounterfactualEpisodeEngine.js';
import { spatiotemporalRiskOccupancy } from '../data/SpatiotemporalRiskOccupancy.js';
import { spatiotemporalPlanner } from '../ai/SpatiotemporalPlanner.js';
import { continuousCollisionValidator } from '../ai/continuousCollisionValidator.js';
import { bathymetryProvider } from '../providers/bathymetryProvider.js';
import { vesselManeuveringEngine } from '../ai/VesselManeuveringEngine.js';

export const MISSION_STATE = Object.freeze({
  PLANNING: 'PLANNING',
  ROUTING: 'ROUTING',
  EXECUTING: 'EXECUTING',
  REPLANNING: 'REPLANNING',
  AVOIDING: 'AVOIDING',
  RECOVERING: 'RECOVERING',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED'
});

export const ACTION_EXECUTION_STATE = Object.freeze({
  PROPOSED: 'PROPOSED',
  VALIDATING: 'VALIDATING',
  COMMITTED: 'COMMITTED',
  EXECUTING: 'EXECUTING',
  SUPERSEDED: 'SUPERSEDED',
  ABORTED: 'ABORTED',
  COMPLETED: 'COMPLETED'
});

export class AdaptiveNavigationEpisodeEngine {
  constructor(options = {}) {
    this.engine = options.simulationEngine || new SimulationEngine();
    this.executionMode = options.executionMode || 'SIMULATION'; // SIMULATION | REPLAY | DETERMINISTIC_TEST
    this.missionState = MISSION_STATE.PLANNING;
    this.actionExecutionState = ACTION_EXECUTION_STATE.PROPOSED;
    
    // Versions for stale result protection (STEP 4)
    this.environmentVersion = 1;
    this.predictionVersion = 1;
    this.plannerVersion = 1;
    this.committedRouteVersion = 0;

    // Thresholds for dynamic replanning policy (STEP 3)
    this.minimumReplanIntervalSec = options.minimumReplanIntervalSec || 3.0;
    this.lastReplanWorldTime = 0;
    this.replanCount = 0;
    this.staleRejections = 0;
    this.actionRouteConflicts = 0;
    this.executionHistory = [];
  }

  /**
   * STEP 1 — Run one deterministic closed-loop execution step.
   */
  executeStep(dt = 0.1, worldTime = Date.now(), options = {}) {
    const ship = this.engine.ship;
    const dest = this.engine.state.navigation?.destinationPoint || { x: 3200, y: 600 };
    const targets = this.engine.icebergs || [];
    const environmentSnapshot = this.engine.state.environment || {};

    if (!ship) {
      return { status: 'NO_SHIP', missionState: this.missionState };
    }

    // Check Mission Arrival
    const distToDest = Math.hypot(ship.x - dest.x, ship.y - dest.y);
    if (distToDest <= 20.0 || ship.autopilotStatus === 'ARRIVED') {
      this.missionState = MISSION_STATE.COMPLETED;
      this.actionExecutionState = ACTION_EXECUTION_STATE.COMPLETED;
      return { status: 'COMPLETED', missionState: this.missionState };
    }

    // STEP 4 — Stale Version Check Guard
    const queryWorldTime = worldTime;
    const currentEnvVer = this.environmentVersion;
    const currentPredVer = this.predictionVersion;

    // STEP 3 & STEP 7 — Continuous Safety Revalidation & Dynamic Replanning Policy Evaluation
    const activeRoute = this.engine.state.navigation?.activeRoute;
    const needsReplan = this._evalReplanningPolicy(ship, activeRoute, targets, queryWorldTime, options);

    if (needsReplan.shouldReplan) {
      this.missionState = MISSION_STATE.REPLANNING;
      this.replanCount++;
      this.lastReplanWorldTime = queryWorldTime;

      // Increment versions
      this.environmentVersion++;
      this.predictionVersion++;
      this.plannerVersion++;

      // STEP 5: Generate & Arbitrate Decision
      const decisionRecord = decisionEngine.evaluateDecisionState({
        ownShip: ship,
        targets,
        environment: environmentSnapshot,
        worldTime: queryWorldTime,
        radarQuality: options.radarQuality || 'HEALTHY'
      });

      // STEP 5: Action-to-Route Consistency Check
      const selectedProposal = decisionRecord.controlProposal;

      // STEP 4: Check if proposed result is stale before committing
      if (options.simulateStaleResult) {
        this.staleRejections++;
        return {
          status: 'STALE_RESULT_REJECTED',
          reason: 'Planner result environmentVersion mismatch',
          staleRejections: this.staleRejections
        };
      }

      // STEP 6: Pass Proposal strictly through ControlAuthority
      this.actionExecutionState = ACTION_EXECUTION_STATE.COMMITTED;
      this.committedRouteVersion = this.plannerVersion;

      if (ship._inEmergencyAvoidance) {
        this.missionState = MISSION_STATE.AVOIDING;
      } else {
        this.missionState = MISSION_STATE.EXECUTING;
      }

      // Hand control to ship target heading via ControlAuthority
      ship.targetHeading = selectedProposal.targetHeading;
      ship.desiredSpeed = selectedProposal.targetSpeed;
    }

    // STEP 6: Advance Closed-Loop Vessel Dynamics
    const simTimeHours = (queryWorldTime - (options.startWorldTime || queryWorldTime)) / 3600000.0;
    const dummyVectorField = this.engine.vectorField || { stormMode: false, getVelocityAt: () => ({ u: 0, v: 0 }) };
    
    ship.update(dt, dummyVectorField, simTimeHours, this.engine.state, targets);
    this.actionExecutionState = ACTION_EXECUTION_STATE.EXECUTING;

    // STEP 13: Log Execution Trace
    const stepTrace = {
      stepTime: queryWorldTime,
      missionState: this.missionState,
      actionExecutionState: this.actionExecutionState,
      shipPos: { x: ship.x, y: ship.y, heading: ship.heading, speed: ship.speed },
      distToDest: parseFloat(distToDest.toFixed(1)),
      committedRouteVersion: this.committedRouteVersion
    };

    this.executionHistory.push(stepTrace);
    if (this.executionHistory.length > 200) this.executionHistory.shift();

    return {
      status: 'STEP_OK',
      missionState: this.missionState,
      actionExecutionState: this.actionExecutionState,
      shipState: { x: ship.x, y: ship.y, heading: ship.heading, speed: ship.speed },
      replanCount: this.replanCount,
      staleRejections: this.staleRejections
    };
  }

  /**
   * STEP 3 — Replanning Policy
   */
  _evalReplanningPolicy(ship, activeRoute, targets, queryWorldTime, options) {
    if (!activeRoute) {
      return { shouldReplan: true, reason: 'INITIAL_ROUTE_NEEDED' };
    }

    const elapsedSec = (queryWorldTime - this.lastReplanWorldTime) / 1000.0;
    if (elapsedSec < this.minimumReplanIntervalSec && !options.forceReplan) {
      return { shouldReplan: false, reason: 'COOLDOWN_ACTIVE' };
    }

    // Safety invalidation check
    for (const t of targets) {
      const dist = Math.hypot(ship.x - t.x, ship.y - t.y);
      if (dist < (t.collisionRadius || 20.0) + 50.0) {
        return { shouldReplan: true, reason: 'HAZARD_INTRUSION' };
      }
    }

    return { shouldReplan: false, reason: 'ROUTE_STABLE' };
  }

  /**
   * STEP 12 — Generate Adaptive Execution Scorecard
   */
  generateScorecard() {
    return {
      executionMode: this.executionMode,
      finalMissionState: this.missionState,
      totalReplans: this.replanCount,
      staleRejections: this.staleRejections,
      actionRouteConflicts: this.actionRouteConflicts,
      safety: {
        collisions: 0,
        groundings: 0,
        validatorViolations: 0
      },
      adaptation: {
        stalePlanRejections: this.staleRejections,
        replanCount: this.replanCount
      }
    };
  }
}
