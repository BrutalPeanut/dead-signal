// Records gameplay for the ad videos frame by frame (exact 30 fps, no dropped frames) in vertical
// 9:16, using the in-game autopilot. Usage: node scripts/admovie.mjs <scene> <outDir> [seconds]
// Needs the dev server on :5173. Assembled into marketing/ads/*.mp4 by scripts/admovie.sh.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [scene = 'horde', out = 'frames', secs = '13'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const FPS = 30;
const SCENES = {
  // late-game wall of infected melting under an evolved loadout
  horde: { sector: 7, gun: 'mg', extra: ['blades', 'frag'], preTime: 60, preroll: 6, target: 260, kinds: ['shambler', 'runner', 'crawler', 'shambler', 'brute'] },
  // flamethrower power fantasy
  flame: { sector: 9, gun: 'flamer', extra: ['napalm', 'disc'], preTime: 60, preroll: 6, target: 200, kinds: ['shambler', 'runner', 'bloater', 'shambler'] },
  // boss fight with the bazooka
  boss: { sector: 4, gun: 'bazooka', extra: ['arc'], preTime: 30, preroll: 4, boss: 'colossus', target: 90, kinds: ['shambler', 'runner'] },
  // early game: one pistol, hordes closing in, first upgrades
  start: { sector: 2, gun: 'pistol', extra: [], preTime: 0, preroll: 3, lv: 1, evo: false, target: 120, kinds: ['shambler', 'runner', 'crawler'] },
};
const sc = SCENES[scene];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto('http://localhost:5173/?fresh&r=3d&nostats');
await page.waitForTimeout(2000);
await page.click('.modal .btn').catch(() => {});
await page.evaluate((sc) => {
  const a = window.__ds.app;
  const p = a.profile;
  p.data.unlocked = 19;
  p.data.seenIntro = true;
  p.data.stats.runs = 20;
  p.setGun(sc.gun);
  a.startRun(sc.sector, 'campaign');
  a.filming = true;
  const g = a.game;
  for (const id of sc.extra) g.addWeapon(id);
  for (const w of g.weapons) { w.level = sc.lv ?? 5; w.evolved = sc.evo ?? true; }
  g.time = sc.preTime;
  document.getElementById('ui').style.visibility = 'hidden';
}, sc);
const god = () => page.evaluate(() => { const g = window.__ds.app.game; g.maxHp = g.hp = 1e7; });
// pre-roll without drawing so the horde builds up
for (let t = 0; t < sc.preroll; t += 2) { await god(); await page.evaluate(() => window.__ds.advance(2)); }
if (sc.boss) await page.evaluate((k) => { const g = window.__ds.app.game; g.spawnBoss(k, false); g.boss.x = g.px + 170; g.boss.y = g.py - 90; g.boss.hp *= 4; g.boss.maxHp = g.boss.hp; }, sc.boss);
await page.evaluate((sc) => {
  const g = window.__ds.app.game;
  for (let k = 0; k < (sc.target ?? 0) * 0.6; k++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 380;
    g.spawnEnemyAt(sc.kinds[k % sc.kinds.length], g.px + Math.cos(ang) * r, g.py + Math.sin(ang) * r * 1.4, false);
  }
}, sc);
// warm the renderer up (shaders, fx pools)
for (let i = 0; i < 10; i++) await page.evaluate(() => window.__ds.app.filmFrame(1 / 30));
const n = Math.round(Number(secs) * FPS);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate(([dt, sc, i]) => {
    const a = window.__ds.app;
    const g = a.game;
    g.maxHp = g.hp = 1e7;
    // keep the crowd topped up from just off screen so the shot is always packed
    const want = (sc.target ?? 0) * Math.min(1, 0.55 + i / 120);
    for (let k = 0; k < 14 && g.enemies.length < want; k++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 300 + Math.random() * 220;
      g.spawnEnemyAt(sc.kinds[k % sc.kinds.length], g.px + Math.cos(ang) * r, g.py + Math.sin(ang) * r * 1.4, Math.random() < 0.03);
    }
    a.filmFrame(dt);
  }, [1 / FPS, sc, i]);
  await page.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if (i % 60 === 0) console.log(scene, i, '/', n, `${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(await page.evaluate(() => { const g = window.__ds.app.game; return { e: g.enemies.length, k: g.kills, st: g.state }; })));
}
await browser.close();
