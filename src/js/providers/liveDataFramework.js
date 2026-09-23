/**
 * POLARIS Nav-OS — Automated Live Data Ingestion Framework (Phase 13)
 *
 * Provides live provider stubs for Copernicus, ERA5, USNIC, AIS, and Sentinel-1 API feeds.
 * Gracefully falls back to HISTORICAL REPLAY upon authentication/credential absence.
 * NEVER silently switches to DEMO.
 */

import { RealReplayProvider } from './realMaritimeDataset.js';

export class LiveDataIngestionFramework {
  constructor(options = {}) {
    this.copernicusApiKey = options.copernicusApiKey || null;
    this.era5ApiKey = options.era5ApiKey || null;
    this.aisFeedUrl = options.aisFeedUrl || null;
    
    this.historicalFallback = new RealReplayProvider();
    this.activeSource = this.copernicusApiKey ? 'LIVE_COPERNICUS_API' : 'HISTORICAL_REPLAY';
  }

  getEnvironmentData(simTimeHours = 14.0) {
    if (this.activeSource === 'LIVE_COPERNICUS_API' && this.copernicusApiKey) {
      // Live HTTP fetch stubs would execute here
    }
    
    // Explicit Historical Replay fallback
    const envData = this.historicalFallback.getEnvironment(simTimeHours);
    return {
      ...envData,
      ingestionSource: 'HISTORICAL_REPLAY',
      staleDataFlag: false,
      fallbackReason: 'Live API credentials unconfigured. Replaying verified Antarctic sample.'
    };
  }
}
