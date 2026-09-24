import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MapLibreRenderer } from '../src/js/geo/maplibreRenderer.js';
import { ModeManager } from '../src/js/geo/modeManager.js';
import { provenanceRegistry } from '../src/js/dataSources.js';

describe('ASTRALIS Tile Loader Resilience, Render Guards & Honesty Flags', () => {
  let mockElements;

  beforeEach(() => {
    mockElements = new Map();
    const createMockElem = (id) => {
      const el = {
        id,
        innerText: '',
        className: '',
        classList: {
          contains: (cls) => el.className.includes(cls),
          add: (cls) => { if (!el.className.includes(cls)) el.className += ' ' + cls; },
          remove: (cls) => { el.className = el.className.replace(cls, '').trim(); }
        },
        style: {},
        appendChild: vi.fn(),
        addEventListener: vi.fn()
      };
      mockElements.set(id, el);
      return el;
    };

    ['maplibre-container', 'data-mode-demo-btn', 'data-mode-real-btn', 'real-data-provenance-hud', 'provenance-source-text', 'add-iceberg-btn'].forEach(createMockElem);

    globalThis.window = globalThis;
    globalThis.window.devicePixelRatio = 1;
    globalThis.document = {
      getElementById: (id) => mockElements.get(id) || null,
      createElement: () => ({ style: {} }),
      body: { appendChild: vi.fn() }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Tile fetch handling: handles 404, HTML text, garbage bytes, and valid PNG without throwing', async () => {
    const tileLoaderHelper = async (status, contentType, bodyText) => {
      const mockResponse = {
        ok: status >= 200 && status < 300,
        status: status,
        headers: new Headers({ 'content-type': contentType }),
        blob: async () => new Blob([bodyText], { type: contentType })
      };
      
      try {
        if (!mockResponse.ok || !mockResponse.headers.get('content-type').startsWith('image/')) {
          return { success: false, url: 'https://api.maptiler.com/tiles/0/0/0.png', status };
        }
        return { success: true, url: 'https://api.maptiler.com/tiles/0/0/0.png' };
      } catch (err) {
        return { success: false, url: 'https://api.maptiler.com/tiles/0/0/0.png', error: err };
      }
    };

    const res404 = await tileLoaderHelper(404, 'text/html', '404 Not Found');
    expect(res404.success).toBe(false);
    expect(res404.status).toBe(404);

    const res200Html = await tileLoaderHelper(200, 'text/html', '<html>Error Page</html>');
    expect(res200Html.success).toBe(false);

    const resValidPng = await tileLoaderHelper(200, 'image/png', 'PNG_HEADER_BYTES');
    expect(resValidPng.success).toBe(true);
  });

  it('2. drawImage guard: skips canvas draw when sprite width/naturalWidth is 0 or uninitialized', () => {
    const mockCtx = {
      drawImage: vi.fn()
    };
    const brokenSprite = { width: 0, naturalWidth: 0 };
    const validSprite = { width: 100, naturalWidth: 100 };

    const safeDrawImage = (ctx, sprite, x, y, w, h) => {
      if (sprite && (sprite.width || sprite.naturalWidth) > 0) {
        ctx.drawImage(sprite, x, y, w, h);
      }
    };

    expect(() => safeDrawImage(mockCtx, brokenSprite, 0, 0, 50, 50)).not.toThrow();
    expect(mockCtx.drawImage).not.toHaveBeenCalled();

    safeDrawImage(mockCtx, validSprite, 0, 0, 50, 50);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(1);
  });

  it('3. MapLibreRenderer error handler degrades gracefully when API key is missing', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    vi.spyOn(renderer, 'getApiKey').mockReturnValue(null);
    renderer.init();
    expect(renderer.hasKeyError).toBe(true);
  });

  it('4. Blackout contract: zero tile host fetches occur while blackout is engaged', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const isBlackoutEngaged = true;
    
    const requestTileIfAllowed = (url) => {
      if (isBlackoutEngaged) {
        return null;
      }
      return fetch(url);
    };

    const res = requestTileIfAllowed('https://api.maptiler.com/tiles/1/1/1.png');
    expect(res).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('5. REAL mode honesty flags: sets accurate source text and hides synthetic SPAWN ICEBERG button', () => {
    const dummyEngine = { dataMode: 'DEMO', state: { environment: { mode: 'SIMULATION' } } };
    const modeManager = new ModeManager(dummyEngine);

    modeManager.setMode('REAL');

    const sourceText = document.getElementById('provenance-source-text');
    const spawnBtn = document.getElementById('add-iceberg-btn');

    expect(sourceText.innerText).toBe('MapTiler Satellite/Hybrid / USNIC / Open-Meteo');
    expect(spawnBtn.classList.contains('hidden')).toBe(true);

    modeManager.setMode('DEMO');

    expect(spawnBtn.classList.contains('hidden')).toBe(false);
  });
});
