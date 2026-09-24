import { chromium } from 'playwright';

async function diagnoseError() {
  console.log('[Playwright Error Diagnosis] Launching headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  const exceptions = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Console Error] ${msg.text()}`);
      errors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error(`[Page Error Stack trace]:\n${err.stack}`);
    exceptions.push({ message: err.message, stack: err.stack });
  });

  console.log('[Playwright Error Diagnosis] Navigating to http://localhost:4173...');
  await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  console.log('[Playwright Error Diagnosis] Clicking DATA: REAL button...');
  await page.click('#data-mode-real-btn');
  await page.waitForTimeout(2000);

  console.log('\n========================================');
  console.log(`TOTAL CONSOLE ERRORS: ${errors.length}`);
  console.log(`TOTAL UNCAUGHT EXCEPTIONS: ${exceptions.length}`);
  console.log('========================================\n');

  for (let i = 0; i < exceptions.length; i++) {
    console.log(`EXCEPTION #${i + 1}: ${exceptions[i].message}`);
    console.log(`STACK:\n${exceptions[i].stack}\n`);
  }

  await browser.close();
}

diagnoseError().catch(err => {
  console.error('[Diagnosis script failed]', err);
  process.exit(1);
});
