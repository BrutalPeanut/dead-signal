// Screenshots every screen. node scripts/uitour.mjs [url] [outDir]
import { chromium } from 'playwright';
const [url = 'http://localhost:5173/', out = 'screens'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(600);
await page.click('.modal .btn');
await page.click('.battle-row .go');
// let it run in real time until the first level-up modal shows
await page.waitForTimeout(3000);
await page.evaluate(() => window.__ds.app.game.gainXp(12));
await page.waitForSelector('.modal .cards', { timeout: 5000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/ui-levelup.png` });
// jump to an evolution-ready chest
await page.evaluate(() => {
  const g = window.__ds.app.game;
  g.choose(0);
  g.weapons[0].level = 5;
  g.passives.push({ id: 'chip', level: 1 });
  g.recalc();
  g.addPickup('chest', g.px, g.py, 0).big = true;
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/ui-chest.png` });
await page.evaluate(() => document.querySelector('.modal .btn.primary')?.click());
await page.waitForTimeout(300);
await page.click('.hud .pause');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-pause.png` });
// retreat -> results
await page.evaluate(() => [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.includes('Retreat')).click());
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/ui-results.png` });
await page.click('.modal .btn.primary');
await page.waitForTimeout(400);
// give the profile some loot for the armory shot
await page.evaluate(() => {
  const p = window.__ds.app.profile;
  p.data.gold = 5000; p.data.scrap = 200; p.data.keys = 5;
  for (let i = 0; i < 9; i++) p.data.gear.push(p.rollItem({ next: Math.random, weighted: (w) => { let t = w.reduce((a, b) => a + b, 0) * Math.random(); for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0) return i; } return 0; }, pick: (a) => a[Math.floor(Math.random() * a.length)] }, 3, true));
  p.data.gear.push({ uid: 'x1', def: 'kevlar', rarity: 0, level: 1 }, { uid: 'x2', def: 'kevlar', rarity: 0, level: 1 });
  p.save();
});
await page.click('.nav button:nth-child(1)');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/ui-armory.png` });
await page.click('.slot');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-item.png` });
await page.evaluate(() => window.__ds.app.hub.closeModal());
await page.click('.nav button:nth-child(3)');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-talents.png` });
await page.click('.nav button:nth-child(4)');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-supply.png` });
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
