// Fixed thumb pad: touches on the pad steer, touches elsewhere don't. node scripts/padtest.mjs <outprefix>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:5173/?fresh'); await p.waitForTimeout(600);
await p.locator('.modal .btn').first().tap();
await p.locator('.topbar .icon-btn').click(); await p.waitForTimeout(300);
await p.locator('.ctl .mt', { hasText: 'Pad left' }).click(); await p.waitForTimeout(200);
await p.screenshot({ path: out + '-settings.png' });
await p.locator('.sheet .btn', { hasText: 'Done' }).click(); await p.waitForTimeout(300);
const mode = await p.evaluate(() => [window.__ds.app.input.mode, window.__ds.app.profile.data.settings.controls]);
await p.evaluate(() => { const a = window.__ds.app; a.profile.data.stars = { 0: 7 }; a.profile.data.unlocked = 1; a.hub.sector = 1; a.hub.refresh(); });
await p.tap('.battle-row .go'); await p.waitForTimeout(800);
await p.screenshot({ path: out + '-idle.png' });
const cdp = await ctx.newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const pos = () => p.evaluate(() => { const g = window.__ds.app.game; return [Math.round(g.px), Math.round(g.py)]; });
const c = await p.evaluate(() => window.__ds.app.input.padCenter());
// 1) touch far from the pad: no movement
const a0 = await pos();
await touch('touchStart', 300, 300); for (let i = 0; i < 10; i++) { await touch('touchMove', 300 + i * 6, 300); await p.waitForTimeout(40); } await touch('touchEnd', 0, 0);
const a1 = await pos();
// 2) drag on the pad to the right: moves right; knob clamped
await touch('touchStart', c.x, c.y); for (let i = 0; i < 12; i++) { await touch('touchMove', c.x + i * 12, c.y); await p.waitForTimeout(40); }
await p.screenshot({ path: out + '-active.png' });
const knob = await p.evaluate(() => { const s = window.__ds.app.input.stick; return s && Math.round(Math.hypot(s.x - s.ox, s.y - s.oy)); });
await touch('touchEnd', 0, 0);
const a2 = await pos();
console.log(JSON.stringify({ mode, offPadMoved: a1[0] - a0[0], padMovedX: a2[0] - a1[0], knobClampedTo: knob }));
console.log(errs.join('\n') || 'no page errors');
await b.close();
