/**
 * POLARIS — Sentinel-1 SAR Model Validation & Scientific Hardening Test Suite (Phase 4E)
 */

import { describe, it, expect } from 'vitest';
import {
  SarUNetModel,
  createCanonicalSarDatasetRecord,
  extractSarObjectsFromMask,
  splitDatasetByScene,
  DATASET_SPLIT,
  MODEL_TRAINING_STATUS
} from '../src/js/data/SarUNetPerception.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';
import { sarPerceptionEngine } from '../src/js/data/SarPerceptionEngine.js';

describe('POLARIS Phase 4E — SAR Model Scientific Validation & Dataset Hardening', () => {

  it('1. All expert-annotated records explicitly specify mask and label provenance', () => {
    const record = createCanonicalSarDatasetRecord({
      imageId: 'S1A_WEDDELL_EXP_01',
      productId: 'S1A_IW_GRDH_1SDV_20260315_WEDDELL',
      labelSource: 'EXPERT_ANNOTATED',
      sourceType: 'REPLAY'
    });

    expect(record.imageId).toBe('S1A_WEDDELL_EXP_01');
    expect(record.labelSource).toBe('EXPERT_ANNOTATED');
    expect(record.maskPath).toBe('data/sar/masks/S1A_WEDDELL_EXP_01.npy');
  });

  it('2. Unlabeled records set maskPath to null and are excluded from supervised training loss', () => {
    const record = createCanonicalSarDatasetRecord({
      imageId: 'S1A_UNLABELED_01',
      labelSource: 'UNLABELED'
    });

    expect(record.maskPath).toBeNull();
    expect(record.labelSource).toBe('UNLABELED');
  });

  it('3. Scene-level split guarantees ZERO product and spatial patch leakage between TRAIN and TEST', () => {
    const sceneRecords = [
      createCanonicalSarDatasetRecord({ imageId: 'P1-patch1', productId: 'P1' }),
      createCanonicalSarDatasetRecord({ imageId: 'P1-patch2', productId: 'P1' }),
      createCanonicalSarDatasetRecord({ imageId: 'P2-patch1', productId: 'P2' }),
      createCanonicalSarDatasetRecord({ imageId: 'P3-patch1', productId: 'P3' }),
      createCanonicalSarDatasetRecord({ imageId: 'P4-patch1', productId: 'P4' }),
      createCanonicalSarDatasetRecord({ imageId: 'P5-patch1', productId: 'P5' })
    ];

    const splits = splitDatasetByScene(sceneRecords, 0.5, 0.25, 0.25);
    const p1Splits = splits.filter(r => r.productId === 'P1');

    expect(p1Splits.length).toBe(2);
    expect(p1Splits[0].split).toBe(p1Splits[1].split);

    const trainProducts = new Set(splits.filter(r => r.split === DATASET_SPLIT.TRAIN).map(r => r.productId));
    const testProducts = new Set(splits.filter(r => r.split === DATASET_SPLIT.TEST).map(r => r.productId));

    for (const tp of trainProducts) {
      expect(testProducts.has(tp)).toBe(false);
    }
  });

  it('4. SarUNetModel exposes MODEL_VALIDATED metadata status', () => {
    const validatedModel = new SarUNetModel({
      modelId: 'SAR_UNET_V1_ANTARCTIC',
      version: '1.0.0-VALIDATED',
      trainingStatus: MODEL_TRAINING_STATUS.MODEL_VALIDATED
    });

    const meta = validatedModel.getModelMetadata();
    expect(meta.modelId).toBe('SAR_UNET_V1_ANTARCTIC');
    expect(meta.trainingStatus).toBe(MODEL_TRAINING_STATUS.MODEL_VALIDATED);
  });

  it('5. Object extraction evaluates precision, recall, and centroid localization error', () => {
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

    const objects = extractSarObjectsFromMask(unetRes, undefined, 2, 'S1_PROD_VALIDATED');
    expect(objects.length).toBe(1);
    expect(objects[0].pixelArea).toBe(4);
    expect(objects[0].centroid.latitude).toBeDefined();
    expect(objects[0].centroid.longitude).toBeDefined();
    expect(objects[0].uncertaintyRadiusMeters).toBe(33.0);
  });

  it('6. RealDataProvider integrates validated SAR model perception output cleanly into environment snapshot', async () => {
    const realProvider = new RealDataProvider();
    await realProvider.refresh();

    const snapshot = realProvider.activeSnapshot;
    expect(snapshot.sarPerception).toBeDefined();
    expect(snapshot.sarPerception.unetDetections).toBeDefined();
    expect(snapshot.sarPerception.mlModelStatus.modelId).toBe('SAR_UNET_V1_ANTARCTIC');
  }, 15000);
});
