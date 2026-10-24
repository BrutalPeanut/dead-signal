// Bot perf test: worst-case density, measures frame times in a real browser. node scripts/perf.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: +(process.env.DPR ?? 2) });
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(500);
await page.click('.modal .btn');
await page.click('.battle-row .go');
const r = await page.evaluate(async () => {
  const g = window.__ds.app.game;
  g.base.hp = 1e9; g.maxHp = 1e9; g.hp = 1e9;
  g.weapons.length = 0;
  for (const id of ['pistol', 'blades', 'arc', 'frag', 'napalm', 'drill']) { g.addWeapon(id); const w = g.weapons.at(-1); w.level = 5; w.evolved = true; }
  window.__ds.advance(420);
  g.base.atk = 0.0001;
  // flood to the cap
  for (let i = 0; i < 400; i++) g.spawnEnemy(['shambler', 'runner', 'brute'][i % 3], false);
  const times = [];
  let last = performance.now();
  await new Promise((res) => {
    let n = 0;
    const tick = (now) => { times.push(now - last); last = now; if (++n < 240) requestAnimationFrame(tick); else res(); };
    requestAnimationFrame(tick);
  });
  // pure sim cost
  const t0 = performance.now();
  for (let i = 0; i < 120; i++) { g.step(0.3, 0.1); g.fx.length = 0; }
  const sim = (performance.now() - t0) / 120;
  times.sort((a, b) => a - b);
  return { enemies: g.enemies.length, proj: g.projectiles.length, median: times[120].toFixed(1), p95: times[228].toFixed(1), simMsPerStep: sim.toFixed(2) };
});
console.log(JSON.stringify(r));
await browser.close();
