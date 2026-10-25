// Real-time human-style playtest in Chromium: touch-drag steering at ~5 decisions/s, tapping
// level-up cards and chests like a person. Logs frame times, modal interruptions and errors.
// node scripts/humanplay.mjs [sector] [outPrefix]
import { chromium } from 'playwright';
const sector = Number(process.argv[2] ?? 0);
const out = process.argv[3] ?? 'screens/human';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
if (process.env.SAVE) {
  // start from a realistic mid-campaign save produced by progression.ts SAVE_AT=n
  const json = (await import('node:fs')).readFileSync(process.env.SAVE, 'utf8');
  await page.evaluate((j) => localStorage.setItem('deadsignal.save.v1', j), json);
}
await page.reload();
await page.waitForTimeout(500);
await page.locator('.modal .btn').first().tap({ timeout: 3000 }).catch(() => {});
if (sector > 0) await page.evaluate((s) => { const a = window.__ds.app; a.profile.data.unlocked = s; a.profile.save(); a.hub.sector = s; a.hub.refresh(); }, sector);
if (process.env.MODE) { await page.locator('.mode-tabs .mt', { hasText: process.env.MODE }).click(); await page.waitForTimeout(300); }
await page.tap('.battle-row .go');
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
await page.evaluate(() => {
  window.__ft = [];
  let last = performance.now();
  const f = (n) => { window.__ft.push(n - last); last = n; requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
const OX = 195, OY = 640;
let down = false;
let modals = 0, modalTime = 0, lastShot = 0;
const t0 = Date.now();
while (Date.now() - t0 < 6.5 * 60 * 1000) {
  const st = await page.evaluate(() => {
    const g = window.__ds.app.game;
    const modal = !!document.querySelector('.modal');
    return { state: g.state, time: g.time, modal, mv: window.__botMove ? window.__botMove() : null, hp: g.hp / g.maxHp };
  });
  if (st.state === 'dead' || st.state === 'won') {
    if (!globalThis.__ended) { globalThis.__ended = true; console.log('RUN END', JSON.stringify(await page.evaluate(() => { const g = window.__ds.app.game; return { state: g.state, time: Math.round(g.time), level: g.level, kills: g.kills, killedBy: g.lastHurt }; }))); }
  }
  if (st.modal) {
    if (down) { await touch('touchEnd', 0, 0); down = false; }
    const ms = Date.now();
    modals++;
    await page.waitForTimeout(650 + Math.random() * 500); // a person reads the cards
    const done = await page.evaluate(() => {
      const card = document.querySelector('.modal .cards .card');
      if (card && card.tagName === 'BUTTON') { card.click(); return 'card'; }
      const btn = document.querySelector('.modal .btn.primary, .modal .btn.cyan');
      if (btn) { btn.click(); return btn.textContent; }
      return '';
    });
    modalTime += Date.now() - ms;
    if (/Continue/i.test(done)) break;
    continue;
  }
  // steer like a thumb: decide every ~200ms using the autopilot's intent
  const [mx, my] = await page.evaluate(() => {
    const g = window.__ds.app.game;
    return window.__ds.botIntent ? window.__ds.botIntent(g) : [0, 0];
  });
  const tx = OX + mx * 48, ty = OY + my * 48;
  if (!down) { await touch('touchStart', OX, OY); down = true; }
  await touch('touchMove', tx, ty);
  if (st.time - lastShot >= 30) {
    lastShot = Math.floor(st.time / 30) * 30;
    await page.screenshot({ path: `${out}-${String(Math.round(st.time)).padStart(3, '0')}.png` });
  }
  await page.waitForTimeout(170 + Math.random() * 80);
}
if (down) await touch('touchEnd', 0, 0);
await page.screenshot({ path: `${out}-end.png` });
const r = await page.evaluate(() => {
  const ft = window.__ft.slice(60).sort((a, b) => a - b);
  const g = window.__ds.app.game;
  return { state: g.state, time: Math.round(g.time), kills: g.kills, level: g.level, median: ft[Math.floor(ft.length / 2)]?.toFixed(1), p95: ft[Math.floor(ft.length * 0.95)]?.toFixed(1), worst: ft.at(-1)?.toFixed(0), frames: ft.length };
});
console.log(JSON.stringify({ ...r, modals, modalSeconds: Math.round(modalTime / 1000), wallSeconds: Math.round((Date.now() - t0) / 1000) }));
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await browser.close();
