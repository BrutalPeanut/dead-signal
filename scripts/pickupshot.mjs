// Close-up of the three powerups at in-game scale for icon review.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(400);
await page.click('.modal .btn');
await page.click('.battle-row .go');
await page.waitForTimeout(300);
await page.evaluate(() => {
  const g = window.__ds.app.game;
  g.enemies.length = 0;
  g.addPickup('emp', g.px - 45, g.py - 60, 0);
  g.addPickup('ration', g.px, g.py - 60, 0);
  g.addPickup('magnet', g.px + 45, g.py - 60, 0);
  g.addPickup('emp', g.px, g.py + 70, 0);
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'screens/pickups.png', clip: { x: 95, y: 250, width: 200, height: 280 } });
console.log(errs.length ? errs.join('\n') : 'clean');
await browser.close();
