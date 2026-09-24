import { provenanceRegistry } from '../dataSources.js';
import { DemoDataProvider } from '../data/DemoDataProvider.js';
import { RealDataProvider } from '../data/RealDataProvider.js';
import { MapLibreRenderer } from './maplibreRenderer.js';

export class ModeManager {
  constructor(engine) {
    this.engine = engine;
    this.currentMode = 'DEMO';
    this.activeProvider = new DemoDataProvider(engine);
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

    // Dispose previous active provider
    if (this.activeProvider && typeof this.activeProvider.dispose === 'function') {
      this.activeProvider.dispose();
    }

    const demoBtn = typeof document !== 'undefined' ? document.getElementById('data-mode-demo-btn') : null;
    const realBtn = typeof document !== 'undefined' ? document.getElementById('data-mode-real-btn') : null;
    const realHud = typeof document !== 'undefined' ? document.getElementById('real-data-provenance-hud') : null;

    const mapViewGroup = typeof document !== 'undefined' ? document.getElementById('map-view-3d-group') : null;
    const spawnBtn = typeof document !== 'undefined' ? document.getElementById('add-iceberg-btn') : null;
    const bottomSpawnBtn = typeof document !== 'undefined' ? document.getElementById('bottom-spawn-iceberg-btn') : null;
    const sourceText = typeof document !== 'undefined' ? document.getElementById('provenance-source-text') : null;

    const demoCanvas = typeof document !== 'undefined' ? document.getElementById('map-canvas') : null;
    const bottomPlaybackBar = typeof document !== 'undefined' ? document.getElementById('bottom-playback-bar') : null;
    const voyageStatsHud = typeof document !== 'undefined' ? document.getElementById('voyage-stats-hud') : null;

    if (mode === 'REAL') {
      this.activeProvider = new RealDataProvider(this.engine);
      if (this.engine) this.engine.dataMode = 'REAL';

      // Hide DEMO canvas & DEMO-only controls
      if (demoCanvas) demoCanvas.classList.add('hidden');
      if (bottomPlaybackBar) bottomPlaybackBar.classList.add('hidden');
      if (voyageStatsHud) voyageStatsHud.classList.add('hidden');

      if (this.engine) {
        if (!this.engine.maplibreRenderer) {
          this.engine.maplibreRenderer = new MapLibreRenderer('maplibre-container');
        }
        this.maplibreRenderer = this.engine.maplibreRenderer;
        this.engine.maplibreRenderer.show();
        this.engine.maplibreRenderer.init();
      }

      if (demoBtn) {
        demoBtn.className = 'px-2 py-0.5 text-xs font-bold rounded-l bg-surface-container text-on-surface hover:text-secondary border border-outline/40 transition-all cursor-pointer';
      }
      if (realBtn) {
        realBtn.className = 'px-2 py-0.5 text-xs font-bold rounded-r bg-secondary text-surface border border-secondary transition-all cursor-pointer';
      }
      if (realHud) {
        realHud.classList.remove('hidden');
      }

      // Hide 2D/3D toggle group as 3D mode is completely removed
      if (mapViewGroup) {
        mapViewGroup.classList.add('hidden');
      }

      // SPAWN ICEBERG is hidden in REAL mode (observed/replay icebergs only)
      if (spawnBtn) spawnBtn.classList.add('hidden');
      if (bottomSpawnBtn) bottomSpawnBtn.classList.add('hidden');
      if (sourceText) sourceText.innerText = 'MapTiler Satellite/Hybrid / USNIC / Open-Meteo';

      // Update provenance registry
      provenanceRegistry.updateStatus('open-meteo-marine', 'LIVE', { note: 'Open-Meteo at Bharati Corridor (-69.4°S, 76.18°E)' });
      provenanceRegistry.updateStatus('usnic-icebergs', 'CACHED', { note: 'USNIC Static Snapshot (2026-09-24)' });
      provenanceRegistry.updateStatus('synthetic-sea-ice', 'SIM', { note: 'Sea-Ice Grid reprojected to Lat/Lon' });
      provenanceRegistry.updateStatus('natural-earth-coastline', 'LIVE', { note: 'GEO: MapTiler Hybrid / Real Antarctic Imagery' });

      // Update engine state
      if (this.engine && this.engine.state) {
        this.engine.state.environment.mode = 'REAL';
      }
    } else {
      this.activeProvider = new DemoDataProvider(this.engine);
      if (this.engine) this.engine.dataMode = 'DEMO';

      // Restore DEMO canvas & DEMO controls
      if (demoCanvas) demoCanvas.classList.remove('hidden');
      if (bottomPlaybackBar) bottomPlaybackBar.classList.remove('hidden');
      if (voyageStatsHud) voyageStatsHud.classList.remove('hidden');

      if (this.engine && this.engine.maplibreRenderer) {
        this.engine.maplibreRenderer.hide();
      }

      if (spawnBtn) spawnBtn.classList.remove('hidden');
      if (bottomSpawnBtn) bottomSpawnBtn.classList.remove('hidden');
      if (sourceText) sourceText.innerText = 'DEMO SYNTHETIC';

      if (demoBtn) {
        demoBtn.className = 'px-2 py-0.5 text-xs font-bold rounded-l bg-secondary text-surface border border-secondary transition-all cursor-pointer';
      }
      if (realBtn) {
        realBtn.className = 'px-2 py-0.5 text-xs font-bold rounded-r bg-surface-container text-on-surface hover:text-secondary border border-outline/40 transition-all cursor-pointer';
      }
      if (realHud) {
        realHud.classList.add('hidden');
      }

      if (mapViewGroup) {
        mapViewGroup.classList.add('hidden');
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
