/**
 * POLARIS — Sentinel-1 SAR Perception & Preprocessing Test Suite (Phase 4B)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SarPerceptionEngine,
  SarProductCache,
  BaselineSarDetector,
  SarPerceptionModel,
  createSarPreprocessingConfig,
  DOWNLOAD_STATE,
  SAR_QUALITY,
  SAR_DETECTION_CLASS
} from '../src/js/data/SarPerceptionEngine.js';
import { createCanonicalSarProduct } from '../src/js/data/providers/Sentinel1ProductProvider.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';

describe('POLARIS Phase 4B — Sentinel-1 SAR Perception & Preprocessing', () => {
  let engine;

  beforeEach(() => {
    engine = new SarPerceptionEngine();
  });

  it('1. Authenticated download state machine transitions correctly', () => {
    expect(engine.downloadState).toBe(DOWNLOAD_STATE.DISCOVERED);
    const product = createCanonicalSarProduct({ productId: 'S1A_TEST_PERCEPTION' });
    const res = engine.processProduct(product);

    expect(engine.downloadState).toBe(DOWNLOAD_STATE.READY);
    expect(res.downloadState).toBe(DOWNLOAD_STATE.READY);
  });

  it('2. Local product cache handles put, get, has, and invalidate', () => {
    const cache = new SarProductCache();
    const product = createCanonicalSarProduct({ productId: 'S1_CACHE_TEST' });

    expect(cache.has('S1_CACHE_TEST')).toBe(false);
    cache.put(product);
    expect(cache.has('S1_CACHE_TEST')).toBe(true);
    expect(cache.get('S1_CACHE_TEST').productId).toBe('S1_CACHE_TEST');

    cache.invalidate('S1_CACHE_TEST');
    expect(cache.has('S1_CACHE_TEST')).toBe(false);
  });

  it('3. Preprocessing converts linear amplitude to decibel backscatter deterministically', () => {
    const rawRaster = {
      productId: 'S1_RASTER_TEST',
      width: 4,
      height: 4,
      data: [1.0, 0.1, 0.01, 0.001]
    };

    const preproc = engine.preprocessSarRaster(rawRaster);
    expect(preproc.width).toBe(4);
    expect(preproc.height).toBe(4);

    // 10 * log10(1.0) = 0 dB
    expect(preproc.data[0]).toBeCloseTo(0.0, 3);
    // 10 * log10(0.1) = -10 dB
    expect(preproc.data[1]).toBeCloseTo(-10.0, 3);
  });

  it('4. Preprocessing configuration maintains GRD calibration specifications', () => {
    const config = createSarPreprocessingConfig({ calibration: 'SIGMA0_DECIBEL', speckleFilter: 'LEE_FILTER_3X3' });
    expect(config.processingVersion).toBeDefined();
    expect(config.calibration).toBe('SIGMA0_DECIBEL');
    expect(config.speckleFilter).toBe('LEE_FILTER_3X3');
    expect(config.outputCrs).toBe('EPSG:4326');
  });

  it('5. Baseline SarDetector identifies targets and calculates quality metrics', () => {
    const detector = new BaselineSarDetector();
    const rasterGrid = {
      productId: 'S1_DETECTOR_TEST',
      width: 10,
      height: 10,
      data: new Float32Array(100).fill(-20.0) // background water -20dB
    };
    // Inject bright spot at (5,5)
    rasterGrid.data[55] = -2.0;

    const res = detector.detectObjects(rasterGrid);
    expect(res.quality).toBe(SAR_QUALITY.OK);
    expect(res.detections.length).toBe(1);
    expect(res.detections[0].backscatterDb).toBe(-2.0);
    expect(res.detections[0].verification).toBe('PERCEPTION_UNVERIFIED');
  });

  it('6. Low quality raster degrades detection status', () => {
    const detector = new BaselineSarDetector();
    const rasterGrid = {
      productId: 'S1_CORRUPT_RASTER',
      width: 10,
      height: 10,
      data: new Float32Array(100).fill(-100.0) // invalid nodata
    };

    const res = detector.detectObjects(rasterGrid);
    expect(res.quality).toBe(SAR_QUALITY.INVALID);
    expect(res.detections.length).toBe(0);
  });

  it('7. SarPerceptionModel ML interface exposes model metadata cleanly', () => {
    const model = new SarPerceptionModel({ modelId: 'UNET_POLAR_V1' });
    const metaBefore = model.getModelMetadata();
    expect(metaBefore.isLoaded).toBe(false);

    model.loadModel();
    const metaAfter = model.getModelMetadata();
    expect(metaAfter.isLoaded).toBe(true);
    expect(metaAfter.classes.length).toBeGreaterThan(0);
  });

  it('8. RealDataProvider incorporates SAR perception processing result in snapshot', async () => {
    const realProvider = new RealDataProvider();
    await realProvider.refresh();

    const snapshot = realProvider.activeSnapshot;
    expect(snapshot).toBeDefined();
    expect(snapshot.sarPerception).toBeDefined();
    expect(snapshot.sarPerception.downloadState).toBe(DOWNLOAD_STATE.READY);
    expect(snapshot.sarPerception.quality).toBe(SAR_QUALITY.OK);
  }, 15000);
});
