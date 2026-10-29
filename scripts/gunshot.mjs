// Primary guns playtest: each gun in a live 3D run (Lv1, Lv5 and evolved), the Armory picker,
// and the "new gun" results banner. node scripts/gunshot.mjs [url] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [url = 'http://localhost:5173/', out = 'screens/guns'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push(m.text()); });
await page.goto(url + '?fresh&r=3d');
await page.waitForTimeout(1500);
await page.click('.modal .btn').catch(() => {});
await page.evaluate(() => { const a = window.__ds.app; a.profile.data.unlocked = 9; a.profile.data.seenIntro = true; a.profile.save(); a.hub.setTab('armory'); });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/armory.png` });
const god = () => page.evaluate(() => { const g = window.__ds.app.game; g.maxHp = g.hp = 1e7; });
for (const gun of (process.env.GUNS ?? 'pistol,smg,flamer,mg,bazooka').split(',')) {
  await page.evaluate((id) => { const a = window.__ds.app; a.profile.setGun(id); a.startRun(4, 'campaign'); }, gun);
  await god();
  for (let k = 0; k < 24; k += 4) { await god(); await page.evaluate(() => window.__ds.advance(4)); }
  for (const [lv, evo] of [[1, false], [5, false], [5, true]]) {
    await page.evaluate(([lv, evo]) => { const g = window.__ds.app.game; const w = g.weapons[0]; w.level = lv; w.evolved = evo; }, [lv, evo]);
    for (let k = 0; k < 3; k++) { await god(); await page.evaluate(() => window.__ds.advance(1)); }
    await page.waitForTimeout(1300);
    const tag = `${gun}-${evo ? 'evo' : 'L' + lv}`;
    await page.screenshot({ path: `${out}/${tag}.png` });
    await page.screenshot({ path: `${out}/${tag}-zoom.png`, clip: { x: 95, y: 250, width: 200, height: 260 } });
    const info = await page.evaluate(() => { const g = window.__ds.app.game; return { w: g.weapons.map((x) => x.id + x.level + (x.evolved ? '*' : '')).join(','), e: g.enemies.length, proj: g.projectiles.length, kills: g.kills }; });
    console.log(tag, JSON.stringify(info));
  }
}
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 20).join('\n'));
else console.log('no errors');
await browser.close();
