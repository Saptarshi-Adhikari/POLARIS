/**
 * POLARIS DataProvider Architecture Interface
 *
 * Strict contract implemented by all data providers (DemoDataProvider, RealDataProvider).
 */

export class DataProvider {
  constructor(name = 'BASE_PROVIDER') {
    this.name = name;
    this.status = 'READY';
    this.errorMessage = null;
  }

  getSeaIce(viewport) {
    throw new Error('getSeaIce must be implemented by subclass');
  }

  getCurrents(viewport) {
    throw new Error('getCurrents must be implemented by subclass');
  }

  getIcebergs() {
    throw new Error('getIcebergs must be implemented by subclass');
  }

  getMeteo(lat, lon) {
    throw new Error('getMeteo must be implemented by subclass');
  }

  getProvenance() {
    throw new Error('getProvenance must be implemented by subclass');
  }

  dispose() {
    // Override in subclasses to abort fetch controllers and drop listeners
  }
}
