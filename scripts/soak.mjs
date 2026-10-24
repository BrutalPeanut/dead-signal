// Soak test: leave the hub attract mode + home scene running, then a real run with the bot, and catch any page errors.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(500);
await page.click('.modal .btn');
for (let i = 0; i < 10; i++) {
  await page.evaluate((i) => { const a = window.__ds.app; a.profile.data.unlocked = 9; a.hub.sector = i; a.hub.refresh(); }, i);
  await page.waitForTimeout(1500);
}
await page.click('.deploy .btn');
for (let i = 0; i < 12; i++) { await page.evaluate(() => window.__ds.advance(50)); await page.waitForTimeout(300); }
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'soak clean');
await browser.close();
