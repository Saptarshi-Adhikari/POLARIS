/**
 * POLARIS Nav-OS — Unified Provider Health Model & Provenance Engine (Phase 1D)
 *
 * Implements strict, observable health tracking across all environmental data providers:
 * USNIC, BYU, Open-Meteo, Copernicus Marine, ERA5, GFS, AIS, SAR, and Bathymetry.
 *
 * Source Types: LIVE | CACHED | REPLAY | SYNTHETIC | UNKNOWN
 * Health States: HEALTHY | DEGRADED | STALE | OFFLINE | AUTH_REQUIRED | UNSUPPORTED
 */

export const PROVIDER_HEALTH_STATE = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  STALE: 'STALE',
  OFFLINE: 'OFFLINE',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  UNSUPPORTED: 'UNSUPPORTED'
});

export const ENVIRONMENTAL_SOURCE_TYPE = Object.freeze({
  LIVE: 'LIVE',
  CACHED: 'CACHED',
  REPLAY: 'REPLAY',
  SYNTHETIC: 'SYNTHETIC',
  UNKNOWN: 'UNKNOWN'
});

export class ProviderHealthTracker {
  constructor(providerId = 'GENERIC_PROVIDER', defaultSourceType = ENVIRONMENTAL_SOURCE_TYPE.SYNTHETIC) {
    this.providerId = providerId;
    this.state = PROVIDER_HEALTH_STATE.HEALTHY;
    this.sourceType = defaultSourceType;
    this.lastAttempt = null;
    this.lastSuccess = null;
    this.dataTimestamp = null;
    this.latencyMs = 0;
    this.errorCode = null;
    this.message = 'Initialized';
    this.history = [];
  }

  recordSuccess(dataTimestamp = Date.now(), latencyMs = 0, sourceType = ENVIRONMENTAL_SOURCE_TYPE.LIVE, message = 'Success') {
    const now = Date.now();
    this.lastAttempt = now;
    this.lastSuccess = now;
    this.dataTimestamp = dataTimestamp;
    this.latencyMs = latencyMs;
    this.sourceType = sourceType;
    this.state = PROVIDER_HEALTH_STATE.HEALTHY;
    this.errorCode = null;
    this.message = message;
    this._logHistory();
  }

  recordFailure(errorCode = 'NETWORK_ERROR', errorMessage = 'Request failed', sourceType = ENVIRONMENTAL_SOURCE_TYPE.CACHED) {
    const now = Date.now();
    this.lastAttempt = now;
    this.errorCode = errorCode;
    this.message = errorMessage;
    this.sourceType = sourceType;

    if (errorCode === 'AUTH_REQUIRED' || errorCode === '401' || errorCode === '403') {
      this.state = PROVIDER_HEALTH_STATE.AUTH_REQUIRED;
    } else if (this.lastSuccess && (now - this.lastSuccess < 3600000 * 24)) {
      this.state = PROVIDER_HEALTH_STATE.DEGRADED;
    } else {
      this.state = PROVIDER_HEALTH_STATE.OFFLINE;
    }
    this._logHistory();
  }

  getStatus() {
    const now = Date.now();
    const ageSeconds = this.dataTimestamp ? Math.floor((now - (typeof this.dataTimestamp === 'number' ? this.dataTimestamp : Date.parse(this.dataTimestamp))) / 1000) : null;
    return {
      providerId: this.providerId,
      state: this.state,
      sourceType: this.sourceType,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      dataTimestamp: this.dataTimestamp,
      ageSeconds,
      latencyMs: this.latencyMs,
      errorCode: this.errorCode,
      message: this.message
    };
  }

  _logHistory() {
    this.history.push({ ...this.getStatus(), timestamp: Date.now() });
    if (this.history.length > 50) this.history.shift();
  }
}
