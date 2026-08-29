export class MetricsRegistry {
  constructor(engine) {
    this.engine = engine;
  }

  getMetric(key) {
    const state = this.engine.state;
    const ship = this.engine.ship;
    const ri = this.engine.riskIntelligenceEngine;
    const cie = this.engine.confidenceIntelligenceEngine;
    const aiNav = this.engine.aiNavigator;
    const mp = this.engine.missionPlan;

    const simTime = state ? state.simulation.simTimeHours : 0;
    const getConfidence = () => cie ? cie.decisionConfidence / 100 : 0.85;

    switch (key) {
      case 'risk':
        const rVal = ri && ri.routeExposure ? Math.round(ri.routeExposure.maxRisk * 100) : 15;
        return {
          value: rVal,
          unit: '%',
          source: 'RiskIntelligenceEngine',
          formula: 'max(icebergRisk, seaIceRisk)',
          timestamp: simTime,
          confidence: getConfidence()
        };

      case 'confidence':
        const cVal = cie ? cie.decisionConfidence : 85;
        return {
          value: cVal,
          unit: '%',
          source: 'ConfidenceIntelligenceEngine',
          formula: 'weighted_average(iceberg, sea_ice, validation, safety, environment, controller)',
          timestamp: simTime,
          confidence: 1.0
        };

      case 'eta':
        const eVal = aiNav && aiNav.route ? aiNav.route.eta : 12.4;
        return {
          value: Number(eVal.toFixed(1)),
          unit: 'h',
          source: 'AINavigator',
          formula: 'sum(segmentDistance / estimatedSegmentSpeed)',
          timestamp: simTime,
          confidence: getConfidence()
        };

      case 'fuel':
        const fVal = aiNav && aiNav.route ? aiNav.route.fuelUsed : 45.0;
        return {
          value: Math.round(fVal),
          unit: '%',
          source: 'AINavigator',
          formula: 'sum(segmentHours * consumptionRate * windGustFactor)',
          timestamp: simTime,
          confidence: getConfidence()
        };

      case 'seaIce':
        const ice = state ? state.environment.seaIce.averageConcentration : 0.2;
        return {
          value: Math.round(ice * 100),
          unit: '%',
          source: 'AntarcticDataManager',
          formula: 'observedSeaIceGridMatrixLookup',
          timestamp: simTime,
          confidence: 1.0
        };

      case 'resistance':
        const res = state && state.vessel.environmentalResistance ? state.vessel.environmentalResistance : 1.2;
        return {
          value: Number(res.toFixed(1)),
          unit: 'kN',
          source: 'ShipPhysicsModel',
          formula: 'dragForce + currentsLateralForce + seaIceFriction',
          timestamp: simTime,
          confidence: getConfidence()
        };

      case 'xte':
        const xte = state && state.vessel.crossTrackError ? state.vessel.crossTrackError : 0.0;
        return {
          value: Number(xte.toFixed(1)),
          unit: 'SU',
          source: 'AutopilotController',
          formula: 'perpendicularDistanceToActiveRouteSegment',
          timestamp: simTime,
          confidence: 1.0
        };

      case 'drift':
        const drift = state && state.vessel.driftCorrection ? state.vessel.driftCorrection : 0.0;
        return {
          value: Number(drift.toFixed(1)),
          unit: 'deg',
          source: 'AutopilotController',
          formula: 'arctan(lateralCurrentVelocity / forwardThrustVelocity)',
          timestamp: simTime,
          confidence: 0.90
        };

      case 'crab':
        const crab = state && state.vessel.crabAngle ? state.vessel.crabAngle : 0.0;
        return {
          value: Number(crab.toFixed(0)),
          unit: 'deg',
          source: 'ShipPhysicsModel',
          formula: 'headingAngle - velocityVectorAngle',
          timestamp: simTime,
          confidence: 0.95
        };

      case 'safety':
        const safety = ri && ri.routeExposure ? (1.0 - ri.routeExposure.averageRisk) * 100 : 80;
        return {
          value: Math.round(safety),
          unit: '%',
          source: 'RiskIntelligenceEngine',
          formula: '1.0 - mean(routeRiskCoordinates)',
          timestamp: simTime,
          confidence: getConfidence()
        };

      case 'horizon':
        return {
          value: 24,
          unit: 'h',
          source: 'IcebergPredictor',
          formula: 'maxForecastPredictionSteps',
          timestamp: simTime,
          confidence: 1.0
        };

      case 'validationError':
        const err = this.engine.validationEngine ? this.engine.validationEngine.averageError : 14.2;
        return {
          value: Number(err.toFixed(1)),
          unit: 'SU',
          source: 'ValidationEngine',
          formula: 'mean(predictedCoordinates - observedActualCoordinates)',
          timestamp: simTime,
          confidence: 1.0
        };

      case 'routeScore':
        const score = aiNav && aiNav.route ? (100 - (aiNav.route.overallCost || 20)) : 80;
        return {
          value: Math.round(score),
          unit: 'pts',
          source: 'AINavigator',
          formula: '100 - (distanceCost + riskCost + currentResistanceCost)',
          timestamp: simTime,
          confidence: getConfidence()
        };

      default:
        return {
          value: 'N/A',
          unit: '',
          source: 'SystemRegistry',
          formula: 'N/A - INSUFFICIENT DATA',
          timestamp: simTime,
          confidence: 0.0
        };
    }
  }

  getTooltip(key) {
    const m = this.getMetric(key);
    return `SOURCE: ${m.source}\nFORMULA: ${m.formula}\nLAST UPDATED: t+${m.timestamp.toFixed(1)}h`;
  }
}
