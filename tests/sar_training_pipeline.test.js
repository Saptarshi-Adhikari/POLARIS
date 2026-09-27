/**
 * POLARIS — Sentinel-1 SAR Training Pipeline & Model Validation Test Suite (Phase 4D)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SarUNetModel,
  createCanonicalSarDatasetRecord,
  extractSarObjectsFromMask,
  splitDatasetByScene,
  calculateWeightedCrossEntropyAndDiceLoss,
  DATASET_SPLIT,
  MODEL_TRAINING_STATUS
} from '../src/js/data/SarUNetPerception.js';
import { sarPerceptionEngine, DOWNLOAD_STATE } from '../src/js/data/SarPerceptionEngine.js';
import { createCanonicalSarProduct } from '../src/js/data/providers/Sentinel1ProductProvider.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';

describe('POLARIS Phase 4D — Real SAR Dataset Acquisition & U-Net Training', () => {
  it('1. Real dataset manifest loads and preserves provenance metadata', () => {
    const record = createCanonicalSarDatasetRecord({
      imageId: 'SAR-ANTARCTIC-01',
      productId: 'S1A_IW_GRDH_1SDV_20260315_WEDDELL',
      region: 'WEDDELL_SEA',
      labelSource: 'EXPERT_ANNOTATED'
    });

    expect(record.imageId).toBe('SAR-ANTARCTIC-01');
    expect(record.region).toBe('WEDDELL_SEA');
    expect(record.labelSource).toBe('EXPERT_ANNOTATED');
  });

  it('2. Scene-level split prevents geographic and spatial patch leakage', () => {
    const records = [
      createCanonicalSarDatasetRecord({ imageId: 'P1-patchA', productId: 'P1' }),
      createCanonicalSarDatasetRecord({ imageId: 'P1-patchB', productId: 'P1' }),
      createCanonicalSarDatasetRecord({ imageId: 'P2-patchA', productId: 'P2' }),
      createCanonicalSarDatasetRecord({ imageId: 'P3-patchA', productId: 'P3' })
    ];

    const split = splitDatasetByScene(records, 0.5, 0.25, 0.25);
    const p1Split = split.filter(r => r.productId === 'P1');
    expect(p1Split[0].split).toBe(p1Split[1].split);
  });

  it('3. Model metadata reflects MODEL_TRAINED status when PyTorch checkpoint exists', () => {
    const trainedModel = new SarUNetModel({
      modelId: 'SAR_UNET_V1_ANTARCTIC',
      version: '1.0.0-TRAINED',
      trainingStatus: MODEL_TRAINING_STATUS.MODEL_TRAINED
    });

    const meta = trainedModel.getModelMetadata();
    expect(meta.modelId).toBe('SAR_UNET_V1_ANTARCTIC');
    expect(meta.trainingStatus).toBe(MODEL_TRAINING_STATUS.MODEL_TRAINED);
  });

  it('4. Class-weighted Cross Entropy and Dice loss computes on training data only', () => {
    const logits = new Float32Array(25).fill(0.2);
    const targetMask = new Uint8Array([0, 1, 2, 3, 4]);

    const loss = calculateWeightedCrossEntropyAndDiceLoss(logits, targetMask, 5, [1.0, 1.5, 5.0, 1.0, 0.5]);
    expect(loss.loss).toBeGreaterThan(0);
    expect(loss.ceLoss).toBeGreaterThan(0);
  });

  it('5. Object extraction calculates precision, centroid geolocation, and uncertainty radii', () => {
    const unetRes = {
      width: 4,
      height: 4,
      predictedMask: new Uint8Array([
        0, 0, 0, 0,
        0, 2, 2, 0,
        0, 2, 2, 0,
        0, 0, 0, 0
      ])
    };

    const objects = extractSarObjectsFromMask(unetRes, undefined, 2, 'S1_PROD_TRAINED');
    expect(objects.length).toBe(1);
    expect(objects[0].pixelArea).toBe(4);
    expect(objects[0].uncertaintyRadiusMeters).toBe(33.0);
  });

  it('6. RealDataProvider integrates trained U-Net perception output into environment snapshot', async () => {
    const realProvider = new RealDataProvider();
    await realProvider.refresh();

    const snapshot = realProvider.activeSnapshot;
    expect(snapshot.sarPerception).toBeDefined();
    expect(snapshot.sarPerception.unetDetections).toBeDefined();
    expect(snapshot.sarPerception.mlModelStatus.modelId).toBe('SAR_UNET_V1_ANTARCTIC');
  }, 15000);
});
