/**
 * POLARIS Mode Manager: DEMO vs REAL Mode Switcher
 */

import { provenanceRegistry } from '../dataSources.js';

export class ModeManager {
  constructor(engine) {
    this.engine = engine;
    this.currentMode = 'DEMO';
  }

  init() {
    // Check URL parameters for ?mode=real
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('mode') === 'real') {
        this.setMode('REAL');
      }
    }

    this.bindUI();
  }

  bindUI() {
    if (typeof document === 'undefined') return;
    const demoBtn = document.getElementById('data-mode-demo-btn');
    const realBtn = document.getElementById('data-mode-real-btn');

    if (demoBtn) {
      demoBtn.addEventListener('click', () => this.setMode('DEMO'));
    }
    if (realBtn) {
      realBtn.addEventListener('click', () => this.setMode('REAL'));
    }
  }

  setMode(mode) {
    if (this.currentMode === mode) return;
    this.currentMode = mode;

    const demoBtn = typeof document !== 'undefined' ? document.getElementById('data-mode-demo-btn') : null;
    const realBtn = typeof document !== 'undefined' ? document.getElementById('data-mode-real-btn') : null;
    const realHud = typeof document !== 'undefined' ? document.getElementById('real-data-provenance-hud') : null;

    if (mode === 'REAL') {
      if (demoBtn) {
        demoBtn.className = 'px-2 py-0.5 text-xs font-bold rounded-l bg-surface-container text-on-surface hover:text-secondary border border-outline/40 transition-all cursor-pointer';
      }
      if (realBtn) {
        realBtn.className = 'px-2 py-0.5 text-xs font-bold rounded-r bg-secondary text-surface border border-secondary transition-all cursor-pointer';
      }
      if (realHud) {
        realHud.classList.remove('hidden');
      }

      // Repoint provenance badges to BUNDLED / STYLIZED / LIVE
      provenanceRegistry.updateStatus('open-meteo-marine', 'LIVE', { note: 'Open-Meteo at Bharati Corridor (-69.4°S, 76.18°E)' });
      provenanceRegistry.updateStatus('usnic-icebergs', 'LIVE', { note: 'USNIC Named Iceberg Dataset' });
      provenanceRegistry.updateStatus('synthetic-sea-ice', 'SIM', { note: 'Sea-Ice Grid reprojected to Lat/Lon' });

      // Update engine state
      if (this.engine && this.engine.state) {
        this.engine.state.environment.mode = 'REAL';
      }
    } else {
      if (demoBtn) {
        demoBtn.className = 'px-2 py-0.5 text-xs font-bold rounded-l bg-secondary text-surface border border-secondary transition-all cursor-pointer';
      }
      if (realBtn) {
        realBtn.className = 'px-2 py-0.5 text-xs font-bold rounded-r bg-surface-container text-on-surface hover:text-secondary border border-outline/40 transition-all cursor-pointer';
      }
      if (realHud) {
        realHud.classList.add('hidden');
      }

      // Reset provenance badges to SIM
      provenanceRegistry.updateStatus('open-meteo-marine', 'SIM');
      provenanceRegistry.updateStatus('usnic-icebergs', 'SIM');
      provenanceRegistry.updateStatus('synthetic-sea-ice', 'SIM');

      if (this.engine && this.engine.state) {
        this.engine.state.environment.mode = 'SIMULATION';
      }
    }

    console.log(`[ModeManager] Navigation Mode switched to ${mode}`);
  }
}
