import { chromium } from 'playwright';
import fs from 'node:fs';
const S = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:5173/');
const s = JSON.parse(fs.readFileSync(S + '/save-s9.json', 'utf8'));
s.seenIntro = true; s.lastDaily = new Date().toDateString(); s.unlocked = 13;
await p.evaluate((j) => localStorage.setItem('deadsignal.save.v1', j), JSON.stringify(s));
await p.reload(); await p.waitForTimeout(1000);
await p.evaluate(() => { const a = window.__ds.app; a.hub.sector = 13; a.hub.refresh(); });
await p.waitForTimeout(500);
await p.screenshot({ path: S + '/bc-lobby.png' });
await p.locator('.battle-row .go').click(); await p.waitForTimeout(800);
for (let i = 0; i < 6 && (await p.locator('.modal .card').count()); i++) { await p.locator('.modal .card').first().click(); await p.waitForTimeout(300); }
await p.evaluate(() => { const g = window.__ds.app.game; g.hp = g.maxHp = 1e7; g.spawnBoss('broadcaster', false); });
for (const [i, w] of [[0, 1500], [1, 1800], [2, 1600], [3, 1700]]) { await p.waitForTimeout(w); await p.screenshot({ path: `${S}/bc-fight${i}.png` }); }
console.log(errs.join('\n') || 'ok');
await b.close();
