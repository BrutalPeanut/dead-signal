// Blood decals after a burst of kills + the top-bar gear. node scripts/bloodshot.mjs <outprefix>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:5173/?profile=bloodtest');
await p.evaluate(() => { localStorage.removeItem('deadsignal.save.v1:bloodtest'); });
await p.reload(); await p.waitForTimeout(600);
await p.locator('.modal .btn').first().tap().catch(() => {});
await p.waitForTimeout(300);
await p.screenshot({ path: out + '-top.png', clip: { x: 0, y: 0, width: 390, height: 90 } });
await p.evaluate(() => { const a = window.__ds.app; a.profile.data.unlocked = 3; a.profile.data.stars = { 0: 7 }; a.hub.sector = 2; a.hub.refresh(); });
await p.tap('.battle-row .go'); await p.waitForTimeout(500);
await p.evaluate(() => { const g = window.__ds.app.game; g.hp = g.maxHp = 1e7; window.__ds.advance(25); });
await p.waitForTimeout(400);
for (let i = 0; i < 3 && (await p.locator('.modal .card').count()); i++) { await p.locator('.modal .card').first().click(); await p.waitForTimeout(250); }
await p.waitForTimeout(1500);
await p.screenshot({ path: out + '-game.png' });
console.log(errs.join('\n') || 'no page errors');
await b.close();
