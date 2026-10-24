// Lobby at short phone viewports (in-app browsers with toolbars). node scripts/shortshot.mjs <outdir>
import { chromium } from 'playwright';
const out = process.argv[2] ?? 'screens/short';
const sizes = [[388, 640], [360, 600], [390, 700], [390, 844], [412, 760]];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
import fs from 'node:fs';
fs.mkdirSync(out, { recursive: true });
for (const [w, hh] of sizes) {
  const p = await b.newPage({ viewport: { width: w, height: hh }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await p.goto('http://localhost:5173/');
  await p.waitForTimeout(700);
  await p.locator("text=LET'S GO").click().catch(() => {});
  await p.evaluate(() => { const a = window.__ds.app; a.profile.data.stats.runs = 3; a.profile.data.gold = 5000; a.profile.data.unlocked = Math.max(1, a.profile.data.unlocked); a.hub.refresh(); });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
    return { card: box('.lobby-body .sector-card'), coach: box('.coach'), go: box('.battle-row .go'), nav: box('.nav'), railL: box('.rails.left'), railR: box('.rails.right'), stage: box('.lobby-body .stage'), scroll: document.querySelector('.hub-body')?.scrollHeight + '/' + document.querySelector('.hub-body')?.clientHeight };
  });
  console.log(w + 'x' + hh, JSON.stringify(r));
  await p.screenshot({ path: `${out}/${w}x${hh}.png` });
  await p.close();
}
await b.close();
