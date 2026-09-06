/**
 * POLARIS Nav-OS — Deterministic Autonomous Episode Runner (Phase 6)
 *
 * Executes autonomous navigation episodes end-to-end, enforces complete clean
 * simulation resets, records 10 Hz telemetry and discrete events, detects
 * collisions/destination arrival, labels pre-collision training windows,
 * and exports dataset v2 JSONL files.
 */

import { SimulationEngine } from '../main.js';
import { Ship } from '../simulation/ship.js';
import { ScenarioGenerator } from '../debug/navTestScenarios.js';
import { SeededRandom } from '../utils/seededRandom.js';
import { TerminationReason, EventLabel, SCHEMA_VERSION } from './datasetSchema.js';

export class EpisodeRunner {
  constructor(options = {}) {
    this.scenarioGenerator = new ScenarioGenerator();
    this.baseDir = options.baseDir || 'datasets/v2';
  }

  /**
   * Resets all simulation and AI navigator state to initial canonical state.
   */
  resetState(engine, scenario, seed, options = {}) {
    if (!engine) return;

    const start = scenario.start;
    const dest = scenario.destination;

    // 1. Reset Ship Physics
    if (!engine.ship) {
      engine.ship = new Ship({ x: start.x, y: start.y, heading: start.heading });
    }
    const ship = engine.ship;
    ship.x = start.x;
    ship.y = start.y;
    ship.lastValidX = start.x;
    ship.lastValidY = start.y;
    ship.heading = start.heading !== undefined ? start.heading : 330;
    ship.vx = 0;
    ship.vy = 0;
    ship.angularVelocity = 0;
    ship.speed = 12.0;
    ship.rudder = 0;
    ship.throttle = 65;
    ship.desiredThrottle = 65;
    ship.fuel = 100.0;
    ship.stuckCounter = 0;
    ship.autopilotStatus = 'IDLE';
    ship.crossTrackError = 0;
    ship.lastCollisionEvent = { collisionDetected: false };
    ship._inEmergencyAvoidance = false;
    ship.emergencyTargetHeading = null;

    // 2. Reset Simulation Navigation State
    if (!engine.state) engine.state = {};
    engine.state.navigation = {
      startPoint: { x: start.x, y: start.y },
      destinationPoint: { x: dest.x, y: dest.y },
      activeRoute: null,
      routeCalculated: false,
      routeInvalid: false
    };

    if (!engine.state.simulation) engine.state.simulation = {};
    engine.state.simulation.simTimeHours = 0;

    // 3. Reset AI Navigator
    const nav = engine.aiNavigator;
    if (nav) {
      nav.routeCommitmentUntilSimTimeHours = 0;
      nav.lastReplanReason = null;
      nav.replanReason = null;
      nav.replanEventTrace = [];
      nav.plannerLogs = [];
      nav.plannerCalls = 0;
      nav.plannerCallCount = 0;
      nav.routeGenerationAttempts = 0;
      nav.routeAdoptions = 0;
      nav.routeVersion = 0;
      nav.routeRejections = 0;
      nav.routeInvalidations = 0;
      nav.emergencyEntries = 0;
      nav.emergencyExits = 0;
      nav.temporalRiskEntries = 0;
      nav.temporalRiskExits = 0;
      nav.optimalRoute = [];
      nav.lastValidRoute = [];
      if (nav.uniqueHazards) nav.uniqueHazards.clear();
      if (nav.uniqueReplanEvents) nav.uniqueReplanEvents.clear();
      if (nav.latchedHazards) nav.latchedHazards.clear();
      nav.temporalRiskState = 'CLEAR';
      nav.currentHazardId = null;
      nav.activeRouteId = null;
    }

    // 4. Reset Icebergs Population & Environment
    engine.icebergs = scenario.icebergs || [];
    if (options.vectorField) {
      engine.vectorField = options.vectorField;
    }
  }

  /**
   * Executes a single episode deterministically.
   */
  runEpisode(seed = 12345, scenarioClass = 'CLASS_B_STATIC_OBSTACLE', options = {}) {
    const maxSteps = options.maxSteps || 3000;
    const dt = options.dt || 0.1; // 0.1s sim time step
    const destTolerance = options.destTolerance || 50.0;

    // Initialize engine & scenario
    const engine = new SimulationEngine();
    const scenario = options.customScenario || this.scenarioGenerator.generateScenario(seed, scenarioClass, options);

    if (options.vectorField) {
      engine.vectorField = options.vectorField;
    }

    // Reset all state to canonical initial values
    this.resetState(engine, scenario, seed);

    // Perform initial route calculation
    engine.calculateRoute();

    const episodeId = `ep_${seed}_${Date.now()}`;
    const telemetry = [];
    const events = [];
    const collisionEvents = [];
    const nearMissEvents = [];
    let terminationReason = null;
    let eventLabel = EventLabel.SUCCESS;
    let minPhysicalClearance = Infinity;

    const shipRadius = engine.ship.collisionRadius || 15;

    // Track pre-collision window and events
    let prevInEmergency = false;
    let prevRouteId = engine.state.navigation.activeRoute?.id || null;

    for (let step = 0; step < maxSteps; step++) {
      const currentSimHours = (step * dt) / 3600;
      engine.state.simulation.simTimeHours = currentSimHours;

      // Update icebergs
      for (const ice of engine.icebergs) {
        if (typeof ice.update === 'function') {
          ice.update(dt, engine.vectorField, currentSimHours, engine.state);
        }
      }

      // Evaluate AI Navigator
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, currentSimHours, engine.state);

      // Update Ship Dynamics
      engine.ship.update(dt, engine.vectorField, currentSimHours, engine.state, engine.icebergs);

      // Inspect Nearest Iceberg Geometry
      let nearestIce = null;
      let minDist = Infinity;
      let minPhysClearanceStep = Infinity;

      for (const ice of engine.icebergs) {
        const iceRadius = ice.collisionRadius || ice.radius || 20;
        const centerDist = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y);
        const physClearance = centerDist - shipRadius - iceRadius;
        const safetyMargin = physClearance - 15;

        if (physClearance < minPhysClearanceStep) {
          minPhysClearanceStep = physClearance;
          nearestIce = {
            id: ice.id,
            x: ice.x,
            y: ice.y,
            vx: ice.vx || 0,
            vy: ice.vy || 0,
            center_distance: parseFloat(centerDist.toFixed(2)),
            physical_clearance: parseFloat(physClearance.toFixed(2)),
            safety_margin: parseFloat(safetyMargin.toFixed(2)),
            collision_risk: physClearance < 15
          };
        }
      }

      if (minPhysClearanceStep < minPhysicalClearance) {
        minPhysicalClearance = minPhysClearanceStep;
      }

      // 10 Hz Telemetry Sample Record
      const sample = {
        simulation_time: parseFloat((step * dt).toFixed(2)),
        sim_time_hours: currentSimHours,
        ship: {
          x: parseFloat(engine.ship.x.toFixed(2)),
          y: parseFloat(engine.ship.y.toFixed(2)),
          heading: parseFloat(engine.ship.heading.toFixed(2)),
          speed: parseFloat(engine.ship.speed.toFixed(2)),
          surge_velocity: parseFloat((engine.ship.vx || 0).toFixed(2)),
          sway_velocity: parseFloat((engine.ship.vy || 0).toFixed(2)),
          angular_velocity: parseFloat((engine.ship.angularVelocity || 0).toFixed(4)),
          rudder: parseFloat(engine.ship.rudder.toFixed(2)),
          throttle: parseFloat(engine.ship.throttle.toFixed(2))
        },
        navigation: {
          active_route_id: engine.state.navigation.activeRoute?.id || null,
          waypoint_index: engine.ship.currentWaypointIndex || 0,
          desired_heading: parseFloat((engine.ship.desiredHeading || 0).toFixed(2)),
          XTE: parseFloat((engine.ship.crossTrackError || 0).toFixed(2)),
          planner_called: engine.aiNavigator.plannerCalls || 0,
          route_version: engine.aiNavigator.routeVersion || 1,
          emergency_state: !!engine.ship._inEmergencyAvoidance
        },
        environment: {
          current_x: engine.vectorField?.getVelocityAt ? engine.vectorField.getVelocityAt(engine.ship.x, engine.ship.y).u : 0,
          current_y: engine.vectorField?.getVelocityAt ? engine.vectorField.getVelocityAt(engine.ship.x, engine.ship.y).v : 0,
          wind_x: 0,
          wind_y: 0
        },
        nearest_iceberg: nearestIce,
        events: {
          collision: false,
          emergency_entry: false,
          emergency_exit: false,
          route_change: false
        }
      };

      // Discrete Event Monitoring
      if (engine.ship._inEmergencyAvoidance && !prevInEmergency) {
        sample.events.emergency_entry = true;
        events.push({ step, sim_time: step * dt, type: 'EMERGENCY_ENTRY' });
      } else if (!engine.ship._inEmergencyAvoidance && prevInEmergency) {
        sample.events.emergency_exit = true;
        events.push({ step, sim_time: step * dt, type: 'EMERGENCY_EXIT' });
      }
      prevInEmergency = !!engine.ship._inEmergencyAvoidance;

      const currentRouteId = engine.state.navigation.activeRoute?.id;
      if (currentRouteId && currentRouteId !== prevRouteId) {
        sample.events.route_change = true;
        events.push({ step, sim_time: step * dt, type: 'ROUTE_CHANGE', route_id: currentRouteId });
        prevRouteId = currentRouteId;
      }

      // Check Near Miss (physical clearance < 30 SU but > 0)
      if (nearestIce && nearestIce.physical_clearance < 30 && nearestIce.physical_clearance > 0) {
        if (eventLabel !== EventLabel.COLLISION) {
          eventLabel = EventLabel.NEAR_MISS;
        }
        if (!nearMissEvents.some(e => e.iceberg_id === nearestIce.id && Math.abs(e.sim_time - step * dt) < 2.0)) {
          nearMissEvents.push({
            sim_time: parseFloat((step * dt).toFixed(2)),
            iceberg_id: nearestIce.id,
            physical_clearance: nearestIce.physical_clearance
          });
        }
      }

      // Check Terminal Collision (COLLISION status is triggered at safety-envelope violation, center distance <= hardR, not at literal hull contact)
      const isCollision = engine.ship.lastCollisionEvent?.collisionDetected || minPhysClearanceStep <= 0;
      if (isCollision) {
        sample.events.collision = true;
        terminationReason = TerminationReason.COLLISION;
        eventLabel = EventLabel.COLLISION;

        const colEvt = {
          sim_time: parseFloat((step * dt).toFixed(2)),
          ship_position: { x: engine.ship.x, y: engine.ship.y },
          iceberg_id: engine.ship.lastCollisionEvent?.icebergId || nearestIce?.id || 'unknown',
          physical_clearance: minPhysClearanceStep
        };
        collisionEvents.push(colEvt);
        events.push({ step, sim_time: step * dt, type: 'COLLISION', ...colEvt });

        sample.terminal_sample = true;
        telemetry.push(sample);
        break;
      }

      // Check Destination Reached
      const distToDest = Math.hypot(engine.ship.x - scenario.destination.x, engine.ship.y - scenario.destination.y);
      const shipSpeed = Math.hypot(engine.ship.vx || 0, engine.ship.vy || 0);
      const isArrived = (distToDest <= 35.0 && shipSpeed <= 3.5) || distToDest <= 15.0 || engine.ship.autopilotStatus === 'DESTINATION_REACHED' || engine.ship.autopilotStatus === 'ARRIVED';
      if (isArrived) {
        terminationReason = TerminationReason.DESTINATION_REACHED;
        if (eventLabel !== EventLabel.COLLISION && eventLabel !== EventLabel.NEAR_MISS) {
          eventLabel = EventLabel.SUCCESS;
        }
        events.push({ step, sim_time: step * dt, type: 'DESTINATION_REACHED', distToDest });

        sample.terminal_sample = true;
        telemetry.push(sample);
        break;
      }

      telemetry.push(sample);
    }

    // Default to TIMEOUT if loop completed without terminal condition
    if (!terminationReason) {
      terminationReason = TerminationReason.TIMEOUT;
      if (telemetry.length > 0) {
        telemetry[telemetry.length - 1].terminal_sample = true;
      }
    }

    // Extract Pre-Collision Training Window (final 30 seconds before collision if COLLISION)
    let preCollisionWindow = [];
    if (terminationReason === TerminationReason.COLLISION) {
      const windowSamplesCount = Math.min(300, telemetry.length); // 30s @ 10 Hz
      preCollisionWindow = telemetry.slice(telemetry.length - windowSamplesCount).map((s, idx, arr) => {
        const offsetSec = (idx - (arr.length - 1)) * dt;
        return {
          t_offset_seconds: parseFloat(offsetSec.toFixed(1)),
          sim_time: s.simulation_time,
          ship_position: s.ship,
          nearest_iceberg: s.nearest_iceberg
        };
      });
    }

    const durationSeconds = telemetry.length * dt;
    const durationHours = durationSeconds / 3600;

    const nav = engine.aiNavigator;

    return {
      schema_version: SCHEMA_VERSION,
      episode_id: episodeId,
      seed,
      scenario_class: scenarioClass,
      event_label: eventLabel,
      started_at: new Date().toISOString(),
      simulation_duration_hours: parseFloat(durationHours.toFixed(4)),
      simulation_duration_seconds: parseFloat(durationSeconds.toFixed(2)),
      start_state: {
        x: scenario.start.x,
        y: scenario.start.y,
        heading: scenario.start.heading,
        speed: 12.0
      },
      destination: {
        x: scenario.destination.x,
        y: scenario.destination.y,
        tolerance: destTolerance
      },
      environment_config: {
        current_x: engine.vectorField?.getVelocityAt ? engine.vectorField.getVelocityAt(scenario.start.x, scenario.start.y).u : 0,
        current_y: engine.vectorField?.getVelocityAt ? engine.vectorField.getVelocityAt(scenario.start.x, scenario.start.y).v : 0,
        wind_x: 0,
        wind_y: 0
      },
      ship_config: {
        collisionRadius: shipRadius,
        maxSpeed: 20.0
      },
      iceberg_config: {
        count: scenario.icebergs.length
      },
      termination_reason: terminationReason,
      metrics: {
        plannerCalls: nav.plannerCalls || 0,
        routeChanges: nav.routeVersion || 1,
        minPhysicalClearance: parseFloat(minPhysicalClearance.toFixed(2)),
        destinationReached: terminationReason === TerminationReason.DESTINATION_REACHED,
        collision: terminationReason === TerminationReason.COLLISION
      },
      collision_events: collisionEvents,
      near_miss_events: nearMissEvents,
      events,
      pre_collision_window: preCollisionWindow,
      telemetry
    };
  }
}
