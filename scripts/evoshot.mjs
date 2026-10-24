// Bot playtest of late-game visuals: all evolutions active. node scripts/evoshot.mjs <set: a|b> <out.png>
import { chromium } from 'playwright';
const [set = 'a', out = 'screens/evo.png'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(500);
await page.click('.modal .btn');
await page.click('.battle-row .go');
await page.waitForTimeout(300);
await page.evaluate((set) => {
  const g = window.__ds.app.game;
  g.base.hp = 1e6; g.maxHp = 1e6; g.hp = 1e6; g.base.atk = 400;
  const ids = set === 'a' ? ['pistol', 'blades', 'arc', 'frag', 'field', 'disc'] : ['napalm', 'drill', 'blades', 'field', 'frag', 'arc'];
  g.weapons.length = 0;
  ids.forEach((id) => { g.addWeapon(id); const w = g.weapons[g.weapons.length - 1]; w.level = 5; w.evolved = true; });
  window.__ds.advance(390);
}, set);
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
const info = await page.evaluate(() => { const g = window.__ds.app.game; return { t: g.time | 0, e: g.enemies.length, p: g.projectiles.length, pools: g.pools.length, k: g.kills }; });
console.log(JSON.stringify(info));
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
