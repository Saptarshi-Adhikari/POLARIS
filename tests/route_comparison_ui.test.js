import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatRiskPercent,
  formatFuelRemaining,
  getRouteLetterForMode,
  buildRouteComparisonCardsData,
  renderRouteComparisonHTML
} from '../src/js/ui/routeComparisonUI.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('POLARIS Multi-Route Comparison UI & Helper Verification Suite', () => {

  it('1. Formats hours decimal into Xh Ym duration strings accurately', () => {
    expect(formatDuration(4.2)).toBe('4h 12m');
    expect(formatDuration(0.04)).toBe('2m');
    expect(formatDuration(1.5)).toBe('1h 30m');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(null)).toBe('—');
  });

  it('2. Formats risk score (0-1) into percentage strings accurately', () => {
    expect(formatRiskPercent(0.07)).toBe('7%');
    expect(formatRiskPercent(0.456)).toBe('46%');
    expect(formatRiskPercent(0.0)).toBe('0%');
    expect(formatRiskPercent(1.0)).toBe('100%');
    expect(formatRiskPercent(undefined)).toBe('0%');
  });

  it('3. Computes fuel remaining percentage honestly from ship fuel state and route consumption', () => {
    // Current fuel 100%, consumption 9.0 units -> 91% remaining
    expect(formatFuelRemaining(100, 9.0)).toBe('91% remaining');
    // Current fuel 78.4%, consumption 14.2 units -> 64% remaining
    expect(formatFuelRemaining(78.4, 14.2)).toBe('64% remaining');
    // Edge case: current fuel 10%, consumption 15 -> 0% remaining
    expect(formatFuelRemaining(10, 15)).toBe('0% remaining');
  });

  it('4. Maps 4 navigation modes to ROUTE A/B/C/D letters correctly', () => {
    expect(getRouteLetterForMode('FASTEST')).toBe('ROUTE A');
    expect(getRouteLetterForMode('BALANCED')).toBe('ROUTE B');
    expect(getRouteLetterForMode('SAFEST')).toBe('ROUTE C');
    expect(getRouteLetterForMode('FUEL_EFFICIENT')).toBe('ROUTE D');
  });

  it('5. Builds structured card data mapping all 4 modes with exactly 1 recommended card', () => {
    const mockComparisons = {
      fastest: { distance: 280.0, totalDistance: 2800, eta: 4.2, fuel: 12.0, maxRisk: 0.18 },
      balanced: { distance: 295.0, totalDistance: 2950, eta: 4.8, fuel: 9.0, maxRisk: 0.07 },
      safest: { distance: 320.0, totalDistance: 3200, eta: 5.5, fuel: 11.5, maxRisk: 0.02 },
      fuelEfficient: { distance: 300.0, totalDistance: 3000, eta: 5.2, fuel: 6.5, maxRisk: 0.05 }
    };

    const cards = buildRouteComparisonCardsData(mockComparisons, 'BALANCED', 100);

    expect(cards.length).toBe(4);

    // Verify ROUTE A (FASTEST)
    expect(cards[0].letter).toBe('ROUTE A');
    expect(cards[0].distanceStr).toBe('280.0 km');
    expect(cards[0].timeStr).toBe('4h 12m');
    expect(cards[0].riskStr).toBe('18%');
    expect(cards[0].isRecommended).toBe(false);

    // Verify ROUTE B (BALANCED - RECOMMENDED)
    expect(cards[1].letter).toBe('ROUTE B');
    expect(cards[1].distanceStr).toBe('295.0 km');
    expect(cards[1].timeStr).toBe('4h 48m');
    expect(cards[1].fuelStr).toBe('91% remaining');
    expect(cards[1].riskStr).toBe('7%');
    expect(cards[1].isRecommended).toBe(true);

    // Verify exactly ONE card is recommended
    const recommendedCards = cards.filter(c => c.isRecommended);
    expect(recommendedCards.length).toBe(1);
    expect(recommendedCards[0].letter).toBe('ROUTE B');
  });

  it('6. Integration: computeRouteStrategy() outputs feed directly into HTML render function', () => {
    const nav = new AINavigator(3600, 2400);
    const ship = new Ship({ x: 400, y: 1800, heading: 0, speed: 20 });
    const dest = { x: 3200, y: 400 };
    const state = { vessel: { maxSpeed: 30 }, simulation: { simTimeHours: 0 } };

    const rec = nav.generateAIRecommendation(ship, dest, [], { getVelocityAt: () => ({ u: 0, v: 0 }) }, state);

    expect(nav.routeComparisons).not.toBeNull();
    expect(rec).not.toBeNull();

    const html = renderRouteComparisonHTML(nav.routeComparisons, rec, ship.fuel);

    expect(html).toContain('AI Recommendation:');
    expect(html).toContain('ROUTE A — FASTEST');
    expect(html).toContain('ROUTE B — BALANCED');
    expect(html).toContain('ROUTE C — SAFEST');
    expect(html).toContain('ROUTE D — FUEL EFFICIENT');
    expect(html).toContain('RECOMMENDED');
    expect(html).toContain('Rule-Based Weighted Scoring');
  });
});
