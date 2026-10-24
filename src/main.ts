import './style.css';
import { audio } from './audio';
import { Input } from './input';
import { Profile } from './meta/profile';
import { Renderer } from './render/renderer';
import { botChoose, botMove } from './sim/bot';
import { getChapter } from './sim/chapters';
import { DT, Game } from './sim/game';
import type { BaseStats, FxEvent } from './sim/types';
import { haptic, setHaptics } from './ui/dom';
import { Hub } from './ui/hub';
import { Hud, chestModal, levelUpModal, pauseModal, reviveModal } from './ui/hud';
import { introModal, resultsModal, settingsModal } from './ui/screens';

type Mode = 'hub' | 'run';

class App {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  ui = document.getElementById('ui')!;
  profile = new Profile();
  input = new Input(this.canvas);
  mode: Mode = 'hub';
  game: Game;
  renderer: Renderer;
  hud: Hud;
  hub: Hub;
  sector = 0;
  paused = false;
  modal: HTMLElement | null = null;
  modalFor = '';
  private acc = 0;
  private last = performance.now();
  private endT = -1;

  constructor() {
    const s = this.profile.data.settings;
    audio.setSfx(s.sfx);
    audio.setMusic(s.music);
    setHaptics(s.haptics);

    this.game = this.demoGame(this.profile.data.unlocked);
    this.renderer = new Renderer(this.canvas, this.game);
    this.hud = new Hud(() => this.pause());
    this.hub = new Hub(
      this.profile,
      (sec) => this.startRun(sec),
      () => this.openSettings(),
    );
    this.ui.append(this.hub.el);

    window.addEventListener('resize', () => this.renderer.resize());
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
    g.time = 60;
    return g;
  }

  startRun(sector: number) {
    audio.unlock();
    this.sector = sector;
    this.mode = 'run';
    this.endT = -1;
    const base = this.profile.baseStats();
    // Sector 1 is the training ground: one free revive so first-timers can bank a win.
    if (sector === 0) base.revives += 1;
    this.game = new Game(getChapter(sector), base, Math.floor(Math.random() * 1e9));
    this.hud.startRun(this.profile.data.best[sector] ?? 0);
    this.renderer.setGame(this.game);
    this.renderer.fx.parts.length = 0;
    this.renderer.fx.decals.length = 0;
    this.renderer.fx.banners.length = 0;
    this.renderer.fx.banners.push({ text: getChapter(sector).name.toUpperCase(), sub: `Sector ${sector + 1} · survive 10:00`, color: '#5ef2ff', t: 2.6 });
    this.hub.el.remove();
    this.hub.closeModal();
    this.ui.append(this.hud.el);
    this.input.enabled = true;
    this.input.moved = false;
    audio.bossMode = false;
    audio.intensity = 0;
  }

  private backToHub() {
    this.closeModal();
    this.hud.el.remove();
    this.mode = 'hub';
    this.paused = false;
    this.hub.sector = Math.min(this.profile.data.unlocked, Math.max(this.sector, this.hub.sector));
    this.hub.tab = 'deploy';
    this.hub.refresh();
    this.ui.append(this.hub.el);
    this.game = this.demoGame(this.hub.sector);
    this.renderer.setGame(this.game);
    audio.bossMode = false;
    audio.intensity = 0.2;
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
      ),
      'pause',
    );
  }

  resume() {
    this.paused = false;
    this.closeModal();
    this.last = performance.now();
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
          location.reload();
        },
        () => this.closeModal(),
      ),
      'settings',
    );
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
    const rw = this.profile.applyRun(this.sector, r);
    this.input.release();
    this.showModal(resultsModal(r, rw, `Sector ${this.sector + 1} · ${g.chapter.name}`, () => this.backToHub()), 'results');
    if (r.won) audio.evolve();
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
        else if (g.state !== 'play' || g.time > 560) {
          this.game = this.demoGame(this.hub.sector);
          this.renderer.setGame(this.game);
          break;
        }
        const [mx, my] = botMove(g);
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
          g.step(mx, my);
          n++;
        }
        if (n >= 6) this.acc = 0;
      } else this.acc = 0;
      audio.intensity = Math.min(1, g.time / 480);
      audio.bossMode = !!g.boss;
      this.syncRunUi();
      if (this.endT >= 0) {
        this.endT -= dt;
        if (this.endT < 0 && this.modalFor !== 'results') this.finishRun();
      }
    }

    this.playSounds(this.game.fx);
    this.renderer.joystick = this.mode === 'run' ? this.input.stick : null;
    this.renderer.render(this.mode === 'run' && (this.paused || this.game.state !== 'play') ? 0 : dt);
    if (this.mode === 'run') {
      this.hud.update(this.game, this.renderer.fx.banners);
      this.hud.showHint(!this.input.moved && this.game.time < 12 && this.profile.data.stats.runs < 3);
    }
    requestAnimationFrame(this.frame);
  };
}

const app = new App();

// Test hook (used by the screenshot/playtest scripts): fast-forward the current run with the autopilot.
(window as any).__ds = {
  app,
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
