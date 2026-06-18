const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  page.on('requestfailed', request => {
    if (request.url().includes('m3u8') || request.url().includes('stream')) {
      console.log(`[REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
    }
  });

  console.log('Navigating to anime watch page...');
  try {
    await page.goto('https://www.naijaspride.com/anime/195600/watch/12', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('On watch page. Waiting for video...');
    await page.waitForTimeout(15000);
  } catch (e) {
    console.log('[SCRIPT ERROR]', e.message);
  } finally {
    await browser.close();
  }
})();
