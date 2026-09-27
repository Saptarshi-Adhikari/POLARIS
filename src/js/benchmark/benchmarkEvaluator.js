/**
 * POLARIS Nav-OS — Standardized Benchmark KPI Evaluator & Safety Gate Engine (Phase 1C)
 *
 * Computes empirical safety, route-quality, operational, computational, decision-quality,
 * and environmental KPIs. Evaluates explicit pass/fail safety gates.
 */

import { DEFAULT_SAFETY_GATES } from './benchmarkSchema.js';
import { wrappedDistanceCoords } from '../utils.js';

export class BenchmarkEvaluator {
  /**
   * Computes full quantitative KPI suite from recorded episode telemetry and scenario spec.
   */
  evaluateEpisode(episode, scenarioSpec = {}, safetyGateConfig = DEFAULT_SAFETY_GATES) {
    if (!episode) return null;

    const telemetry = episode.telemetry || [];
    const events = episode.events || [];
    const vessel = scenarioSpec.vessel || { draftM: 10.0, underKeelClearanceM: 3.0 };

    // 1. Safety Metrics
    let collisionCount = 0;
    let minClearance = Infinity;
    let minCpa = Infinity;
    let minTcpa = Infinity;
    let minUnderKeelClearance = Infinity;
    let groundingCount = 0;
    let emergencyInterventions = 0;

    for (const frame of telemetry) {
      if (frame.collisionDetected) collisionCount++;
      if (frame.minClearance !== undefined && frame.minClearance < minClearance) minClearance = frame.minClearance;
      if (frame.cpa !== undefined && frame.cpa < minCpa) minCpa = frame.cpa;
      if (frame.tcpa !== undefined && frame.tcpa > 0 && frame.tcpa < minTcpa) minTcpa = frame.tcpa;
      if (frame.depthM !== undefined) {
        const ukc = frame.depthM - vessel.draftM;
        if (ukc < minUnderKeelClearance) minUnderKeelClearance = ukc;
        if (ukc < vessel.underKeelClearanceM) groundingCount++;
      }
      if (frame.emergencyActive) emergencyInterventions++;
    }

    if (!isFinite(minClearance)) minClearance = null;
    if (!isFinite(minCpa)) minCpa = null;
    if (!isFinite(minTcpa)) minTcpa = null;
    if (!isFinite(minUnderKeelClearance)) minUnderKeelClearance = null;

    // 2. Route Quality Metrics
    let routeLength = 0;
    let totalHeadingChange = 0;
    let prevHeading = null;

    for (let i = 0; i < telemetry.length - 1; i++) {
      const p1 = telemetry[i];
      const p2 = telemetry[i + 1];
      routeLength += wrappedDistanceCoords(p1.x, p1.y, p2.x, p2.y);

      if (prevHeading !== null && p1.heading !== undefined) {
        const diff = Math.abs((p1.heading - prevHeading + 540) % 360 - 180);
        totalHeadingChange += diff;
      }
      prevHeading = p1.heading;
    }

    const start = scenarioSpec.mission?.start || (telemetry[0] ? { x: telemetry[0].x, y: telemetry[0].y } : { x: 0, y: 0 });
    const dest = scenarioSpec.mission?.destination || (telemetry[telemetry.length - 1] ? { x: telemetry[telemetry.length - 1].x, y: telemetry[telemetry.length - 1].y } : { x: 0, y: 0 });
    const directDistance = wrappedDistanceCoords(start.x, start.y, dest.x, dest.y);
    const routeEfficiency = directDistance > 0 ? parseFloat((directDistance / Math.max(1.0, routeLength)).toFixed(3)) : 1.0;
    const travelTimeSec = telemetry.length > 0 ? (telemetry[telemetry.length - 1].timestamp - telemetry[0].timestamp) / 1000.0 : 0.0;
    const finalPt = telemetry[telemetry.length - 1] || { x: start.x, y: start.y };
    const destinationError = wrappedDistanceCoords(finalPt.x, finalPt.y, dest.x, dest.y);

    // 3. Operational Metrics
    const speeds = telemetry.map(f => f.speed || 0.0);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0.0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0.0;
    const estimatedFuel = parseFloat((routeLength * 0.0015).toFixed(1));

    let replanCount = 0;
    let sideSwitches = 0;
    let lastSide = null;

    for (const ev of events) {
      if (ev.label === 'REPLAN' || ev.type === 'ROUTE_SELECTION') {
        replanCount++;
        if (ev.selectedSide && ev.selectedSide !== 'NONE') {
          if (lastSide && lastSide !== ev.selectedSide) sideSwitches++;
          lastSide = ev.selectedSide;
        }
      }
    }

    // 4. Computational Metrics
    const plannerLatencies = events.filter(e => e.calcTimeMs !== undefined).map(e => e.calcTimeMs);
    let p50Latency = null;
    let p95Latency = null;
    let p99Latency = null;

    if (plannerLatencies.length > 0) {
      plannerLatencies.sort((a, b) => a - b);
      p50Latency = plannerLatencies[Math.floor(plannerLatencies.length * 0.50)];
      p95Latency = plannerLatencies[Math.floor(plannerLatencies.length * 0.95)];
      p99Latency = plannerLatencies[Math.floor(plannerLatencies.length * 0.99)];
    }

    // 5. Decision Quality Metrics
    const explanationCount = events.filter(e => e.explanation !== undefined).length;

    // 6. Safety Gate Evaluation
    const destinationReached = episode.termination_reason === 'DESTINATION_REACHED' || destinationError <= 35.0;
    const hardSafetyPass = collisionCount === 0 && groundingCount === 0;
    const gatesPassed = hardSafetyPass && destinationReached && (p95Latency === null || p95Latency <= safetyGateConfig.maxPlannerLatencyP95Ms);

    return {
      episodeId: episode.episode_id,
      seed: episode.seed,
      scenarioId: episode.scenario_id,
      planner: episode.planner || 'CURRENT_FAST_FIRST_SAFE',
      terminationReason: episode.termination_reason,
      gatesPassed,
      safety: {
        collisionCount,
        collisionRate: collisionCount > 0 ? 1.0 : 0.0,
        minClearance,
        minCpa,
        minTcpa,
        groundingCount,
        minUnderKeelClearance,
        emergencyInterventions
      },
      routeQuality: {
        routeLength: parseFloat(routeLength.toFixed(1)),
        routeEfficiency,
        travelTimeSec: parseFloat(travelTimeSec.toFixed(1)),
        destinationError: parseFloat(destinationError.toFixed(1)),
        totalHeadingChangeDeg: parseFloat(totalHeadingChange.toFixed(1))
      },
      operational: {
        estimatedFuel,
        avgSpeed: parseFloat(avgSpeed.toFixed(1)),
        maxSpeed: parseFloat(maxSpeed.toFixed(1)),
        replanCount,
        sideSwitches,
        routeChurn: sideSwitches
      },
      computational: {
        plannerLatencyP50Ms: p50Latency,
        plannerLatencyP95Ms: p95Latency,
        plannerLatencyP99Ms: p99Latency
      },
      decisionQuality: {
        explanationCount,
        explanationCompletenessRatio: events.length > 0 ? parseFloat((explanationCount / events.length).toFixed(2)) : 1.0
      },
      maneuvering: {
        maxHeadingRate: parseFloat((telemetry.reduce((m, f) => Math.max(m, Math.abs(f.headingRate || f.angularVelocity || 0)), 0)).toFixed(2)),
        avgHeadingRate: parseFloat((telemetry.length > 0 ? telemetry.reduce((sum, f) => sum + Math.abs(f.headingRate || f.angularVelocity || 0), 0) / telemetry.length : 0).toFixed(2)),
        maxRudderAngle: parseFloat((telemetry.reduce((m, f) => Math.max(m, Math.abs(f.rudder || 0)), 0)).toFixed(1)),
        maxRudderRate: parseFloat((telemetry.reduce((m, f) => Math.max(m, Math.abs(f.rudderRate || 0)), 0)).toFixed(2)),
        maxAccel: parseFloat((telemetry.reduce((m, f) => Math.max(m, Math.max(0, f.ax || 0)), 0)).toFixed(2)),
        maxDecel: parseFloat((telemetry.reduce((m, f) => Math.max(m, Math.max(0, -(f.ax || 0))), 0)).toFixed(2)),
        infeasibleRouteCount: events.filter(e => e.maneuverabilityRejected || e.infeasible).length,
        maneuverViolations: events.filter(e => e.maneuverViolation).length
      }
    };
  }
}

export const benchmarkEvaluator = new BenchmarkEvaluator();
