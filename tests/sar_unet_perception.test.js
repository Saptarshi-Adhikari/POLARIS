/**
 * POLARIS — Sentinel-1 SAR U-Net Trained Perception Test Suite (Phase 4C)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SarUNetModel,
  createCanonicalSarDatasetRecord,
  extractSarObjectsFromMask,
  calculateWeightedCrossEntropyAndDiceLoss,
  splitDatasetByScene,
  SEGMENTATION_CLASS,
  DATASET_SPLIT,
  MODEL_TRAINING_STATUS
} from '../src/js/data/SarUNetPerception.js';
import { sarPerceptionEngine, DOWNLOAD_STATE, SAR_QUALITY } from '../src/js/data/SarPerceptionEngine.js';
import { createCanonicalSarProduct } from '../src/js/data/providers/Sentinel1ProductProvider.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';

describe('POLARIS Phase 4C — Trained Sentinel-1 SAR U-Net Perception', () => {
  let model;

  beforeEach(() => {
    model = new SarUNetModel();
  });

  it('1. Dataset schema validates canonical format with UNLABELED / NO_TRAINING_DATA default', () => {
    const record = createCanonicalSarDatasetRecord({ imageId: 'SAR-TEST-01', labelSource: 'UNLABELED' });
    expect(record.imageId).toBe('SAR-TEST-01');
    expect(record.labelSource).toBe('UNLABELED');
    expect(record.split).toBe(DATASET_SPLIT.TRAIN);
    expect(model.trainingStatus).toBe(MODEL_TRAINING_STATUS.NO_TRAINING_DATA);
  });

  it('2. Scene-level dataset splitting prevents spatial patch leakage', () => {
    const records = [
      createCanonicalSarDatasetRecord({ imageId: 'P1-tile1', productId: 'P1' }),
      createCanonicalSarDatasetRecord({ imageId: 'P1-tile2', productId: 'P1' }),
      createCanonicalSarDatasetRecord({ imageId: 'P2-tile1', productId: 'P2' }),
      createCanonicalSarDatasetRecord({ imageId: 'P3-tile1', productId: 'P3' }),
      createCanonicalSarDatasetRecord({ imageId: 'P4-tile1', productId: 'P4' })
    ];

    const split = splitDatasetByScene(records, 0.5, 0.25, 0.25);
    const p1Records = split.filter(r => r.productId === 'P1');

    // Both tiles from scene P1 MUST share the exact same split
    expect(p1Records[0].split).toBe(p1Records[1].split);
  });

  it('3. U-Net forward pass produces 5-class multi-class segmentation mask', () => {
    const patchGrid = {
      width: 4,
      height: 4,
      data: new Float32Array(16).fill(-20.0) // water
    };
    patchGrid.data[5] = 2.0; // bright spot (iceberg)

    const res = model.forward(patchGrid);
    expect(res.width).toBe(4);
    expect(res.height).toBe(4);
    expect(res.predictedMask.length).toBe(16);
    expect(res.predictedMask[5]).toBe(SEGMENTATION_CLASS.POSSIBLE_ICEBERG);
  });

  it('4. Connected-component object extraction detects candidate iceberg geometries', () => {
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

    const objects = extractSarObjectsFromMask(unetRes, undefined, 2, 'S1_PROD_TEST');
    expect(objects.length).toBe(1);
    expect(objects[0].class).toBe('POSSIBLE_ICEBERG');
    expect(objects[0].pixelArea).toBe(4);
    expect(objects[0].verification).toBe('EXPERIMENTAL');
  });

  it('5. Class-imbalance weighted cross-entropy & dice loss computes deterministically', () => {
    const logits = new Float32Array(20).fill(0.2);
    const targetMask = new Uint8Array([0, 1, 2, 3]);

    const loss = calculateWeightedCrossEntropyAndDiceLoss(logits, targetMask, 5);
    expect(loss.loss).toBeGreaterThan(0);
    expect(loss.ceLoss).toBeGreaterThan(0);
  });

  it('6. SarPerceptionEngine incorporates U-Net segmentation results into processProduct output', () => {
    const product = createCanonicalSarProduct({ productId: 'S1A_UNET_TEST' });
    const res = sarPerceptionEngine.processProduct(product);

    expect(res.unetDetections).toBeDefined();
    expect(res.mlModelStatus.modelId).toBe('SAR_UNET_V1_ANTARCTIC');
  });

  it('7. RealDataProvider incorporates U-Net perception output into environment snapshot', async () => {
    const realProvider = new RealDataProvider();
    await realProvider.refresh();

    const snapshot = realProvider.activeSnapshot;
    expect(snapshot.sarPerception.unetDetections).toBeDefined();
  }, 15000);
});
