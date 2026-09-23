/**
 * POLARIS Canonical Entrypoint Test
 */

import fs from 'fs';
import path from 'path';

describe('POLARIS Canonical Entrypoint & Service Worker Configuration', () => {
  let indexHtmlContent;

  beforeAll(() => {
    const indexPath = path.resolve(__dirname, '../index.html');
    indexHtmlContent = fs.readFileSync(indexPath, 'utf8');
  });

  test('index.html contains single canonical JS module entrypoint', () => {
    expect(indexHtmlContent).toContain('<script type="module" src="/src/js/main.js"></script>');
    const moduleScriptMatches = indexHtmlContent.match(/<script\s+type="module"\s+src="[^"]+"><\/script>/g);
    expect(moduleScriptMatches).toHaveLength(1);
  });

  test('index.html unregisters service worker in development mode (localhost / 127.0.0.1)', () => {
    expect(indexHtmlContent).toContain("window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'");
    expect(indexHtmlContent).toContain("registration.unregister()");
  });

  test('index.html does not contain legacy first-screen redirect or hardcoded legacy UI flags', () => {
    expect(indexHtmlContent).not.toContain('ASTRALIS CONTROL SIDEBAR');
    expect(indexHtmlContent).not.toContain('window.location.replace');
    expect(indexHtmlContent).not.toContain('window.location.href =');
  });
});
