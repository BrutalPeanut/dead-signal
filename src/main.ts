// Fonts are self-hosted (bundled) so the game looks right offline, in app wrappers and in previews.
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/chakra-petch/latin-700-italic.css';
import '@fontsource/saira-stencil-one/latin-400.css';
import './style.css';
import './theme.css';
import { Audio, audio } from './audio';
import { Input } from './input';
import { KEY, Profile } from './meta/profile';
import { Renderer } from './render/renderer';
import { Renderer3D } from './render3d/renderer3d';
import { botChoose, botMove } from './sim/bot';
import { CHAPTER_COUNT, getChapter } from './sim/chapters';
import { romanRank } from './meta/ascension';
import { GUN_IDS, type WeaponId } from './sim/data';
import { dailyChallenge, defaultMods, modsFor, type RunMode } from './sim/modes';
import { DT, Game } from './sim/game';
import { Interp } from './render/interp';
import { CloudSync } from './meta/sync';
import { cloudModal, protectModal, statusText } from './ui/cloud';
import type { BaseStats, FxEvent } from './sim/types';
import { haptic, setHaptics, toast } from './ui/dom';
import { Hub, useSkin } from './ui/hub';
import { LEVELUP_TIP, Tutorial } from './ui/tutorial';
import { adAudio, adListeners, ads, adsOn } from './ads/ads';
adAudio.mute = () => audio.muteForAd(true);
adAudio.unmute = () => audio.muteForAd(false);
import { Stats, browserSaysNo } from './net/stats';
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

/** Where a player came from, for launch-channel comparisons: ?utm_source=… or ?src=… (short, lowercase). */
function utmSource(): string {
  const q = new URLSearchParams(location.search);
  return (q.get('utm_source') ?? q.get('src') ?? '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
}

class App {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  ui = document.getElementById('ui')!;
  profile = makeProfile();
  sync = new CloudSync(this.profile, syncAllowed());
  /** Anonymous gameplay stats (same rule as cloud save: never from test saves). */
  stats = new Stats(() => this.profile.playerId(), syncAllowed() && !new URLSearchParams(location.search).has('nostats'));
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

  /** Real frame time spent in live runs, for the run_end frame-rate figure. */
  private runFrames = 0;
  private runMs = 0;
  /** Active time since the last 'leave' event (the tab being visible counts, background doesn't). */
  private activeFrom = performance.now();
  private retreated = false;

  statsOn() {
    const s = this.profile.data.settings.stats;
    return s ?? !browserSaysNo();
  }

  constructor() {
    this.profile.adEcon = adsOn();
    this.stats.setOptOut(!this.statsOn());
    useSkin(this.profile.data.character);
    this.input.mode = this.profile.data.settings.controls ?? 'drag';
    this.profile.flushScores();
    const s = this.profile.data.settings;
    audio.setSfx(s.sfx);
    audio.setMusic(s.music);
    setHaptics(s.haptics);

    this.game = this.demoGame(this.profile.data.unlocked);
    this.renderer = want3d(s.graphics) ? new Renderer3D(this.canvas, this.game) : new Renderer(this.canvas, this.game);
    this.hud = new Hud(() => this.pause(), () => this.toggleSpeed());
    this.hub = new Hub(
      this.profile,
      (sec, mode) => this.startRun(sec, mode),
      () => this.openSettings(),
    );
    this.hub.onFeature = (name) => this.stats.feature(name);
    this.hub.onAscended = (rank, cores) => this.stats.track('unlock', { s: 0, d: { ascend: rank, cores } });
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
    this.trackSession();
    // cloud save: take a further-along save from another device (only between runs), else back up
    this.sync.onAdopted = () => this.reloadSynced();
    // ask the browser not to evict our storage under pressure (Chrome/Android honor this)
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
    if (this.profile.loadedFrom === 'backup') setTimeout(() => toast('Your save was damaged, so it was restored from a backup', '#ffd34d'), 800);
    void this.sync.startup(() => this.mode === 'hub');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.trackLeave();
        void this.sync.pushNow();
        void this.stats.flush(true);
      } else this.activeFrom = performance.now();
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
      this.tutorialOn = sector === 0 && !((this.profile.data.stars[0] ?? 0) & 4) && this.profile.rank() === 0;
      this.game = new Game(getChapter(sector, this.profile.rank()), base, Math.floor(Math.random() * 1e9), { ...defaultMods(), tutorial: this.tutorialOn });
      sub = `Sector ${sector + 1} · survive ${this.game.runLength >= 120 ? Math.round(this.game.runLength / 60) + ':00' : this.game.runLength + 's'}`;
      if (this.tutorialOn) sub = 'Training run · 2 minutes · follow the tips';
      if (this.profile.rank()) sub += ` · Ascension ${romanRank(this.profile.rank())}`;
      this.hud.startRun(this.profile.data.best[sector] ?? 0, 'campaign', 0, this.game.runLength);
    }
    this.speedOk = !adsOn() || this.profile.speedActive();
    this.hud.setSpeed(this.speed, !this.tutorialOn, this.speedOk);
    this.game.adRevive = adsOn();
    this.runFrames = this.runMs = 0;
    this.retreated = false;
    this.stats.track('run_start', { s: sector, m: mode, d: { gun: this.game.weapons[0]?.id, power: this.profile.power(), char: this.profile.data.character } });
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
    if (this.sync.needsReminder()) this.queueProtect();
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
          this.retreated = true;
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
    this.stats.feature('settings');
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
          this.profile.reset(); // remembers the old code: Settings → Cloud save → Undo a reset
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
        this.stats.allowedHere
          ? {
              on: this.statsOn(),
              toggle: () => {
                s.stats = !this.statsOn();
                this.profile.save();
                this.stats.setOptOut(!s.stats);
              },
            }
          : undefined,
      ),
      'settings',
    );
  }

  private trackSession() {
    const d = this.profile.data;
    let ref = '';
    try {
      ref = document.referrer ? new URL(document.referrer).hostname : '';
    } catch {
      /* ignore */
    }
    const ua = navigator.userAgent;
    this.stats.track('session', {
      d: {
        unlocked: d.unlocked,
        level: d.accountLevel,
        runs: d.stats.runs,
        isNew: d.stats.runs === 0,
        r: this.renderer instanceof Renderer3D ? '3d' : '2d',
        touch: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
        w: window.innerWidth,
        h: window.innerHeight,
        inApp: /FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(ua) ? 'facebook' : /; wv\)|WebView/i.test(ua) ? 'webview' : '',
        ref,
        src: utmSource(),
        days: this.profile.daysPlayed(),
      },
    });
    adListeners.push((placement, ok) => this.stats.track('ad', { d: { placement, stage: 'result', ok } }));
    window.addEventListener('error', (e) => this.stats.error(e.message, `${(e.filename || '').split('/').pop()}:${e.lineno}`));
    window.addEventListener('unhandledrejection', (e) => this.stats.error(String((e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason), 'promise'));
  }

  /** Show "Protect your progress" once nothing else is open (it waits behind the calendar etc.). */
  private queueProtect(tries = 0) {
    setTimeout(() => {
      if (this.mode !== 'hub' || !this.sync.needsReminder()) return;
      if (this.modal || this.hub.busy) return tries < 60 && this.queueProtect(tries + 1);
      this.showModal(protectModal(this.sync, () => this.closeModal()), 'protect');
    }, tries ? 1000 : 1200);
  }

  /** The player left (tab hidden or closed): how long they were active and where they stopped. */
  private trackLeave() {
    const secs = Math.round((performance.now() - this.activeFrom) / 1000);
    this.activeFrom = performance.now();
    if (secs < 2) return;
    this.stats.track('leave', {
      s: this.mode === 'run' ? this.sector : undefined,
      m: this.mode === 'run' ? this.runMode : undefined,
      d: {
        secs: Math.min(secs, 6 * 3600),
        at: this.modalFor === 'results' ? 'results' : this.mode === 'run' ? 'run' : this.modalFor || this.hub.tab,
        runT: this.mode === 'run' && this.modalFor !== 'results' ? Math.round(this.game.time) : undefined,
      },
    });
  }

  /** A rewarded-ad button was shown (for offer → watch rates). */
  private adOffer(placement: string) {
    this.stats.track('ad', { d: { placement, stage: 'offer' } });
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
    this.stats.track('run_end', {
      s: this.sector,
      m: mode,
      d: {
        won: r.won, time: Math.round(r.time), level: r.level, kills: r.kills, killedBy: r.killedBy ?? null, gun: g.weapons[0]?.id, evos: r.evolutions ?? 0, score: r.score ?? 0, revives: g.revivesUsed,
        retreat: this.retreated,
        fps: this.runMs > 0 ? Math.round((this.runFrames * 1000) / this.runMs) : null,
        r: this.renderer instanceof Renderer3D ? '3d' : '2d',
        speed: this.speed,
        power: this.profile.power(),
      },
    });
    this.retreated = false;
    if (rw.unlockedSector) this.stats.track('unlock', { s: this.profile.data.unlocked, d: { gun: rw.newGun ?? null, char: rw.newCharacter ?? null } });
    if (adsOn()) this.adOffer('double');
    void this.stats.flush();
    void this.sync.driveAuto();
    this.input.release();
    // After a first clear, land on the newly unlocked sector, ready to go.
    const goNext = rw.unlockedSector;
    const coach = !r.won ? this.profile.coach() : null;
    this.showModal(
      resultsModal(r, rw, mode === 'campaign' ? `Sector ${this.sector + 1} · ${g.chapter.name}` : mode === 'daily' ? `Daily Challenge · ${dailyChallenge().mods.map((m) => m.name).join(' + ')}` : 'Endless', () => this.backToHub(goNext), coach?.label ?? null, () => this.backToHub(false), adsOn() ? () => ads.showRewarded('double').then((ok) => (ok && this.profile.grantRunDouble(rw), ok)) : undefined),
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
              g.revives <= 0 && g.adRevive && (this.adOffer('revive'), true)
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

  /** Sim speed for the current run: the 1×/2× setting (never during the guided tutorial). */
  private get speed() {
    return this.mode === 'run' && !this.tutorialOn && this.speedOk && this.profile.data.settings.speed === 2 ? 2 : 1;
  }
  /**
   * 2× is free while ads are off. With ads on it's earned in the lobby (never mid-run), and it's
   * decided at the start of each run so it can't run out in the middle of one.
   */
  private speedOk = true;

  private toggleSpeed() {
    this.stats.feature('speed');
    const s = this.profile.data.settings;
    if (!this.speedOk) {
      audio.click();
      toast('Unlock 2× speed in the lobby: one short ad = 30 minutes', '#ffd34d');
      return;
    }
    s.speed = s.speed === 2 ? 1 : 2;
    this.profile.save();
    audio.click();
    haptic(10);
    this.hud.setSpeed(this.speed, !this.tutorialOn, this.speedOk);
  }

  /** Recording mode (scripts/admovie.mjs): the live loop stands still and filmFrame() drives it. */
  filming = false;

  /** While recording: per-frame sound events and kill count, for the ad soundtrack and counter. */
  filmLog: { t: number; kills: number; fx: Record<string, unknown>[] }[] | null = null;
  private filmT = 0;

  /**
   * Advance the run by exactly `dt` on the autopilot and draw one frame (for recording videos).
   * `hold` draws without advancing the sim (e.g. while the level-up card is on screen).
   */
  filmFrame(dt: number, hold = false) {
    const g = this.game;
    if (!hold) {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
        else if (g.state === 'chest') g.closeChest();
        else if (g.state === 'revive') g.revive(true);
        if (g.state !== 'play') continue;
        const [mx, my] = botMove(g);
        this.interp.capture(g);
        g.step(mx, my);
      }
    }
    if (this.filmLog) {
      const fx = g.fx
        .filter((e) => e.t !== 'dmg' && e.t !== 'arc' && e.t !== 'slash' && e.t !== 'shake' && e.t !== 'heal')
        .map((e) => ({ t: e.t, weapon: (e as { weapon?: string }).weapon, kind: (e as { kind?: string }).kind, text: (e as { text?: string }).text, color: (e as { color?: string }).color, big: (e as { big?: boolean }).big }));
      this.filmLog.push({ t: this.filmT, kills: g.kills, fx });
    }
    this.filmT += dt;
    this.interp.apply(g, hold ? 1 : Math.min(1, this.acc / DT));
    try {
      this.renderer.render(hold ? 0 : dt);
    } finally {
      this.interp.restore(g);
    }
    if (this.mode === 'run') this.hud.update(g, this.renderer.fx.banners);
  }

  private frame = (now: number) => {
    if (this.filming) {
      this.last = now;
      requestAnimationFrame(this.frame);
      return;
    }
    // rAF timestamps can predate a performance.now() stored mid-frame (e.g. on resume): never step backwards
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    if (this.mode === 'run' && !this.paused && this.game.state === 'play') {
      this.renderer.adapt(now - this.last);
      if (now - this.last < 250) (this.runFrames++, (this.runMs += now - this.last));
    }
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
        // 2× speed just runs the same fixed-step sim twice as often: same rules, same results
        const sp = this.speed;
        this.acc += dt * sp;
        let n = 0;
        while (this.acc >= DT && n < 6 * sp && g.state === 'play') {
          this.acc -= DT;
          const [mx, my] = this.input.read();
          this.interp.capture(g);
          g.step(mx, my);
          n++;
        }
        if (n >= 6 * sp) this.acc = 0;
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
      // effects and animations keep pace with the sim
      this.renderer.render(frozen ? 0 : dt * (this.mode === 'run' ? this.speed : 1));
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
  /** The synthesizer class, so the ad recorder can render a run's sound offline. */
  Audio,
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
