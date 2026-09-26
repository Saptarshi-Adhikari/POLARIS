/**
 * POLARIS Real Data Freshness & Staleness Classifier
 * Evaluates provider ages against configurable thresholds.
 * Classifies data status: LIVE, FRESH, AGING, STALE, EXPIRED, UNAVAILABLE.
 */

export const FRESHNESS_STATES = {
  LIVE: 'LIVE',
  FRESH: 'FRESH',
  AGING: 'AGING',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED',
  UNAVAILABLE: 'UNAVAILABLE'
};

export class RealDataStatus {
  static evaluateFreshness(sourceTimestamp, maxFreshMs = 3600000 * 24 * 7, maxAgingMs = 3600000 * 24 * 30) {
    if (!sourceTimestamp) return FRESHNESS_STATES.UNAVAILABLE;

    const ts = typeof sourceTimestamp === 'number' ? sourceTimestamp : Date.parse(sourceTimestamp);
    if (isNaN(ts)) return FRESHNESS_STATES.UNAVAILABLE;

    const ageMs = Date.now() - ts;
    if (ageMs < 0) return FRESHNESS_STATES.LIVE; // Future/live forecast timestamp
    if (ageMs <= 60000 * 15) return FRESHNESS_STATES.LIVE; // Under 15 mins
    if (ageMs <= maxFreshMs) return FRESHNESS_STATES.FRESH;
    if (ageMs <= maxAgingMs) return FRESHNESS_STATES.AGING;
    if (ageMs <= maxAgingMs * 3) return FRESHNESS_STATES.STALE;
    return FRESHNESS_STATES.EXPIRED;
  }
}
