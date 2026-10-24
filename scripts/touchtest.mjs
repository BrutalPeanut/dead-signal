// Bot test of mobile controls: real touch events (iPhone-like profile), drag to move.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(process.argv[2] ?? 'http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(500);
await page.tap('.modal .btn');
await page.tap('.battle-row .go');
await page.waitForTimeout(400);
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const pos = () => page.evaluate(() => ({ x: window.__ds.app.game.px, y: window.__ds.app.game.py, st: window.__ds.app.game.state }));
const results = [];
for (const [dx, dy, name] of [[70, 0, 'right'], [0, -70, 'up'], [-70, 0, 'left'], [0, 70, 'down']]) {
  const a = await pos();
  await touch('touchStart', 195, 600);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', 195 + (dx * i) / 6, 600 + (dy * i) / 6); await page.waitForTimeout(16); }
  await page.waitForTimeout(700);
  if (name === 'right') await page.screenshot({ path: 'screens/touch-drag.png' });
  await touch('touchEnd', 0, 0);
  const b = await pos();
  results.push(`${name}: dx=${(b.x - a.x).toFixed(0)} dy=${(b.y - a.y).toFixed(0)} state=${b.st}`);
  // dismiss any level-up that popped
  await page.evaluate(() => { const g = window.__ds.app.game; if (g.state === 'levelup') document.querySelector('.modal .card')?.click(); });
  await page.waitForTimeout(150);
}
// release check: no drift after lifting finger
const r0 = await pos(); await page.waitForTimeout(500); const r1 = await pos();
results.push(`after release drift=${Math.hypot(r1.x - r0.x, r1.y - r0.y).toFixed(1)}`);
// tapping the pause button must not start a joystick
await page.tap('.hud .pause');
await page.waitForTimeout(200);
results.push('pause modal open: ' + (await page.evaluate(() => !!document.querySelector('.modal h2')?.textContent.includes('PAUSED'))));
console.log(results.join('\n'));
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
