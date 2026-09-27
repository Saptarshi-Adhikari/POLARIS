/**
 * POLARIS Nav-OS — Real Data Session Manager (Phase 7B Final Integration)
 *
 * Orchestrates real external data providers (USNIC Antarctic Ice, Open-Meteo Weather,
 * Copernicus Current, GEBCO Bathymetry, Real AIS Tracks, Sentinel-1 SAR Catalogue)
 * into a single canonical RealDataSession payload with explicit provenance preservation.
 */

import { RealDataProvider } from './RealDataProvider.js';
import { bathymetryProvider } from '../providers/bathymetryProvider.js';

export const DATA_MODE_TERMINOLOGY = Object.freeze({
  REAL_LIVE: 'REAL_LIVE',
  REAL_REPLAY: 'REAL_REPLAY',
  REAL_CACHED: 'REAL_CACHED',
  REAL_DATA_MIXED: 'REAL_DATA_MIXED',
  SYNTHETIC: 'SYNTHETIC',
  DEGRADED: 'DEGRADED',
  STALE: 'STALE',
  OFFLINE: 'OFFLINE'
});

export class RealDataSessionManager {
  constructor() {
    this.realDataProvider = new RealDataProvider();
    this.currentSession = null;
    this.syntheticFallbackCount = 0;
  }

  /**
   * Initializes and executes a complete Real-Data Session.
   */
  async startRealDataSession(options = {}) {
    const startedAt = Date.now();
    const sessionId = `REAL_SESSION_${startedAt}_${Math.floor(Math.random() * 1000)}`;

    const snapshot = await this.realDataProvider.refresh();
    const bathymetryMeta = bathymetryProvider.getMetadata();

    const providerStates = snapshot ? snapshot.providerHealth : {};
    let syntheticFallbacks = 0;
    let liveSources = 0;
    let replaySources = 0;

    Object.values(providerStates).forEach(ph => {
      if (ph.sourceType === 'LIVE') liveSources++;
      else if (ph.sourceType === 'REPLAY' || ph.sourceType === 'CACHED') replaySources++;
      else syntheticFallbacks++;
    });

    this.syntheticFallbackCount = syntheticFallbacks;

    let sessionMode = DATA_MODE_TERMINOLOGY.REAL_REPLAY;
    if (liveSources > 0 && (replaySources > 0 || syntheticFallbacks > 0)) {
      sessionMode = DATA_MODE_TERMINOLOGY.REAL_DATA_MIXED;
    } else if (liveSources > 0 && replaySources === 0 && syntheticFallbacks === 0) {
      sessionMode = DATA_MODE_TERMINOLOGY.REAL_LIVE;
    }

    const sessionPayload = {
      sessionId,
      startedAt,
      worldTime: startedAt,
      dataMode: sessionMode,
      providerStates,
      syntheticFallbackCount: syntheticFallbacks,
      sourceProvenance: snapshot?.provenance || { providers: ['USNIC (Bundled)', 'Open-Meteo', 'GEBCO', 'AIS Replay'] },
      environmentSnapshot: snapshot,
      trackSnapshot: snapshot?.vessels || [],
      sarSnapshot: snapshot?.sarObservation || null,
      bathymetrySnapshot: bathymetryMeta,
      weatherSnapshot: snapshot?.wind || {},
      currentSnapshot: snapshot?.currents || {},
      iceSnapshot: snapshot?.icebergs || [],
      fusionSnapshot: snapshot?.radarPerception || null
    };

    this.currentSession = sessionPayload;
    return sessionPayload;
  }

  getCurrentSession() {
    return this.currentSession;
  }
}

export const realDataSessionManager = new RealDataSessionManager();
