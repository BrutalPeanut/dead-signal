// Lobby in each mode + a quick daily run to the results screen. node scripts/modeshot.mjs <save.json> <outprefix> [w] [h]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [save, out, W = 390, H = 844] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:5173/');
const s = JSON.parse(fs.readFileSync(save, 'utf8'));
s.seenIntro = true; s.lastDaily = new Date().toDateString();
await p.evaluate((j) => localStorage.setItem('deadsignal.save.v1', j), JSON.stringify(s));
await p.reload(); await p.waitForTimeout(1200);
for (const [i, m] of ['Campaign', 'Daily', 'Endless'].entries()) {
  await p.locator('.mode-tabs .mt', { hasText: m }).click(); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}-${m.toLowerCase()}.png` });
}
await p.locator('.mode-tabs .mt', { hasText: 'Daily' }).click(); await p.waitForTimeout(300);
await p.locator('.battle-row .go').click(); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}-daily-run.png` });
await p.evaluate(() => { const g = window.__ds.app.game; g.revives = 0; g.hp = -1; });
await p.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { const btn = p.locator('.modal .btn', { hasText: /give up|no thanks|skip/i }); if (await btn.count()) { await btn.first().click(); await p.waitForTimeout(1200); } }
await p.screenshot({ path: `${out}-daily-result.png` });
console.log(errs.length ? errs.join('\n') : 'no page errors');
await b.close();
