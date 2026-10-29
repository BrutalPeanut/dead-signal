// Fonts are self-hosted (bundled) so the game looks right offline, in app wrappers and in previews.
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/chakra-petch/latin-700-italic.css';
import '@fontsource/saira-stencil-one/latin-400.css';
import './style.css';
import './theme.css';
import { audio } from './audio';
import { Input } from './input';
import { KEY, Profile } from './meta/profile';
import { Renderer } from './render/renderer';
import { Renderer3D } from './render3d/renderer3d';
import { botChoose, botMove } from './sim/bot';
import { CHAPTER_COUNT, getChapter } from './sim/chapters';
import { GUN_IDS, type WeaponId } from './sim/data';
import { dailyChallenge, defaultMods, modsFor, type RunMode } from './sim/modes';
import { DT, Game } from './sim/game';
import { Interp } from './render/interp';
import { CloudSync } from './meta/sync';
import { cloudModal, statusText } from './ui/cloud';
import type { BaseStats, FxEvent } from './sim/types';
import { haptic, setHaptics, toast } from './ui/dom';
import { Hub, useSkin } from './ui/hub';
import { LEVELUP_TIP, Tutorial } from './ui/tutorial';
import { ads, adsOn } from './ads/ads';
import { Hud, chestModal, levelUpModal, pauseModal, reviveModal } from './ui/hud';
import { introModal, resultsModal, settingsModal } from './ui/screens';

type Mode = 'hub' | 'run';

/** 3D unless the player picked the classic 2D art (or ?r=2d), or the device has no WebGL. */
function want3d(graphics: '3d' | '2d' | undefined) {
  const q = new URLSearchParams(location.search).get('r');
  if (q === '2d') return false;
  if (q !== '3d' && graphics === '2d') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Cloud save is for the real save only (not ?fresh, ?playtest or ?profile=name test saves). */
function syncAllowed() {
  const q = new URLSearchParams(location.search);
  return playtestSector() === null && !q.has('fresh') && !q.get('profile') && !q.has('nosync');
}

/** ?playtest=N (1-based sector), or null. */
function playtestSector(): number | null {
  const v = new URLSearchParams(location.search).get('playtest');
  if (v === null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(CHAPTER_COUNT - 1, n - 1)) : 0;
}

/**
 * ?fresh plays as a brand-new player every load (great for trying the first-time experience)
 * without touching your real save; ?profile=name keeps a separate named save.
 */
function makeProfile() {
  const q = new URLSearchParams(location.search);
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  const pt = playtestSector();
  if (pt !== null) {
    // ?playtest=8 drops straight into Sector 8 on a separate test save (your real save is untouched):
    // everything up to that sector unlocked, every primary gun, and gear power to match.
    // Optional: &gun=smg|flamer|mg|bazooka|pistol, &atk=, &hp=
    const p = new Profile(store, KEY + ':playtest');
    p.data.unlocked = Math.max(p.data.unlocked, pt, 8);
    p.data.seenIntro = true;
    for (let i = 0; i < pt; i++) p.data.stars[i] = (p.data.stars[i] ?? 0) | 7;
    const gun = q.get('gun') as WeaponId | null;
    if (gun && GUN_IDS.includes(gun)) p.data.gun = gun;
    const num = (k: string, d: number) => {
      const v = Number(q.get(k));
      return Number.isFinite(v) && v > 0 ? v : d;
    };
    p.boost = { atk: num('atk', 70 + pt * 11), hp: num('hp', 560 + pt * 100) };
    p.save();
    return p;
  }
  if (q.has('fresh')) {
    try {
      store?.removeItem(KEY + ':fresh');
    } catch {
      /* ignore */
    }
    return new Profile(store, KEY + ':fresh');
  }
  const name = q.get('profile');
  if (name && /^[\w-]{1,24}$/.test(name)) return new Profile(store, `${KEY}:${name}`);
  return new Profile(store);
}

class App {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  ui = document.getElementById('ui')!;
  profile = makeProfile();
  sync = new CloudSync(this.profile, syncAllowed());
  input = new Input(this.canvas);
  mode: Mode = 'hub';
  game: Game;
  renderer: Renderer | Renderer3D;
  hud: Hud;
  hub: Hub;
  sector = 0;
  paused = false;
  modal: HTMLElement | null = null;
  modalFor = '';
  private acc = 0;
  private interp = new Interp();
  private last = performance.now();
  private endT = -1;

  constructor() {
    useSkin(this.profile.data.character);
    this.input.mode = this.profile.data.settings.controls ?? 'drag';
    this.profile.flushScores();
    const s = this.profile.data.settings;
    audio.setSfx(s.sfx);
    audio.setMusic(s.music);
    setHaptics(s.haptics);

    this.game = this.demoGame(this.profile.data.unlocked);
    this.renderer = want3d(s.graphics) ? new Renderer3D(this.canvas, this.game) : new Renderer(this.canvas, this.game);
    this.hud = new Hud(() => this.pause());
    this.hub = new Hub(
      this.profile,
      (sec, mode) => this.startRun(sec, mode),
      () => this.openSettings(),
    );
    this.ui.append(this.hub.el);

    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 250));
    window.visualViewport?.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'run') this.pause();
    });
    // Browsers require a gesture before audio can start.
    const unlock = () => {
      audio.unlock();
      audio.startMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mode === 'run') this.paused ? this.resume() : this.pause();
    });

    if (!this.profile.data.seenIntro) {
      this.showModal(
        introModal(() => {
          this.profile.data.seenIntro = true;
          this.profile.save();
          this.closeModal();
        }),
        'intro',
      );
    } else setTimeout(() => this.mode === 'hub' && this.hub.maybeCalendar(), 700);
    const pt = playtestSector();
    if (pt !== null) setTimeout(() => this.startRun(pt, 'campaign'), 400);
    // cloud save: take a further-along save from another device (only between runs), else back up
    this.sync.onAdopted = () => this.reloadSynced();
    void this.sync.startup(() => this.mode === 'hub');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.sync.pushNow();
    });
    try {
      if (sessionStorage.getItem('ds.synced')) {
        sessionStorage.removeItem('ds.synced');
        setTimeout(() => toast('Progress loaded from the cloud', '#43ffa4'), 600);
      }
    } catch {
      /* ignore */
    }
    requestAnimationFrame(this.frame);
  }

  /** Attract mode behind the hub: an autopiloted courier fighting in the selected sector. */
  private demoGame(sector: number) {
    const base: BaseStats = {
      atk: 60, hp: 99999, def: 0.5, crit: 0.1, critMul: 1.5, moveSpeed: 92, pickup: 60, healMul: 1, goldMul: 1,
      rerolls: 0, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0.05,
    };
    const g = new Game({ ...getChapter(sector), hpMul: 1, dmgMul: 1 }, base, Math.floor(Math.random() * 1e9));
    // fast-forward a bit so the screen is busy
    g.time = 30;
    return g;
  }

  runMode: RunMode = 'campaign';
  tutorial = new Tutorial();
  tutorialOn = false;

  startRun(sector: number, mode: RunMode = 'campaign') {
    audio.unlock();
    this.sector = sector;
    this.runMode = mode;
    this.mode = 'run';
    this.endT = -1;
    this.tutorialOn = false;
    this.tutorial.reset();
    this.hud.el.classList.toggle('pad', this.input.mode !== 'drag');
    this.hud.setHintText(this.input.mode !== 'drag' ? `Use the pad in the bottom ${this.input.mode} corner to move` : 'Drag anywhere to move');
    let title = getChapter(sector).name.toUpperCase();
    let sub = `Sector ${sector + 1} · survive 5:00`;
    if (mode === 'daily') {
      const ch = dailyChallenge();
      const chapter = { ...getChapter(ch.sector), name: 'Daily Challenge', midBoss: ch.midBoss, finalBoss: ch.finalBoss };
      this.game = new Game(chapter, this.profile.standardKit(), ch.seed, modsFor(ch));
      this.hud.startRun(0, 'daily', this.profile.dailyState().best);
      title = 'DAILY CHALLENGE';
      sub = ch.mods.map((m) => m.name).join(' + ');
    } else if (mode === 'endless') {
      this.game = new Game(getChapter(sector), this.profile.baseStats(), Math.floor(Math.random() * 1e9), defaultMods('endless'));
      this.hud.startRun(this.profile.data.endless.best, 'endless');
      title = 'ENDLESS';
      sub = 'How long can you last?';
    } else {
      const base = this.profile.baseStats();
      // Sector 1 is the training ground: one free revive so first-timers can bank a win.
      if (sector === 0) base.revives += 1;
      // ...and until it's cleared once, a guided tutorial run
      this.tutorialOn = sector === 0 && !((this.profile.data.stars[0] ?? 0) & 4);
      this.game = new Game(getChapter(sector), base, Math.floor(Math.random() * 1e9), { ...defaultMods(), tutorial: this.tutorialOn });
      sub = `Sector ${sector + 1} · survive ${this.game.runLength >= 120 ? Math.round(this.game.runLength / 60) + ':00' : this.game.runLength + 's'}`;
      if (this.tutorialOn) sub = 'Training run · 2 minutes · follow the tips';
      this.hud.startRun(this.profile.data.best[sector] ?? 0, 'campaign', 0, this.game.runLength);
    }
    this.game.adRevive = adsOn();
    this.renderer.setGame(this.game);
    this.renderer.fx.parts.length = 0;
    this.renderer.fx.decals.length = 0;
    this.renderer.fx.banners.length = 0;
    this.renderer.fx.banners.push({ text: title, sub, color: mode === 'daily' ? '#ffd34d' : '#5ef2ff', t: 2.6 });
    this.hub.el.remove();
    this.hub.closeModal();
    this.ui.append(this.hud.el);
    this.input.enabled = true;
    this.input.moved = false;
    audio.bossMode = false;
    audio.intensity = 0;
  }

  private backToHub(goNext = false) {
    // the cloud was ahead when we launched mid-run: take it now that the run is over
    if (this.sync.behind) void this.sync.startup(() => this.mode === 'hub');
    this.closeModal();
    this.hud.el.remove();
    this.mode = 'hub';
    this.paused = false;
    if (this.runMode === 'campaign') this.hub.sector = goNext ? this.profile.data.unlocked : Math.min(this.profile.data.unlocked, Math.max(this.sector, this.hub.sector));
    this.hub.tab = 'deploy';
    this.hub.refresh();
    this.ui.append(this.hub.el);
    this.game = this.demoGame(this.hub.sector);
    this.renderer.setGame(this.game);
    audio.bossMode = false;
    audio.intensity = 0.2;
    setTimeout(() => this.mode === 'hub' && this.hub.maybeCalendar(), 500);
  }

  pause() {
    if (this.mode !== 'run' || this.paused || this.game.state !== 'play') return;
    this.paused = true;
    this.input.release();
    const s = this.profile.data.settings;
    this.showModal(
      pauseModal(
        this.game,
        s,
        () => this.resume(),
        (k) => {
          s[k] = !s[k];
          this.profile.save();
          audio.setSfx(s.sfx);
          audio.setMusic(s.music);
        },
        () => {
          this.closeModal();
          this.paused = false;
          this.finishRun();
        },
        s.controls ?? 'drag',
        (m) => this.setControls(m),
      ),
      'pause',
    );
  }

  resume() {
    this.paused = false;
    this.closeModal();
    this.last = performance.now();
  }

  private setControls(m: 'drag' | 'left' | 'right') {
    this.profile.data.settings.controls = m;
    this.profile.save();
    this.input.mode = m;
    this.input.release();
  }

  private openSettings() {
    const s = this.profile.data.settings;
    this.showModal(
      settingsModal(
        s,
        (k) => {
          s[k] = !s[k];
          this.profile.save();
          audio.setSfx(s.sfx);
          audio.setMusic(s.music);
          setHaptics(s.haptics);
        },
        () => {
          this.profile.reset();
          this.sync.fresh(); // new code: old cloud backups stay safe and can't sync this back
          location.reload();
        },
        () => this.closeModal(),
        (m) => this.setControls(m),
        {
          on3d: this.renderer instanceof Renderer3D,
          toggle: () => {
            s.graphics = this.renderer instanceof Renderer3D ? '2d' : '3d';
            this.profile.save();
            location.reload();
          },
        },
        this.sync.enabled ? { status: statusText(this.sync), open: () => this.openCloud() } : undefined,
      ),
      'settings',
    );
  }

  private openCloud() {
    this.showModal(
      cloudModal(this.sync, () => this.openSettings(), () => this.reloadSynced()),
      'cloud',
    );
  }

  /** A save from the cloud replaced this device's: restart cleanly on it. */
  private reloadSynced() {
    try {
      sessionStorage.setItem('ds.synced', '1');
    } catch {
      /* ignore */
    }
    location.reload();
  }

  private showModal(el: HTMLElement, key: string) {
    this.closeModal();
    this.modal = el;
    this.modalFor = key;
    this.ui.append(el);
  }

  private closeModal() {
    this.modal?.remove();
    this.modal = null;
    this.modalFor = '';
  }

  private finishRun() {
    const g = this.game;
    if (g.state !== 'won') g.state = 'dead';
    const r = g.result();
    const mode = this.runMode;
    const rw = mode === 'daily' ? this.profile.applyDaily(r) : mode === 'endless' ? this.profile.applyEndless(this.sector, r) : this.profile.applyRun(this.sector, r);
    this.input.release();
    // After a first clear, land on the newly unlocked sector, ready to go.
    const goNext = rw.unlockedSector;
    const coach = !r.won ? this.profile.coach() : null;
    this.showModal(
      resultsModal(r, rw, mode === 'campaign' ? `Sector ${this.sector + 1} · ${g.chapter.name}` : mode === 'daily' ? `Daily Challenge · ${dailyChallenge().mods.map((m) => m.name).join(' + ')}` : 'Endless', () => this.backToHub(goNext), coach?.label ?? null, () => this.backToHub(false), adsOn() ? () => ads.showRewarded('double').then((ok) => (ok && (this.profile.grant({ gold: rw.gold }), this.profile.save()), ok)) : undefined),
      'results',
    );
    if (r.won) audio.evolve();
    if (mode !== 'campaign') {
      const label = mode === 'daily' ? "today's board" : 'the Endless board';
      this.profile.postScore(mode, r.score ?? 0, r.time).then((rank) => {
        if (rank) toast(`#${rank} on ${label}`, '#ffd34d');
        else if (!this.profile.data.online.name) toast('Set a call sign in Ranks to join the leaderboard', '#8d97ab');
      });
    }
  }

  /** Run-state driven modals: level-ups, chests, revive, end of run. */
  private syncRunUi() {
    const g = this.game;
    if (this.paused) return;
    switch (g.state) {
      case 'levelup': {
        const key = 'lvl' + g.level + ':' + g.offers.map((o) => (o as any).id ?? o.type).join() + g.rerolls;
        if (this.modalFor !== key) {
          this.input.release();
          this.showModal(
            levelUpModal(
              g,
              (i) => {
                audio.click();
                haptic(10);
                g.choose(i);
                if (g.state === 'play') this.closeModal();
              },
              () => {
                if (g.reroll()) audio.click();
              },
              this.tutorialOn && g.level <= 3 ? LEVELUP_TIP : undefined,
            ),
            key,
          );
        }
        break;
      }
      case 'chest':
        if (this.modalFor !== 'chest') {
          this.input.release();
          audio.pickup('chest');
          this.showModal(
            chestModal(g, () => {
              g.closeChest();
              this.closeModal();
            }),
            'chest',
          );
        }
        break;
      case 'revive':
        if (this.modalFor !== 'revive') {
          this.input.release();
          this.showModal(
            reviveModal(
              () => {
                g.revive(true);
                this.closeModal();
              },
              () => {
                g.revive(false);
                this.closeModal();
              },
              g.revives,
              g.revives <= 0 && g.adRevive
                ? () =>
                    ads.showRewarded('revive').then((ok) => {
                      g.revive(ok, ok);
                      this.closeModal();
                    })
                : undefined,
            ),
            'revive',
          );
        }
        break;
      case 'dead':
      case 'won':
        if (this.endT < 0) this.endT = g.state === 'won' ? 0.6 : 1.4;
        break;
      case 'play':
        if (['pause', 'settings', 'results', 'intro'].includes(this.modalFor)) break;
        if (this.modal) this.closeModal();
        break;
    }
  }

  private playSounds(events: FxEvent[]) {
    if (this.mode !== 'run') return;
    for (const e of events) {
      switch (e.t) {
        case 'shoot':
          audio.shoot(e.weapon);
          break;
        case 'hit':
          audio.hit();
          break;
        case 'death':
          audio.kill();
          break;
        case 'explode':
          audio.explode();
          break;
        case 'pickup':
          audio.pickup(e.kind);
          break;
        case 'playerHit':
          audio.hurt();
          haptic(8);
          break;
        case 'levelup':
          audio.levelUp();
          break;
        case 'emp':
          audio.emp();
          haptic(40);
          break;
        case 'evolve':
          audio.evolve();
          haptic(60);
          break;
        case 'banner':
          if (e.text === 'HORDE INCOMING' || e.text === 'ELITE DETECTED') audio.warn();
          else if (e.text && e.color === '#ff3b5c' && e.text !== 'ENRAGED') audio.bossRoar();
          break;
        case 'bossDown':
          audio.explode();
          haptic(80);
          break;
        case 'toast':
          this.hud.toast(e.text, e.color, e.big);
          if (e.big) {
            audio.pickup('chest');
            haptic(30);
          } else audio.pickup('gold');
          break;
      }
    }
  }

  private frame = (now: number) => {
    // rAF timestamps can predate a performance.now() stored mid-frame (e.g. on resume): never step backwards
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    if (this.mode === 'run' && !this.paused && this.game.state === 'play') this.renderer.adapt(now - this.last);
    this.last = now;
    const g = this.game;

    if (this.mode === 'hub') {
      // attract mode
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
        else if (g.state === 'chest') g.closeChest();
        else if (g.state !== 'play' || g.time > 280) {
          this.game = this.demoGame(this.hub.sector);
          this.renderer.setGame(this.game);
          break;
        }
        const [mx, my] = botMove(g);
        this.interp.capture(g);
        g.step(mx, my);
      }
      this.hub.tick(dt);
      audio.intensity = 0.15;
    } else if (!this.paused) {
      if (g.state === 'play') {
        this.acc += dt;
        let n = 0;
        while (this.acc >= DT && n < 6 && g.state === 'play') {
          this.acc -= DT;
          const [mx, my] = this.input.read();
          this.interp.capture(g);
          g.step(mx, my);
          n++;
        }
        if (n >= 6) this.acc = 0;
      } else this.acc = 0;
      audio.intensity = Math.min(1, g.time / 240);
      audio.bossMode = !!g.boss;
      this.syncRunUi();
      if (this.endT >= 0) {
        this.endT -= dt;
        if (this.endT < 0 && this.modalFor !== 'results') this.finishRun();
      }
    }

    this.playSounds(this.game.fx);
    this.renderer.joystick = this.mode === 'run' ? this.input.stick : null;
    const padMode = this.input.mode !== 'drag' && this.mode === 'run';
    this.renderer.joystickFixed = padMode;
    this.renderer.padIdle = padMode && !this.input.stick ? this.input.padCenter() : null;
    const frozen = this.mode === 'run' && (this.paused || this.game.state !== 'play');
    // draw between the last two sim steps so motion is smooth on 120/144 Hz screens
    this.interp.apply(this.game, frozen ? 1 : Math.min(1, this.acc / DT));
    try {
      this.renderer.render(frozen ? 0 : dt);
    } finally {
      this.interp.restore(this.game);
    }
    if (this.mode === 'run') {
      this.hud.update(this.game, this.renderer.fx.banners);
      if (this.tutorialOn) {
        if (!this.tutorial.el.isConnected) this.hud.el.append(this.tutorial.el);
        this.tutorial.controls = this.input.mode;
        if (!this.paused) this.tutorial.update(this.game, dt);
        this.renderer.guide = this.tutorial.target;
        this.hud.showHint(false);
      } else {
        this.renderer.guide = null;
        this.tutorial.el.remove();
        this.hud.showHint(!this.input.moved && this.game.time < 12 && this.profile.data.stats.runs < 3);
      }
    }
    requestAnimationFrame(this.frame);
  };
}

const app = new App();

// Test hook (used by the screenshot/playtest scripts): fast-forward the current run with the autopilot.
(window as any).__ds = {
  app,
  botIntent: (g: Game) => botMove(g),
  advance(seconds: number) {
    const g = app.game;
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps && g.state !== 'dead' && g.state !== 'won'; i++) {
      if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
      else if (g.state === 'chest') g.closeChest();
      else if (g.state === 'revive') g.revive(true);
      const [mx, my] = botMove(g);
      g.step(mx, my);
      if (g.fx.length > 4000) g.fx.length = 0;
    }
    g.fx.splice(0, Math.max(0, g.fx.length - 300));
  },
};
