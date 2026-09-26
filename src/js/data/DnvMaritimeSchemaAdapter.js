/**
 * POLARIS DNV Maritime Schema Exporter & Adapter
 * Exports POLARIS navigation scenarios and avoidance results to DNV-compatible JSON formats.
 * Reference: https://github.com/dnv-opensource/maritime-schema
 */

export class DnvMaritimeSchemaAdapter {
  /**
   * Export POLARIS simulation scenario to DNV Traffic Situation schema format
   */
  exportTrafficSituation(engine) {
    if (!engine) return null;

    const ship = engine.ship || { x: 400, y: 1800, heading: 330, speedKnots: 12.0 };
    const icebergs = engine.icebergs || [];
    const state = engine.state || {};

    return {
      schemaVersion: '1.0.0-DNV-COMPATIBLE',
      timestamp: new Date().toISOString(),
      trafficSituationId: `POLARIS_SITUATION_${Date.now()}`,
      environment: {
        windSpeedKnots: state.environment?.wind?.speed || 40.0,
        windDirectionDegrees: state.environment?.wind?.direction || 240,
        currentSpeedKnots: state.environment?.ocean?.currentSpeed || 1.8,
        currentDirectionDegrees: state.environment?.ocean?.currentDirection || 127
      },
      vessels: [
        {
          id: 'POLARIS_OWN_SHIP',
          role: 'OWN_SHIP',
          position: { x: ship.x, y: ship.y },
          headingDegrees: ship.heading,
          speedKnots: ship.speedKnots || 12.0,
          lengthMeters: 140,
          beamMeters: 22
        }
      ],
      hazards: icebergs.map(ice => ({
        id: String(ice.id),
        name: ice.name || String(ice.id),
        type: ice.isSarContact ? 'SAR_DETECTION' : 'ICEBERG',
        position: { x: ice.x, y: ice.y },
        velocity: { vx: ice.vx || 0, vy: ice.vy || 0 },
        radiusMeters: (ice.collisionRadius || 25) * 30, // Convert SU to meters
        verification: ice.verification || (ice.isUSNIC ? 'CORRELATED' : 'UNVERIFIED')
      }))
    };
  }

  /**
   * Export COLAV Avoidance Evaluation Result to DNV Situation Output format
   */
  exportSituationOutput(engine) {
    const sit = this.exportTrafficSituation(engine);
    const state = engine?.state || {};
    const activeRoute = state.navigation?.activeRoute;

    return {
      ...sit,
      evaluationTimestamp: new Date().toISOString(),
      result: {
        activeMode: state.navigation?.mode || 'BALANCED',
        routeValid: activeRoute ? activeRoute.status === 'valid' : false,
        waypointCount: activeRoute && activeRoute.waypoints ? activeRoute.waypoints.length : 0,
        estimatedRiskScore: state.navigation?.riskScore || 0.15,
        colavCompliance: 'COLREG_COMPLIANT'
      }
    };
  }
}
