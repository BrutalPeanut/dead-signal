// 3D renderer playtest: hub, a sector run fast-forwarded through the mid-boss, the final boss,
// then a pass over every biome. Screenshots land in outDir; console/page errors are printed.
// node scripts/shot3d.mjs [url] [outDir] [w] [h]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [url = 'http://localhost:5173/', out = 'screens3d', w = '390', h = '844'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(m.text());
});
await page.goto(url + '?fresh&r=3d');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/hub.png` });
const has3d = await page.evaluate(() => !!document.getElementById('game3d'));
console.log('3D canvas present:', has3d);
await page.click('.modal .btn').catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/hub-attract.png` });
// start a mid-campaign sector directly so every system shows up
const sector = +(process.env.SECTOR ?? 4);
await page.evaluate((s) => window.__ds.app.startRun(s, 'campaign'), sector);
// a fresh save can't survive Sector 5: make the courier unkillable so the whole run gets covered
const god = () => page.evaluate(() => { const g = window.__ds.app.game; g.maxHp = g.hp = 1e7; });
await god();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/run-00.png` });
const shots = [[30, 'run-30s'], [60, 'run-90s'], [60, 'run-150s'], [12, 'run-midboss'], [60, 'run-220s'], [80, 'run-final']];
for (const [adv, name] of shots) {
  for (let k = 0; k < adv; k += 4) {
    await god();
    await page.evaluate((s) => window.__ds.advance(s), Math.min(4, adv - k));
  }
  await page.evaluate(() => { const g = window.__ds.app.game; g.hp = g.maxHp * 0.7; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
  const info = await page.evaluate(() => {
    const g = window.__ds.app.game;
    return { t: g.time | 0, st: g.state, L: g.level, e: g.enemies.length, hp: g.hp | 0, w: g.weapons.map((x) => x.id + x.level + (x.evolved ? '*' : '')).join(','), boss: g.boss?.boss ?? null };
  });
  console.log(name, JSON.stringify(info));
}
for (const s of [0, 2, 4, 10]) {
  await page.evaluate((sec) => window.__ds.app.startRun(sec, 'campaign'), s);
  // advance() jumps the sim without rendering; let the camera catch up afterwards
  for (let k = 0; k < 40; k += 4) {
    await god();
    await page.evaluate(() => window.__ds.advance(4));
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/biome-${s}.png` });
}
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 20).join('\n'));
else console.log('no errors');
await browser.close();
