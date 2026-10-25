// First-run tutorial walkthrough on a fresh save. node scripts/tutshot.mjs <outprefix>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:5173/');
await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600);
await p.locator('.modal .btn').first().tap();
await p.tap('.battle-row .go'); await p.waitForTimeout(1500);
await p.screenshot({ path: out + '-1-move.png' });
const t1 = await p.evaluate(() => window.__ds.app.game.time);
const cdp = await ctx.newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
await touch('touchStart', 195, 600);
for (let i = 0; i < 30; i++) { await touch('touchMove', 195 + Math.cos(i / 5) * 50, 600 + Math.sin(i / 5) * 50); await p.waitForTimeout(60); }
await p.waitForTimeout(400);
await p.screenshot({ path: out + '-2-auto.png' });
// let the bot steer for a while (real time), answering level-ups like a player
const steer = async (ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const modal = await p.evaluate(() => !!document.querySelector('.modal'));
    if (modal) { await p.waitForTimeout(400); await p.screenshot({ path: out + '-modal.png' }); await p.evaluate(() => { const c = document.querySelector('.modal .cards .card'); if (c) c.click(); else document.querySelector('.modal .btn.primary, .modal .btn.cyan')?.click(); }); continue; }
    const [mx, my] = await p.evaluate(() => window.__ds.botIntent(window.__ds.app.game));
    await touch('touchMove', 195 + mx * 48, 600 + my * 48);
    await p.waitForTimeout(150);
  }
};
await steer(6000); await p.screenshot({ path: out + '-3.png' });
await steer(8000); await p.screenshot({ path: out + '-4.png' });
await p.evaluate(() => { const g = window.__ds.app.game; g.spawnEnemy('brute', true); });
await steer(1500); await p.screenshot({ path: out + '-5-elite.png' });
console.log('time frozen before moving:', t1 === 0, '| errors:', errs.join('\n') || 'none');
await b.close();
