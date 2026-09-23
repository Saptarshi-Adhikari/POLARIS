/**
 * POLARIS DemoDataProvider Implementation
 *
 * Serves 100% synthetic sandbox data.
 * ABSOLUTELY ZERO network fetch calls are made or reachable.
 */

import { DataProvider } from './DataProvider.js';

export class DemoDataProvider extends DataProvider {
  constructor(engine) {
    super('DEMO_PROVIDER');
    this.engine = engine;
  }

  getSeaIce(viewport) {
    const avgConc = this.engine && this.engine.state ? this.engine.state.environment.seaIce.averageConcentration : 0.2;
    return {
      synthetic: true,
      data: { averageConcentration: avgConc },
      provenance: {
        status: 'SIM',
        source: 'Antarctic Sea-Ice Grid',
        license: 'Synthetic Model'
      },
      units: 'Concentration (0-1)'
    };
  }

  getCurrents(viewport) {
    const stateEnv = this.engine && this.engine.state ? this.engine.state.environment : {};
    return {
      synthetic: true,
      data: {
        speed: stateEnv.ocean ? stateEnv.ocean.currentSpeed : 1.8,
        direction: stateEnv.ocean ? stateEnv.ocean.currentDirection : 127
      },
      provenance: {
        status: 'SIM',
        source: 'Southern Ocean Currents',
        license: 'Synthetic Model'
      },
      units: 'SU/s @ deg'
    };
  }

  getIcebergs() {
    const icebergs = this.engine && this.engine.icebergs ? this.engine.icebergs : [];
    return {
      data: icebergs.map(ice => ({
        id: ice.id,
        name: ice.name || `IB-${ice.id}`,
        x: ice.x,
        y: ice.y,
        size: ice.size,
        collisionRadius: ice.collisionRadius
      })),
      provenance: {
        status: 'SIM',
        source: 'Synthetic Iceberg Generator',
        license: 'Synthetic Model'
      },
      units: 'SU'
    };
  }

  getMeteo(lat, lon) {
    const stateEnv = this.engine && this.engine.state ? this.engine.state.environment : {};
    return {
      data: {
        windSpeed: stateEnv.wind ? stateEnv.wind.speed : 45.2,
        windDirection: stateEnv.wind ? stateEnv.wind.direction : 247
      },
      provenance: {
        status: 'SIM',
        source: 'Synthetic Wind Grid',
        license: 'Synthetic Model'
      },
      units: 'knots / deg'
    };
  }

  getProvenance() {
    return [
      { id: 'synthetic-sea-ice', status: 'SIM', note: 'Procedural concentration grid' },
      { id: 'synthetic-currents', status: 'SIM', note: 'Simulated 2D current vector field' },
      { id: 'open-meteo-marine', status: 'SIM', note: 'Synthetic wind field' },
      { id: 'usnic-icebergs', status: 'SIM', note: 'Synthetic iceberg track generator' }
    ];
  }

  dispose() {
    // Pure in-memory synthetic provider, no resources to release
  }
}
