/**
 * POLARIS DataProvider Layer
 * Abstract base class and implementations:
 *  - DemoDataProvider: Existing synthetic world data generator
 *  - RealReplayProvider: Historical maritime replay data (USNIC + Copernicus Marine)
 */

import { createNormalizedHazard, createNormalizedEnvironment, createNormalizedVesselObservation, validateHazardSchema } from './schemas.js';
import { geoToWorld, worldToGeo, DEFAULT_ANTARCTIC_BBOX } from './geoTransform.js';
import { USNIC_ICEBERG_SAMPLES, COPERNICUS_ERA5_ENVIRONMENT_SAMPLE } from './realMaritimeDataset.js';

export class DataProvider {
  constructor(name = 'BASE_PROVIDER') {
    this.name = name;
    this.status = 'READY';
    this.errorMessage = null;
  }

  getHazards(simTimeHours = 14.0) {
    throw new Error('getHazards must be implemented by subclass');
  }

  getEnvironment(simTimeHours = 14.0) {
    throw new Error('getEnvironment must be implemented by subclass');
  }

  getVesselObservation(simTimeHours = 14.0) {
    throw new Error('getVesselObservation must be implemented by subclass');
  }

  getMetadata() {
    return {
      provider: this.name,
      status: this.status,
      errorMessage: this.errorMessage
    };
  }
}

export class DemoDataProvider extends DataProvider {
  constructor(engine) {
    super('DEMO_SYNTHETIC');
    this.engine = engine;
  }

  getHazards() {
    if (!this.engine || !this.engine.icebergs) return [];
    return this.engine.icebergs.map(ice => {
      const geo = worldToGeo(ice.x, ice.y);
      return createNormalizedHazard({
        id: ice.id || `IB-${Math.round(ice.x)}`,
        type: 'ICEBERG',
        latitude: geo.lat,
        longitude: geo.lon,
        position: { x: ice.x, y: ice.y },
        velocity: { vx: ice.vx || 0, vy: ice.vy || 0 },
        geometry: { size: ice.size || 500, radius: ice.collisionRadius || 25, mass: ice.mass || 1.0 },
        timestamp: Date.now(),
        uncertainty: 0.02,
        confidence: 0.98,
        source: 'DEMO_SYNTHETIC'
      });
    });
  }

  getEnvironment() {
    const stateEnv = this.engine && this.engine.state ? this.engine.state.environment : {};
    return createNormalizedEnvironment({
      timestamp: Date.now(),
      current: {
        speed: stateEnv.ocean ? stateEnv.ocean.currentSpeed : 1.8,
        direction: stateEnv.ocean ? stateEnv.ocean.currentDirection : 127
      },
      wind: {
        speed: stateEnv.wind ? stateEnv.wind.speed : 45.2,
        direction: stateEnv.wind ? stateEnv.wind.direction : 247
      },
      seaIce: {
        concentration: stateEnv.seaIce ? stateEnv.seaIce.averageConcentration : 0.2
      },
      source: 'DEMO_SYNTHETIC'
    });
  }

  getVesselObservation() {
    const ship = this.engine ? this.engine.ship : { x: 400, y: 1800, heading: 330 };
    const geo = worldToGeo(ship.x, ship.y);
    return createNormalizedVesselObservation({
      id: 'POLARIS_DEMO_VESSEL',
      timestamp: Date.now(),
      latitude: geo.lat,
      longitude: geo.lon,
      speed: ship.speedKnots || 12.0,
      course: ship.heading || 330,
      heading: ship.heading || 330,
      source: 'DEMO_TELEMETRY'
    });
  }
}

export class RealReplayProvider extends DataProvider {
  constructor(bbox = DEFAULT_ANTARCTIC_BBOX) {
    super('REAL_HISTORICAL_REPLAY');
    this.bbox = bbox;
    this.rawHazards = USNIC_ICEBERG_SAMPLES;
    this.rawEnvironment = COPERNICUS_ERA5_ENVIRONMENT_SAMPLE;
    this.replayTimeUTC = '2026-03-15 12:00:00 UTC';
    this.primarySource = 'USNIC / Copernicus Marine';
    this.status = 'READY';
    this.errorMessage = null;
  }

  setDataset(icebergSamples, envSample, timeUTC) {
    if (!Array.isArray(icebergSamples)) {
      this.status = 'ERROR';
      this.errorMessage = 'Invalid dataset: iceberg samples must be an array';
      return false;
    }
    this.rawHazards = icebergSamples;
    if (envSample) this.rawEnvironment = envSample;
    if (timeUTC) this.replayTimeUTC = timeUTC;
    this.status = 'READY';
    this.errorMessage = null;
    return true;
  }

  getHazards(simTimeHours = 14.0) {
    if (this.status === 'ERROR') {
      return [];
    }

    const hazards = [];
    for (let sample of this.rawHazards) {
      try {
        const pos = geoToWorld(sample.latitude, sample.longitude, this.bbox);

        // Drift projection proportional to simTime
        const driftDt = (simTimeHours - 14.0);
        const driftedX = pos.x + (sample.vx || 0.15) * driftDt * 30;
        const driftedY = pos.y + (sample.vy || 0.08) * driftDt * 30;

        const hazard = createNormalizedHazard({
          id: sample.id,
          type: 'ICEBERG',
          latitude: sample.latitude,
          longitude: sample.longitude,
          position: { x: driftedX, y: driftedY },
          velocity: { vx: sample.vx || 0.15, vy: sample.vy || 0.08 },
          geometry: {
            size: sample.size || 1200,
            radius: sample.collisionRadius || 40,
            mass: sample.massScale || 2.0
          },
          timestamp: Date.parse(sample.timestamp || '2026-03-15T12:00:00Z'),
          uncertainty: sample.uncertainty || 0.05,
          confidence: sample.confidence || 0.95,
          source: sample.source || 'USNIC'
        });

        const val = validateHazardSchema(hazard);
        if (val.valid) {
          hazards.push(hazard);
        } else {
          console.warn(`[RealReplayProvider] Rejected corrupt hazard ${sample.id}: ${val.reason}`);
        }
      } catch (err) {
        console.warn(`[RealReplayProvider] Error transforming record ${sample.id}:`, err);
      }
    }
    return hazards;
  }

  getEnvironment() {
    const raw = this.rawEnvironment || COPERNICUS_ERA5_ENVIRONMENT_SAMPLE;
    return createNormalizedEnvironment({
      timestamp: Date.parse(raw.timestamp || '2026-03-15T12:00:00Z'),
      current: {
        speed: raw.current.speedKnots || 2.1,
        direction: raw.current.directionDegrees || 135,
        vx: raw.current.vx || 0.25,
        vy: raw.current.vy || 0.15
      },
      wind: {
        speed: raw.wind.speedKnots || 38.5,
        direction: raw.wind.directionDegrees || 240,
        vx: raw.wind.vx || -0.45,
        vy: raw.wind.vy || -0.20
      },
      seaIce: {
        concentration: raw.seaIce.averageConcentration || 0.28,
        resistanceFactor: raw.seaIce.resistanceFactor || 1.2
      },
      source: raw.source || 'Copernicus Marine / ERA5'
    });
  }

  getVesselObservation(simTimeHours = 14.0) {
    const startGeo = { lat: -74.5, lon: -70.0 };
    return createNormalizedVesselObservation({
      id: 'POLARIS_REAL_VESSEL',
      timestamp: Date.parse(this.rawEnvironment.timestamp || '2026-03-15T12:00:00Z'),
      latitude: startGeo.lat,
      longitude: startGeo.lon,
      speed: 14.5,
      course: 330,
      heading: 330,
      source: 'USCG AIS / GPS Telemetry'
    });
  }

  getMetadata() {
    return {
      provider: this.name,
      status: this.status,
      errorMessage: this.errorMessage,
      source: this.primarySource,
      timeUTC: this.replayTimeUTC,
      mode: 'HISTORICAL REPLAY',
      recordCount: this.rawHazards.length
    };
  }
}
