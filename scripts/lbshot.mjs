// Leaderboard UI with the Supabase RPCs mocked (the container can't reach Supabase).
import { chromium } from 'playwright';
import fs from 'node:fs';
const [save, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const rows = [
  { rnk: 1, name: 'Mom', score: 84210, run_time: 300, hero: 'medic', crew: 'SHACK7', me: false },
  { rnk: 2, name: 'BShack', score: 77830, run_time: 300, hero: 'rigger', crew: 'SHACK7', me: true },
  { rnk: 3, name: 'Nay', score: 41200, run_time: 212, hero: 'courier', crew: 'SHACK7', me: false },
  { rnk: 4, name: 'Dad', score: 19950, run_time: 140, hero: 'ranger', crew: 'SHACK7', me: false },
];
const posted = [];
await p.route('**/rest/v1/rpc/**', async (route) => {
  const url = route.request().url();
  if (url.endsWith('get_board')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  posted.push(JSON.parse(route.request().postData()));
  return route.fulfill({ status: 200, contentType: 'application/json', body: '2' });
});
await p.goto('http://localhost:5173/');
const s = JSON.parse(fs.readFileSync(save, 'utf8'));
s.seenIntro = true; s.lastDaily = new Date().toDateString(); s.unlocked = 9;
await p.evaluate((j) => localStorage.setItem('deadsignal.save.v1', j), JSON.stringify(s));
await p.reload(); await p.waitForTimeout(1000);
await p.locator('.mode-tabs .mt', { hasText: 'Daily' }).click(); await p.waitForTimeout(300);
await p.locator('.lb-btn').click(); await p.waitForTimeout(300);
await p.screenshot({ path: out + '-setup.png' });
await p.locator('.lb-in').first().fill('BShack');
await p.locator('.lb-in').nth(1).fill('shack7');
await p.locator('.sheet.lb .btn.primary').click(); await p.waitForTimeout(800);
await p.screenshot({ path: out + '-board.png' });
await p.locator('.modal').click({ position: { x: 5, y: 5 } }); await p.waitForTimeout(300);
await p.locator('.battle-row .go').click(); await p.waitForTimeout(800);
await p.evaluate(() => { const g = window.__ds.app.game; g.revives = 0; g.hp = -1; });
await p.waitForTimeout(2500);
await p.screenshot({ path: out + '-result.png' });
console.log('posted', JSON.stringify(posted));
console.log(errs.join('\n') || 'no page errors');
await b.close();
