// Lobby screenshots at several phone widths + desktop, with a mid-game save. node scripts/lobbyshot.mjs [tab]
import { chromium } from 'playwright';
const tab = process.argv[2] ?? 'deploy';
const sizes = [[360, 740], [390, 844], [430, 932], [1280, 800]];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const errs = [];
for (const [w, hgt] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errs.push(String(e.stack || e)));
  await page.goto('http://localhost:5173/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  await page.click('.modal .btn');
  await page.evaluate((tab) => {
    const p = window.__ds.app.profile;
    Object.assign(p.data, { unlocked: 3, stars: { 0: 7, 1: 7, 2: 3, 3: 1 }, starClaims: { 0: 7, 1: 3 }, best: { 0: 600, 1: 600, 2: 520, 3: 310 }, keys: 2, lastDaily: '', relayAt: Date.now() - 3 * 3.6e6, accountLevel: 5, accountXp: 300, gold: 4210, scrap: 86 });
    p.data.stats.runs = 6;
    p.missions().list[0].progress = p.missions().list[0].target;
    p.save();
    const hub = window.__ds.app.hub;
    hub.sector = 3;
    hub.tab = tab;
    hub.refresh();
  }, tab);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `screens/lobby-${tab}-${w}.png` });
  await page.close();
}
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'clean');
await browser.close();
