// Bot check of the motivation UI: HUD at a star milestone, results for a near-miss loss and a win.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(400);
await page.click('.modal .btn');
await page.screenshot({ path: 'screens/mot-lobby.png' });
await page.click('.battle-row .go');
await page.waitForTimeout(300);
// play to just before the first star, then let the real loop cross 5:00
await page.evaluate(() => { window.__ds.advance(297); window.__ds.app.game.base.hp = 1e6; window.__ds.app.game.hp = 1e6; window.__ds.app.game.maxHp = 1e6; });
await page.waitForTimeout(100);
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => { const g = window.__ds.app.game; if (g.state === 'levelup') g.choose(0); if (g.state === 'chest') g.closeChest(); return g.time; });
  if (st > 301.2) break;
  await page.waitForTimeout(200);
}
await page.screenshot({ path: 'screens/mot-hud.png' });
// near-miss loss at ~4:12 on a fresh run
await page.evaluate(() => { const a = window.__ds.app; a.closeModal?.(); });
await page.evaluate(() => { const a = window.__ds.app; a.game.state = 'play'; a.game.time = 252; a.game.hp = -1; a.game.revives = 0; a.game.base.revives = 0; });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screens/mot-loss.png' });
await page.evaluate(() => document.querySelector('.modal .btn.primary')?.click());
await page.waitForTimeout(500);
await page.click('.battle-row .go');
await page.waitForTimeout(300);
await page.evaluate(() => { const g = window.__ds.app.game; g.base.hp = 1e6; g.hp = 1e6; g.maxHp = 1e6; g.base.atk = 400; window.__ds.advance(640); });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screens/mot-win.png' });
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'clean');
await browser.close();
