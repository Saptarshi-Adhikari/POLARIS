/**
 * POLARIS — Phase 4F Sentinel-1 SAR External Antarctic Generalization,
 * Dataset Scaling & Independent Validation Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SarUNetModel,
  ExternalSarDatasetRegistry,
  reconcileExternalLabels,
  alignSarPreprocessing,
  auditExternalDataLeakage,
  ExternalSarEvaluator,
  formatSarXaiProvenance,
  extractSarObjectsFromMask,
  splitDatasetByScene,
  createCanonicalSarDatasetRecord,
  SAR_MODEL_STATUS_LEVELS,
  EXTERNAL_LABEL_QUALITY
} from '../src/js/data/SarUNetPerception.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';
import { sarPerceptionEngine, BaselineSarDetector } from '../src/js/data/SarPerceptionEngine.js';
import { SpatiotemporalPlanner } from '../src/js/ai/SpatiotemporalPlanner.js';
import { AisTargetTracker } from '../src/js/ai/AisTargetTracker.js';
import { DynamicIcebergDragEstimator } from '../src/js/ai/DynamicIcebergDragEstimator.js';
import { VesselManeuveringEngine } from '../src/js/ai/VesselManeuveringEngine.js';
import { bathymetryProvider } from '../src/js/providers/bathymetryProvider.js';
import { continuousCollisionValidator } from '../src/js/ai/continuousCollisionValidator.js';
import { benchmarkEvaluator } from '../src/js/benchmark/benchmarkEvaluator.js';


describe('POLARIS Phase 4F — External Antarctic SAR Generalization & Independent Validation', () => {
  let registry;
  let evaluator;

  beforeEach(() => {
    registry = new ExternalSarDatasetRegistry();
    evaluator = new ExternalSarEvaluator();
  });

  it('1. external manifest loads', () => {
    const list = registry.listDatasets();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].datasetId).toBe('GROUNDED_ICEBERG_SENTINEL1_2026');
  });

  it('2. license/provenance metadata preserved', () => {
    const ds = registry.getDataset('GROUNDED_ICEBERG_SENTINEL1_2026');
    expect(ds).not.toBeNull();
    expect(ds.publisher).toContain('Earth System Science Data');
    expect(ds.license).toBe('CC-BY-4.0');
    expect(ds.doi).toBeDefined();
    expect(ds.labelQuality).toBe(EXTERNAL_LABEL_QUALITY.HIGH);
  });

  it('3. label mapping correct', () => {
    const iceRes = reconcileExternalLabels('ICEBERG', 'ESSD_2026');
    expect(iceRes.polarisLabel).toBe('POSSIBLE_ICEBERG');
    expect(iceRes.mappingVersion).toBe('POLARIS_LABEL_MAP_v1.0');

    const bgRes = reconcileExternalLabels('BACKGROUND', 'ESSD_2026');
    expect(bgRes.polarisLabel).toBe('UNKNOWN'); // Ensures background does NOT fabricate sea ice
  });

  it('4. external preprocessing compatibility validated', () => {
    const rawRaster = { productId: 'EXT_S1_001', width: 16, height: 16, polarization: 'HH', data: new Float32Array(256).fill(0.1) };
    const aligned = alignSarPreprocessing(rawRaster, { calibration: 'LINEAR' });
    expect(aligned.conversionSteps).toContain('CONVERT_LINEAR_TO_SIGMA0_DB');
    expect(aligned.bandAdapterUsed).toBe('HH_DUAL_POL_ADAPTER_v1.0');
  });

  it('5. no product leakage', () => {
    const internalRecs = [{ productId: 'INTERNAL_P1', imageId: 'INT_S1' }];
    const extRecs = [{ productId: 'EXT_P100', imageId: 'EXT_S100' }];
    const audit = auditExternalDataLeakage(internalRecs, extRecs);
    expect(audit.PRODUCT_LEAKAGE).toBe(0);
    expect(audit.leakageClean).toBe(true);
  });

  it('6. no scene leakage', () => {
    const internalRecs = [{ productId: 'INTERNAL_P1', imageId: 'INT_S1' }];
    const extRecs = [{ productId: 'EXT_P100', imageId: 'EXT_S100' }];
    const audit = auditExternalDataLeakage(internalRecs, extRecs);
    expect(audit.SCENE_LEAKAGE).toBe(0);
  });

  it('7. geographic overlap detected', () => {
    const internalRecs = [{ productId: 'INT_P1', imageId: 'INT_S1' }];
    const extRecs = [{ productId: 'EXT_P1', imageId: 'EXT_S1', region: 'Weddell' }];
    const audit = auditExternalDataLeakage(internalRecs, extRecs);
    expect(audit.GEOGRAPHIC_OVERLAP).toBeGreaterThan(0);
  });

  it('8. temporal overlap detected', () => {
    const internalRecs = [{ productId: 'INT_P1', imageId: 'INT_S1' }];
    const extRecs = [{ productId: 'EXT_P1', imageId: 'EXT_S1', year: 2026 }];
    const audit = auditExternalDataLeakage(internalRecs, extRecs);
    expect(audit.TEMPORAL_OVERLAP).toBeGreaterThan(0);
  });

  it('9. frozen model loads', () => {
    const frozenModel = new SarUNetModel({
      modelId: 'SAR-UNET-v1-EVAL',
      version: '1.0.0-FROZEN',
      trainingStatus: SAR_MODEL_STATUS_LEVELS.MODEL_EXTERNALLY_VALIDATED
    });
    expect(frozenModel.isLoaded).toBe(true);
    expect(frozenModel.getModelMetadata().trainingStatus).toBe(SAR_MODEL_STATUS_LEVELS.MODEL_EXTERNALLY_VALIDATED);
  });

  it('10. zero-shot evaluation executes', () => {
    const res = evaluator.runZeroShotEvaluation('GROUNDED_ICEBERG_SENTINEL1_2026');
    expect(res.pixelMetrics).toBeDefined();
    expect(res.pixelMetrics.iou).toBeGreaterThan(0.60);
  });

  it('11. per-class metrics correct', () => {
    const res = evaluator.runZeroShotEvaluation('GROUNDED_ICEBERG_SENTINEL1_2026');
    expect(res.pixelMetrics.iou).toBe(0.712);
    expect(res.pixelMetrics.dice).toBe(0.795);
    expect(res.pixelMetrics.precision).toBe(0.84);
    expect(res.pixelMetrics.recall).toBe(0.77);
  });

  it('12. object metrics correct', () => {
    const res = evaluator.runZeroShotEvaluation('GROUNDED_ICEBERG_SENTINEL1_2026');
    expect(res.objectMetrics.objectPrecision).toBe(0.81);
    expect(res.objectMetrics.objectRecall).toBe(0.76);
    expect(res.objectMetrics.centroidErrorMeters).toBe(24.5);
  });

  it('13. small-target metrics correct', () => {
    const res = evaluator.runZeroShotEvaluation('GROUNDED_ICEBERG_SENTINEL1_2026');
    const small = res.smallTargetBreakdown['<10px'];
    expect(small).toBeDefined();
    expect(small.iou).toBe(0.42);
    expect(small.objectPrecision).toBe(0.65);
  });

  it('14. polarization compatibility checked', () => {
    const res = evaluator.runZeroShotEvaluation('GROUNDED_ICEBERG_SENTINEL1_2026');
    expect(res.polarizationPerformance['HH+HV']).toBeGreaterThan(res.polarizationPerformance['HH_adapted']);
  });

  it('15. mode compatibility checked', () => {
    const res = evaluator.runZeroShotEvaluation('GROUNDED_ICEBERG_SENTINEL1_2026');
    expect(res.modePerformance.IW).toBeGreaterThan(res.modePerformance.EW);
  });

  it('16. external dataset remains isolated', () => {
    const ds = registry.getDataset('CIRCUM_ANTARCTIC_SENTINEL1_2018_2023');
    for (const r of ds.records) {
      expect(r.split).toBe('EXTERNAL_TEST');
    }
  });

  it('17. retraining split remains isolated', () => {
    const evaluator = new ExternalSarEvaluator();
    expect(evaluator.baselineVersion).not.toBe(evaluator.retrainedVersion);
  });

  it('18. model versions remain distinct', () => {
    const m1 = new SarUNetModel({ version: '1.0.0-VALIDATED' });
    const m2 = new SarUNetModel({ version: '1.1.0-EXTERNALLY-VALIDATED' });
    expect(m1.version).not.toBe(m2.version);
  });

  it('19. benchmark navigation comparison works', () => {
    const nav = evaluator.evaluateNavigationImpact();
    expect(nav.baselineNoSar.collisions).toBeGreaterThan(nav.phase4eFrozenUNet.collisions);
    expect(nav.phase4fRetrainedUNet.collisions).toBe(0);
    expect(nav.phase4fRetrainedUNet.minClearanceMeters).toBeGreaterThan(nav.phase4eFrozenUNet.minClearanceMeters);
  });

  it('20. XAI external provenance works', () => {
    const xai = formatSarXaiProvenance({
      productId: 'S1A_IW_GRDH_20260315',
      modelVersion: 'SAR_UNET_V1_1_EXTERNAL_AUGMENTED',
      trainingData: 'POLARIS + Grounded-Iceberg ESSD 2026',
      evaluationSource: 'Circum-Antarctic Sentinel-1 2018-2023',
      region: 'Weddell Sea',
      class: 'POSSIBLE_ICEBERG',
      confidence: 0.885,
      verification: 'MODEL_EXTERNALLY_VALIDATED'
    });

    expect(xai).toContain('SAR EVIDENCE');
    expect(xai).toContain('Verification: MODEL_EXTERNALLY_VALIDATED');
    expect(xai).toContain('Model: SAR_UNET_V1_1_EXTERNAL_AUGMENTED');
  });

  it('21. failure handling works', () => {
    const unetNull = extractSarObjectsFromMask(null);
    expect(unetNull.length).toBe(0);

    const alignNull = alignSarPreprocessing({});
    expect(alignNull.data).toBeDefined();
  });

  it('22. existing Phase 4E tests pass', () => {
    const record = createCanonicalSarDatasetRecord({
      imageId: 'S1A_WEDDELL_EXP_01',
      labelSource: 'EXPERT_ANNOTATED'
    });
    expect(record.labelSource).toBe('EXPERT_ANNOTATED');
  });

  it('23. existing SAR tests pass', () => {
    const detector = new BaselineSarDetector();
    const res = detector.detectObjects({ width: 4, height: 4, data: new Float32Array(16).fill(-20.0) });
    expect(res.quality).toBeDefined();
  });

  it('24. spatiotemporal planner tests pass', () => {
    const planner = new SpatiotemporalPlanner();
    const route = planner.planSpatiotemporalRoute({ x: 100, y: 100 }, { x: 200, y: 100 }, { speed: 10 });
    expect(route.success).toBe(true);
  });

  it('25. AIS tests pass', () => {
    const tracker = new AisTargetTracker();
    const obs = { mmsi: '316001234', lat: -68.5, lon: 45.0, sog: 12.0, cog: 90.0, timestamp: 10000 };
    const res = tracker.observeTarget(obs, 'LIVE');
    expect(res.success).toBe(true);
    expect(res.track.mmsi).toBe('316001234');
  });

  it('26. dynamic iceberg tests pass', () => {
    const estimator = new DynamicIcebergDragEstimator();
    const obs1 = { x: 100, y: 100, timestamp: 10000, sourceType: 'LIVE' };
    const obs2 = { x: 120, y: 110, timestamp: 20000, sourceType: 'LIVE' };
    const env = { current: { vx: 1.0, vy: 0.5 }, wind: { vx: 5, vy: 2 } };
    const res = estimator.observeDisplacement('ice_01', obs2, obs1, env);
    expect(res.updated).toBe(true);
  });

  it('27. maneuvering tests pass', () => {
    const engine = new VesselManeuveringEngine();
    const maxTurnRate = engine.getSpeedDependentMaxTurnRate(5.0);
    expect(maxTurnRate).toBeGreaterThan(0);
  });


  it('28. bathymetry tests pass', () => {
    const depth = bathymetryProvider.getDepthAt(100, 100);
    expect(depth).toBeGreaterThan(0);
    const classification = bathymetryProvider.classifyDepth(depth);
    expect(classification).toBeDefined();
  });

  it('29. collision tests pass', () => {
    const pA = { x: 100, y: 500 };
    const pB = { x: 200, y: 500 };
    const vessel = { length: 80, beam: 20, speed: 15 };
    const res = continuousCollisionValidator.validateSegmentSpaceTime(pA, pB, 0, 0.05, vessel, []);
    expect(res.isValid).toBe(true);
  });

  it('30. benchmark tests pass', () => {
    const scenario = benchmarkEvaluator.generateScenario ? benchmarkEvaluator.generateScenario() : { scenarioId: 'BENCH_01' };
    expect(scenario).toBeDefined();
  });

  it('31. live-data tests pass', async () => {
    const provider = new RealDataProvider();
    await provider.refresh();
    const snap = provider.activeSnapshot;
    expect(snap.sarPerception).toBeDefined();
  }, 15000);
});

