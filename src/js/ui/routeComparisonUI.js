/**
 * POLARIS — Multi-Route Comparison UI Module
 * Formats and renders 4 route candidate cards (ROUTE A/B/C/D) alongside AI Recommendation callout.
 */

export const ROUTE_CARD_DEFINITIONS = [
  { key: 'FASTEST',       letter: 'ROUTE A', modeName: 'FASTEST',        label: 'ROUTE A — FASTEST',        colorClass: 'sky-400',     borderClass: 'border-sky-500/40' },
  { key: 'BALANCED',      letter: 'ROUTE B', modeName: 'BALANCED',       label: 'ROUTE B — BALANCED',       colorClass: 'secondary',   borderClass: 'border-secondary/40' },
  { key: 'SAFEST',        letter: 'ROUTE C', modeName: 'SAFEST',         label: 'ROUTE C — SAFEST',         colorClass: 'emerald-400', borderClass: 'border-emerald-500/40' },
  { key: 'FUEL_EFFICIENT',letter: 'ROUTE D', modeName: 'FUEL EFFICIENT', label: 'ROUTE D — FUEL EFFICIENT', colorClass: 'amber-400',   borderClass: 'border-amber-500/40' }
];

/**
 * Formats a decimal hours duration into a human-readable 'Xh Ym' string.
 * @param {number} hoursDecimal
 * @returns {string} e.g. "4h 12m" or "0h 02m"
 */
export function formatDuration(hoursDecimal) {
  if (!Number.isFinite(hoursDecimal) || hoursDecimal < 0) return '—';
  const totalMinutes = Math.round(hoursDecimal * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
}

/**
 * Formats a 0-1 risk score into a percentage string.
 * @param {number} riskScore
 * @returns {string} e.g. "7%"
 */
export function formatRiskPercent(riskScore) {
  if (!Number.isFinite(riskScore)) return '0%';
  const pct = Math.round(Math.min(1.0, Math.max(0.0, riskScore)) * 100);
  return `${pct}%`;
}

/**
 * Computes remaining tank percentage honestly from current ship fuel level and estimated route fuel consumption.
 * @param {number} currentFuelLevel 0-100 percentage
 * @param {number} estimatedConsumption fuel units or consumption rate
 * @returns {string} e.g. "91% remaining"
 */
export function formatFuelRemaining(currentFuelLevel = 100, estimatedConsumption = 0) {
  const current = Number.isFinite(currentFuelLevel) ? currentFuelLevel : 100;
  const cons = Number.isFinite(estimatedConsumption) ? estimatedConsumption : 0;
  const consPercent = cons > 50 ? (cons / 500) * 100 : cons;
  const remaining = Math.max(0, Math.min(100, Math.round(current - consPercent)));
  return `${remaining}% remaining`;
}

/**
 * Maps recommended mode string ('BALANCED', etc.) to corresponding route letter label ('ROUTE B').
 * @param {string} modeKey
 * @returns {string} e.g. "ROUTE B"
 */
export function getRouteLetterForMode(modeKey) {
  const def = ROUTE_CARD_DEFINITIONS.find(d => d.key === modeKey);
  return def ? def.letter : 'ROUTE B';
}

/**
 * Generates structured card data for all 4 routes.
 * @param {Object} routeComparisons { shortest/fastest, balanced, safest, fuelEfficient }
 * @param {string} recommendedMode
 * @param {number} currentFuelLevel
 */
export function buildRouteComparisonCardsData(routeComparisons, recommendedMode = 'BALANCED', currentFuelLevel = 100) {
  if (!routeComparisons) return [];

  const candidateMap = {
    FASTEST: routeComparisons.shortest || routeComparisons.fastest || routeComparisons.FASTEST,
    BALANCED: routeComparisons.balanced || routeComparisons.BALANCED,
    SAFEST: routeComparisons.safest || routeComparisons.SAFEST,
    FUEL_EFFICIENT: routeComparisons.fuelEfficient || routeComparisons.FUEL_EFFICIENT
  };

  return ROUTE_CARD_DEFINITIONS.map(def => {
    const raw = candidateMap[def.key];
    const isRecommended = def.key === recommendedMode;

    if (!raw) {
      return {
        ...def,
        isRecommended,
        distanceStr: '—',
        timeStr: '—',
        fuelStr: '—',
        riskStr: '—',
        raw: null
      };
    }

    const distKm = raw.distance !== undefined ? raw.distance : (raw.totalDistance ? raw.totalDistance / 10 : 0);
    const etaHrs = raw.eta !== undefined ? raw.eta : (raw.estimatedDuration !== undefined ? raw.estimatedDuration : 0);
    const fuelCons = raw.fuel !== undefined ? raw.fuel : (raw.estimatedFuelConsumption !== undefined ? raw.estimatedFuelConsumption : 0);
    const riskScore = raw.maxRisk !== undefined ? raw.maxRisk : (raw.riskScore !== undefined ? raw.riskScore : (raw.icebergRisk || 0));

    return {
      ...def,
      isRecommended,
      distanceStr: `${distKm.toFixed(1)} km`,
      timeStr: formatDuration(etaHrs),
      fuelStr: formatFuelRemaining(currentFuelLevel, fuelCons),
      riskStr: formatRiskPercent(riskScore),
      raw
    };
  });
}

/**
 * Renders complete HTML markup for the 4 route cards and AI Recommendation callout.
 */
export function renderRouteComparisonHTML(routeComparisons, aiRecommendation, currentFuelLevel = 100) {
  if (!routeComparisons) {
    return '<div class="text-on-surface-variant text-[11px] p-2 text-center">Awaiting route strategy comparison...</div>';
  }

  const recMode = aiRecommendation?.recommendedMode || 'BALANCED';
  const explanation = aiRecommendation?.explanation || 'Multi-factor strategy evaluation active.';
  const cards = buildRouteComparisonCardsData(routeComparisons, recMode, currentFuelLevel);
  const recLetter = getRouteLetterForMode(recMode);

  const cardsHTML = cards.map(card => {
    const isRec = card.isRecommended;
    const borderCls = isRec
      ? 'border-2 border-secondary bg-secondary/10 shadow-lg shadow-secondary/10'
      : `border ${card.borderClass} bg-surface-container/50 hover:bg-surface-container/80`;
    
    const badge = isRec
      ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-surface font-extrabold uppercase tracking-wider flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">check_circle</span> RECOMMENDED</span>'
      : '';

    return `
      <div class="${borderCls} rounded-lg p-2.5 transition-all select-none">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-${card.colorClass} font-mono font-bold text-[11px] tracking-wider">${card.label}</span>
          ${badge}
        </div>
        <div class="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-on-surface-variant">
          <div class="bg-surface/40 p-1 rounded">
            <span class="text-on-surface-variant/70 text-[9px] block">DIST</span>
            <span class="text-on-surface font-bold">${card.distanceStr}</span>
          </div>
          <div class="bg-surface/40 p-1 rounded">
            <span class="text-on-surface-variant/70 text-[9px] block">TIME</span>
            <span class="text-on-surface font-bold">${card.timeStr}</span>
          </div>
          <div class="bg-surface/40 p-1 rounded">
            <span class="text-on-surface-variant/70 text-[9px] block">FUEL</span>
            <span class="text-on-surface font-bold">${card.fuelStr}</span>
          </div>
          <div class="bg-surface/40 p-1 rounded">
            <span class="text-on-surface-variant/70 text-[9px] block">RISK</span>
            <span class="text-on-surface font-bold ${card.raw?.maxRisk > 0.3 ? 'text-amber-400' : 'text-emerald-400'}">${card.riskStr}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="space-y-3 font-mono">
      <!-- AI Recommendation Callout -->
      <div class="bg-surface-container-high/90 rounded-lg p-3 border-l-4 border-secondary shadow-md">
        <div class="flex items-center justify-between text-xs font-bold text-secondary mb-1" title="Methodology: Rule-Based Weighted Scoring">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-sm">psychology</span>
            <span>AI Recommendation: ${recLetter} (${recMode})</span>
          </div>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-secondary/20 text-secondary font-bold">Rule-Based Weighted Scoring</span>
        </div>
        <p class="text-[10px] text-on-surface/90 leading-relaxed font-normal">${explanation}</p>
      </div>

      <!-- 4 Route Option Cards Grid -->
      <div class="grid grid-cols-1 gap-2">
        ${cardsHTML}
      </div>
    </div>
  `;
}
