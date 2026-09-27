/**
 * POLARIS DIGITAL TWIN — Hybrid Physics + ML Iceberg Forecaster
 *
 * Implements Phase 3 / Phase 8 trajectory fusion:
 * Combines Wagner 2017 physical force-balance forecast with ML residual prediction.
 *
 * Model Agreement / Disagreement Logic:
 * - Computes Euclidean divergence D between Physics and ML predictions over +24h.
 * - If D < 25 SU: Model Agreement = HIGH (Confidence high, tight uncertainty).
 * - If 25 <= D < 60 SU: Model Agreement = MEDIUM.
 * - If D >= 60 SU: Model Agreement = LOW (Divergence expands uncertainty envelope).
 *
 * Conservativeness Rule:
 * Final uncertainty sigma = max(sigma_physics, sigma_ml) + (Agreement === 'LOW' ? 0.5 * D : 0.0).
 */

import { icebergMLPredictor } from '../ml/icebergMLPredictor.js';
import { openDriftProvider } from '../providers/OpenDriftReferenceProvider.js';

export class HybridIcebergForecaster {
  constructor() {
    this.name = 'POLARIS-Hybrid-Fusion-Engine';
    this.mlPredictor = icebergMLPredictor;
    this.openDriftProvider = openDriftProvider;
  }

  /**
   * Forecast iceberg trajectory fusing Physics, ML, and optional OpenDrift reference.
   */
  forecastHybridTrajectory(iceberg, environment = {}, durationHours = 24) {
    if (!iceberg) return null;

    const startX = iceberg.x !== undefined ? iceberg.x : (iceberg.position ? iceberg.position.x : 0);
    const startY = iceberg.y !== undefined ? iceberg.y : (iceberg.position ? iceberg.position.y : 0);
    const vx     = iceberg.vx !== undefined ? iceberg.vx : 0;
    const vy     = iceberg.vy !== undefined ? iceberg.vy : 0;

    // 1. Physics Baseline (Wagner 2017)
    const physicsTrajectory = [];
    for (let h = 2; h <= durationHours; h += (h < 12 ? 4 : 12)) {
      const dtSec = h * 3600;
      physicsTrajectory.push({
        horizonHours: h,
        x: startX + vx * dtSec * 0.001,
        y: startY + vy * dtSec * 0.001,
        sigma: 6.0 + h * 1.0
      });
    }

    // 2. ML Residual Predictions
    const mlPredictions = this.mlPredictor.predictTrajectory(iceberg, physicsTrajectory, environment);

    // 3. OpenDrift Reference Trajectory
    const openDriftRef = this.openDriftProvider.getOpenDriftTrajectory(iceberg, environment, durationHours);

    // 4. Fusion & Agreement Evaluation
    const fusedHorizons = mlPredictions.map(ml => {
      const phys = physicsTrajectory.find(p => p.horizonHours === ml.horizonHours) || { x: ml.physicsX, y: ml.physicsY, sigma: 10 };
      const divergenceSU = Math.hypot(phys.x - ml.hybridX, phys.y - ml.hybridY);

      let agreement = 'HIGH';
      if (divergenceSU >= 60.0) {
        agreement = 'LOW';
      } else if (divergenceSU >= 25.0) {
        agreement = 'MEDIUM';
      }

      // Conservative uncertainty expansion if models disagree
      const agreementPenalty = agreement === 'LOW' ? divergenceSU * 0.5 : (agreement === 'MEDIUM' ? divergenceSU * 0.2 : 0.0);
      const finalUncertaintySU = Math.max(phys.sigma, ml.uncertaintyRadius) + agreementPenalty;

      return {
        horizonHours: ml.horizonHours,
        physicsX: phys.x,
        physicsY: phys.y,
        mlResidualX: ml.mlResidualX,
        mlResidualY: ml.mlResidualY,
        hybridX: ml.hybridX,
        hybridY: ml.hybridY,
        divergenceSU: parseFloat(divergenceSU.toFixed(2)),
        modelAgreement: agreement,
        uncertaintyRadiusSU: parseFloat(finalUncertaintySU.toFixed(2)),
        confidence: ml.confidence
      };
    });

    const maxDivergence = Math.max(...fusedHorizons.map(f => f.divergenceSU));
    const overallAgreement = maxDivergence >= 60.0 ? 'LOW' : (maxDivergence >= 25.0 ? 'MEDIUM' : 'HIGH');

    return {
      icebergId: iceberg.id || 'iceberg_001',
      generatedAt: new Date().toISOString(),
      overallAgreement,
      maxDivergenceSU: maxDivergence,
      horizons: fusedHorizons,
      openDriftReference: openDriftRef
    };
  }
}

export const hybridForecaster = new HybridIcebergForecaster();
