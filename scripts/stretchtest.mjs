// Regression: in-app browsers change the canvas's displayed size without a 'resize' event.
// The backing store must follow, or the world renders stretched. node scripts/stretchtest.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(600);
await p.locator('.modal .btn').first().tap().catch(() => {});
await p.tap('.battle-row .go');
await p.waitForTimeout(500);
const check = () => p.evaluate(() => {
  const c = document.getElementById('game');
  const r = c.getBoundingClientRect();
  return { css: [Math.round(r.width), Math.round(r.height)], px: [c.width, c.height], aspectErr: +Math.abs(c.width / c.height - r.width / r.height).toFixed(3) };
});
console.log('initial', JSON.stringify(await check()));
// simulate the Messenger toolbar collapsing: the fixed canvas grows taller, no resize event
await p.evaluate(() => { document.getElementById('game').style.height = '844px'; document.getElementById('game').style.bottom = 'auto'; });
await p.waitForTimeout(300);
const after = await check();
console.log('after toolbar change', JSON.stringify(after));
console.log(after.aspectErr < 0.01 ? 'PASS' : 'FAIL: canvas stretched');
await b.close();
