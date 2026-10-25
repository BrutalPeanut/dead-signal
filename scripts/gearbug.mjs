// Repro for "gear upgrade screen freezes / refreshes weird". node scripts/gearbug.mjs <save.json>
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:5173/?profile=gearbug');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
s.seenIntro = true; s.lastDaily = new Date().toDateString(); s.gold = 99999; s.scrap = 9999;
await p.evaluate((j) => localStorage.setItem('deadsignal.save.v1:gearbug', j), JSON.stringify(s));
await p.reload(); await p.waitForTimeout(1000);
await p.locator('.nav button', { hasText: 'Armory' }).click(); await p.waitForTimeout(400);
await p.evaluate(() => { document.querySelector('.hub-body').scrollTop = 600; });
await p.waitForTimeout(200);
const before = await p.evaluate(() => document.querySelector('.hub-body').scrollTop);
await p.locator('.inv .item').nth(14).click(); await p.waitForTimeout(300);
await p.evaluate(() => { window.__m0 = document.querySelector('.modal'); });
const lvBefore = await p.evaluate(() => document.querySelector('.sheet .kv b')?.textContent);
console.log('level before', lvBefore);
const times = [];
for (let i = 0; i < 6; i++) {
  const t0 = Date.now();
  await p.locator('.sheet .btn.primary').first().click();
  await p.waitForTimeout(50);
  times.push(Date.now() - t0);
}
const st = await p.evaluate(() => ({ sameModal: document.querySelector('.modal') === window.__m0, scroll: document.querySelector('.hub-body').scrollTop, modals: document.querySelectorAll('.modal').length, sheetLv: document.querySelector('.sheet .kv b')?.textContent }));
// measure main-thread cost of one profile save -> hub refresh
const refreshMs = await p.evaluate(() => { const a = window.__ds.app; const t = performance.now(); a.profile.save(); return performance.now() - t; });
console.log(JSON.stringify({ scrollBefore: before, ...st, clickMs: times, refreshMs: Math.round(refreshMs) }));
await p.screenshot({ path: process.argv[3] ?? 'gearbug.png' });
console.log(errs.join('\n') || 'no page errors');
await b.close();
