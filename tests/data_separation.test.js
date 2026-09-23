import { describe, test, expect, vi } from 'vitest';
import { ModeManager } from '../src/js/geo/modeManager.js';
import { DemoDataProvider } from '../src/js/data/DemoDataProvider.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';

describe('POLARIS Strict Data & Pipeline Separation Verification', () => {
  test('DEMO mode executes zero network fetch calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const mockEngine = { state: { environment: { mode: 'SIMULATION', seaIce: { averageConcentration: 0.2 }, wind: { speed: 40, direction: 200 } } }, icebergs: [] };
    const demoProvider = new DemoDataProvider(mockEngine);

    demoProvider.getSeaIce();
    demoProvider.getCurrents();
    demoProvider.getIcebergs();
    await demoProvider.getMeteo(-69.4, 76.18);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('RealDataProvider with failing fetch falls back to CACHED badge status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network Error / CORS'));
    const mockEngine = { state: { environment: { mode: 'REAL' } } };
    const realProvider = new RealDataProvider(mockEngine);

    const meteoRes = await realProvider.getMeteo(-69.4, 76.18);
    const icebergsRes = realProvider.getIcebergs();

    expect(meteoRes.provenance.status).toBe('CACHED');
    expect(icebergsRes.provenance.status).toBe('CACHED');
    expect(icebergsRes.provenance.status).not.toBe('LIVE');

    fetchSpy.mockRestore();
  });

  test('Rapid DEMO <-> REAL mode toggling disposes providers cleanly without lingering state', () => {
    const mockEngine = { state: { environment: { mode: 'SIMULATION' } } };
    const manager = new ModeManager(mockEngine);

    expect(manager.currentMode).toBe('DEMO');
    expect(manager.activeProvider).toBeInstanceOf(DemoDataProvider);

    manager.setMode('REAL');
    expect(manager.currentMode).toBe('REAL');
    expect(manager.activeProvider).toBeInstanceOf(RealDataProvider);

    manager.setMode('DEMO');
    expect(manager.currentMode).toBe('DEMO');
    expect(manager.activeProvider).toBeInstanceOf(DemoDataProvider);
  });

  test('REAL-mode sea-ice carries synthetic metadata end-to-end and badges SIM', () => {
    const mockEngine = { state: { environment: { mode: 'REAL' } } };
    const realProvider = new RealDataProvider(mockEngine);

    const seaIce = realProvider.getSeaIce();
    expect(seaIce.synthetic).toBe(true);
    expect(seaIce.provenance.status).toBe('SIM');
  });
});
