// Records gameplay for the ad videos frame by frame (exact 30 fps, no dropped frames) in vertical
// 9:16 using the in-game autopilot, plus the run's own sound effects rendered offline in sync.
//
//   node scripts/admovie.mjs <scene> <outDir> [seconds]     → outDir/f0000.jpg…, log.json, sfx.wav
//   node scripts/admovie.mjs music <out.wav> <seconds> [boss]  → the game's music, offline
//
// Needs the built game served on :5173 (npm run build && npx vite preview --port 5173).
// scripts/admovie.py cuts the shots together into marketing/ads/*.mp4.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [scene = 'horde', out = 'frames', secs = '12.5', flag = ''] = process.argv.slice(2);
const FPS = 30;
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

const SCENES = {
  // late-game wall of infected melting under an evolved loadout; opens tight on the courier and
  // pulls back to reveal the horde
  horde: {
    sector: 7, gun: 'mg', extra: ['blades', 'frag'], preTime: 60, preroll: 6, target: 260,
    kinds: ['shambler', 'runner', 'crawler', 'shambler', 'brute'],
    zoom: (t) => 1 + 1.25 * (1 - ease(t / 1.6)) + 0.06 * Math.max(0, t - 2) / 10,
  },
  // flamethrower power fantasy: the real level-up card, then the evolution
  flame: {
    sector: 9, gun: 'flamer', extra: ['napalm', 'disc'], preTime: 60, preroll: 6, target: 220,
    kinds: ['shambler', 'runner', 'bloater', 'shambler'], lv: 5, evo: false,
    levelup: 1.3, evolveAt: 1.4, evolve: 'flamer',
    zoom: (t) => (t < 1.4 ? 1.12 : 1 + 0.3 * (1 - ease((t - 1.4) / 0.7))),
  },
  // boss fight with the bazooka, ending in the kill
  boss: {
    sector: 4, gun: 'bazooka', extra: ['arc'], preTime: 30, preroll: 4, boss: 'colossus', bossDownAt: 8.8,
    target: 90, kinds: ['shambler', 'runner'],
    zoom: (t) => (t < 8.8 ? 1.18 - 0.14 * ease(t / 8) : 1.04 + 0.22 * (1 - ease((t - 8.8) / 0.8))),
  },
  // early game: one pistol, first sector
  start: {
    sector: 2, gun: 'pistol', extra: [], preTime: 0, preroll: 3, lv: 1, evo: false, target: 70,
    kinds: ['shambler', 'runner', 'crawler'], zoom: () => 1.1,
  },
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto('http://localhost:5173/?fresh&r=3d&nostats', { timeout: 120_000 });
await page.waitForTimeout(2000);

// ------------------------------------------------------------------ offline audio
// Plays logged sound events through the game's synthesizer on an OfflineAudioContext, with
// `currentTime` pinned to each event's time, and returns a 16-bit stereo WAV as base64.
const renderAudio = (log, dur, opts) =>
  page.evaluate(
    async ([log, dur, opts]) => {
      const SR = 44100;
      const off = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
      let T = 0;
      const ctx = new Proxy(off, {
        get(t, p) {
          if (p === 'currentTime') return T;
          if (p === 'state') return 'running';
          const v = t[p];
          return typeof v === 'function' ? v.bind(t) : v;
        },
      });
      const A = new window.__ds.Audio();
      const real = window.AudioContext;
      window.AudioContext = function () { return ctx; };
      A.unlock();
      window.AudioContext = real;
      A.setMusic(!!opts.music);
      A.setSfx(!!opts.sfx);
      if (opts.music) {
        A.intensity = opts.intensity ?? 1;
        A.bossMode = !!opts.boss;
        A.playing = true;
        A.step = 0;
        A.nextNote = 0.02;
        for (T = 0; T < dur; T += 0.05) A.schedule();
      }
      if (opts.sfx) {
        for (const f of log) {
          T = f.t;
          for (const e of f.fx) {
            switch (e.t) {
              case 'shoot': A.shoot(e.weapon); break;
              case 'hit': A.hit(); break;
              case 'death': A.kill(); break;
              case 'explode': case 'bossDown': A.explode(); break;
              case 'pickup': A.pickup(e.kind); break;
              case 'levelup': A.levelUp(); break;
              case 'emp': A.emp(); break;
              case 'evolve': A.evolve(); break;
              case 'toast': A.pickup(e.big ? 'chest' : 'gold'); break;
              case 'banner':
                if (e.text === 'HORDE INCOMING' || e.text === 'ELITE DETECTED') A.warn();
                else if (e.text && e.color === '#ff3b5c' && e.text !== 'ENRAGED') A.bossRoar();
                break;
            }
          }
        }
      }
      const buf = await off.startRendering();
      const n = buf.length;
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const bytes = new Uint8Array(44 + n * 4);
      const dv = new DataView(bytes.buffer);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
      str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true);
      dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [log, dur, opts],
  );

if (scene === 'music') {
  const wav = await renderAudio([], Number(secs), { music: true, intensity: 1, boss: flag === 'boss' });
  writeFileSync(out, Buffer.from(wav, 'base64'));
  console.log('wrote', out);
  await browser.close();
  process.exit(0);
}

// ------------------------------------------------------------------ gameplay
const sc = SCENES[scene];
const zoomAt = sc.zoom;
delete sc.zoom; // functions can't cross into the page: the zoom is sent per frame
mkdirSync(out, { recursive: true });
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
  for (const w of g.weapons) { w.level = 5; w.evolved = true; }
  if (sc.lv !== undefined) g.weapons[0].level = sc.lv;
  if (sc.evo !== undefined) g.weapons[0].evolved = sc.evo;
  g.time = sc.preTime;
  document.getElementById('ui').style.visibility = 'hidden';
  window.__baseZoom = a.renderer.zoom;
}, sc);
const god = () => page.evaluate(() => { const g = window.__ds.app.game; g.maxHp = g.hp = 1e7; });
for (let t = 0; t < sc.preroll; t += 2) { await god(); await page.evaluate(() => window.__ds.advance(2)); }
if (sc.boss) await page.evaluate((k) => { const g = window.__ds.app.game; g.spawnBoss(k, false); g.boss.x = g.px + 110; g.boss.y = g.py - 120; g.boss.hp *= 3; g.boss.maxHp = g.boss.hp; }, sc.boss);
await page.evaluate((sc) => {
  const g = window.__ds.app.game;
  for (let k = 0; k < (sc.target ?? 0) * 0.6; k++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 380;
    g.spawnEnemyAt(sc.kinds[k % sc.kinds.length], g.px + Math.cos(ang) * r, g.py + Math.sin(ang) * r * 1.4, false);
  }
}, sc);
for (let i = 0; i < 10; i++) await page.evaluate(() => window.__ds.app.filmFrame(1 / 30));
await page.evaluate(() => { const a = window.__ds.app; a.filmLog = []; a.filmT = 0; });

// the level-up card, on screen for the opening of the shot
if (sc.levelup) {
  await page.evaluate(() => {
    const a = window.__ds.app;
    const g = a.game;
    g.pendingLevels++;
    g.openLevelUp();
    // the middle card is the flamethrower's partner, the one that evolves it
    g.offers[1] = { type: 'passive', id: 'injector', level: 1, isNew: true };
    a.syncRunUi();
    const ui = document.getElementById('ui');
    ui.style.visibility = 'visible';
    for (const el of ui.children) if (!el.classList.contains('modal')) el.style.visibility = 'hidden';
  });
}

const n = Math.round(Number(secs) * FPS);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const t = i / FPS;
  await page.evaluate(
    ([dt, sc, i, t, z]) => {
      const a = window.__ds.app;
      const g = a.game;
      const R = a.renderer;
      g.maxHp = g.hp = 1e7;
      // camera: per-scene zoom curve (bigger = closer)
      R.zoom = window.__baseZoom * z;
      R.applyView();
      // keep the crowd topped up from just off screen so the shot is always packed
      const want = (sc.target ?? 0) * Math.min(1, 0.6 + i / 120);
      for (let k = 0; k < 14 && g.enemies.length < want; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 300 + Math.random() * 220;
        g.spawnEnemyAt(sc.kinds[k % sc.kinds.length], g.px + Math.cos(ang) * r, g.py + Math.sin(ang) * r * 1.4, Math.random() < 0.03);
      }
      let hold = false;
      if (sc.levelup) {
        if (t < sc.levelup) {
          hold = true;
          // the player's thumb lands on a card two-thirds of the way in
          if (t > sc.levelup * 0.62) {
            const card = document.querySelectorAll('#ui .modal .card')[1];
            if (card) { card.style.transform = 'scale(1.07)'; card.style.boxShadow = '0 0 0 3px #ffd34d, 0 0 28px #ffd34d'; }
          }
        } else if (g.state === 'levelup') {
          g.choose(Math.min(1, g.offers.length - 1));
          a.closeModal();
          document.getElementById('ui').style.visibility = 'hidden';
        }
      }
      if (sc.evolveAt !== undefined && t >= sc.evolveAt && !window.__evolved) {
        window.__evolved = true;
        const w = g.weapons.find((x) => x.id === sc.evolve);
        if (w) w.evolved = true;
        g.fx.push({ t: 'evolve', weapon: sc.evolve });
        g.fx.push({ t: 'shake', amt: 14 });
      }
      if (sc.bossDownAt !== undefined && t >= sc.bossDownAt && g.boss && g.boss.hp > 1) g.boss.hp = 1;
      a.filmFrame(dt, hold);
    },
    [1 / FPS, sc, i, t, zoomAt(t)],
  );
  await page.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if (i % 60 === 0) console.log(scene, i, '/', n, `${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(await page.evaluate(() => { const g = window.__ds.app.game; return { e: g.enemies.length, k: g.kills, st: g.state, boss: !!g.boss }; })));
}
const log = await page.evaluate(() => window.__ds.app.filmLog);
writeFileSync(`${out}/log.json`, JSON.stringify(log.map((f) => ({ t: +f.t.toFixed(4), kills: f.kills }))));
const wav = await renderAudio(log, Number(secs) + 0.5, { sfx: true });
writeFileSync(`${out}/sfx.wav`, Buffer.from(wav, 'base64'));
console.log(scene, 'done', n, 'frames', `${((Date.now() - t0) / 1000).toFixed(0)}s`);
await browser.close();
