// Visual playtest: deploys, fast-forwards with the autopilot, and screenshots key moments.
// node scripts/playtest.mjs [url] [outDir] [w] [h]
import { chromium } from 'playwright';
const [url = 'http://localhost:5173/', out = 'screens', w = '390', h = '844'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(800);
await page.evaluate(() => { localStorage.clear(); });
await page.reload();
await page.waitForTimeout(800);
await page.click('.modal .btn');
await page.click('.battle-row .go');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/run-00.png` });
const shots = [[20, 'run-20s'], [70, 'run-90s'], [80, 'run-170s'], [125, 'run-boss'], [100, 'run-400s'], [130, 'run-final']];
for (const [adv, name] of shots) {
  await page.evaluate((s) => window.__ds.advance(s), adv);
  await page.waitForTimeout(700);
  // close any open run modal for a clean screenshot, but grab level-up once
  await page.screenshot({ path: `${out}/${name}.png` });
  const info = await page.evaluate(() => { const g = window.__ds.app.game; return { t: g.time|0, st: g.state, L: g.level, e: g.enemies.length, hp: g.hp|0, w: g.weapons.map(x=>x.id+x.level+(x.evolved?'*':'')).join(','), boss: !!g.boss }; });
  console.log(name, JSON.stringify(info));
}
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
