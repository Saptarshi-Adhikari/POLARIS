import { provenanceRegistry } from '../dataSources.js';
import { DemoDataProvider } from '../data/DemoDataProvider.js';

export class ModeManager {
  constructor(engine) {
    this.engine = engine;
    this.currentMode = 'DEMO';
    this.activeProvider = new DemoDataProvider(engine);
  }

  init() {
    this.setMode('DEMO');
  }

  bindUI() {}

  setMode(mode = 'DEMO') {
    this.currentMode = 'DEMO';
    if (this.engine) {
      this.engine.dataMode = 'DEMO';
      if (this.engine.state) {
        this.engine.state.environment.mode = 'SIMULATION';
      }
    }

    provenanceRegistry.updateStatus('open-meteo-marine', 'SIM');
    provenanceRegistry.updateStatus('usnic-icebergs', 'SIM');
    provenanceRegistry.updateStatus('synthetic-sea-ice', 'SIM');

    console.log('[ModeManager] Navigation Mode initialized in DEMO mode');
  }
}
