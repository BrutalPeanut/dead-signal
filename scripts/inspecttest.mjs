// Regression: "Inspect" on a crate reveal (and on the open-all haul) must open the item sheet.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:5173/?fresh'); await p.waitForTimeout(600);
await p.locator('.modal .btn').first().tap();
await p.evaluate(() => { const a = window.__ds.app; a.profile.data.keys = 5; a.profile.save(); });
await p.locator('.nav button', { hasText: 'Supply' }).tap(); await p.waitForTimeout(300);
await p.locator('.btn', { hasText: /^Open/ }).first().tap(); await p.waitForTimeout(400);
await p.locator('.modal .btn', { hasText: 'Inspect' }).tap(); await p.waitForTimeout(400);
const single = await p.evaluate(() => !!document.querySelector('.modal .sheet .kv'));
await p.locator('.sheet .btn.ghost', { hasText: 'Close' }).tap(); await p.waitForTimeout(300);
await p.locator('.btn', { hasText: 'Open all' }).tap(); await p.waitForTimeout(500);
await p.locator('.haul-best').tap(); await p.waitForTimeout(400);
const haul = await p.evaluate(() => !!document.querySelector('.modal .sheet .kv'));
await p.locator('.sheet .btn.ghost', { hasText: 'Close' }).tap(); await p.waitForTimeout(300);
// backdrop tap still closes
await p.locator('.nav button', { hasText: 'Armory' }).tap(); await p.waitForTimeout(300);
await p.locator('.inv .item').first().tap(); await p.waitForTimeout(300);
await p.mouse.click(10, 10); await p.waitForTimeout(300);
const closed = await p.evaluate(() => !document.querySelector('.modal'));
console.log(JSON.stringify({ inspectFromReveal: single, inspectFromHaul: haul, backdropCloses: closed }), single && haul && closed ? 'PASS' : 'FAIL');
console.log(errs.join('\n') || 'no page errors');
await b.close();
