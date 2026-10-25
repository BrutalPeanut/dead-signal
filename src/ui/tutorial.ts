import type { Game } from '../sim/game';
import { starTimes } from '../sim/data';
import { h } from './dom';

/**
 * First-run coach for Sector 1. Short, one-at-a-time tips triggered by what is actually happening
 * (first gems, first elite, getting surrounded, low health, first boss), with an in-world marker
 * on the thing the tip is about. Teaches the three habits that keep new players alive:
 * keep moving, collect shards, step out of red zones.
 */
interface Tip {
  id: string;
  text: string;
  icon: string;
  until: number; // seconds of run time the tip stays (or until its done-condition)
  done?: (g: Game) => boolean;
  target?: (g: Game) => { x: number; y: number } | null;
  hand?: boolean;
}

export class Tutorial {
  el: HTMLElement;
  private text: HTMLElement;
  private icon: HTMLElement;
  private hand: HTMLElement;
  private cur: Tip | null = null;
  private shown = new Set<string>();
  private surroundCount = 0;
  private surroundCd = 0;
  private wall = 0;
  target: { x: number; y: number } | null = null;

  constructor() {
    this.text = h('span.tt-text');
    this.icon = h('span.tt-ico');
    this.hand = h('div.hand');
    this.el = h('div.tut', this.icon, this.hand, this.text);
  }

  reset() {
    this.cur = null;
    this.shown.clear();
    this.surroundCount = 0;
    this.surroundCd = 0;
    this.wall = 0;
    this.target = null;
    this.el.classList.remove('on');
  }

  private show(t: Tip, g: Game) {
    this.shown.add(t.id);
    this.cur = { ...t, until: g.time + t.until };
    this.text.textContent = t.text;
    this.icon.textContent = t.icon;
    this.hand.style.display = t.hand ? '' : 'none';
    this.el.classList.add('on');
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }

  private nearest(g: Game, pred: (p: Game['pickups'][number]) => boolean) {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const p of g.pickups) {
      if (!p.alive || !pred(p)) continue;
      const d = (p.x - g.px) ** 2 + (p.y - g.py) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  update(g: Game, dt: number) {
    this.wall += dt;
    if (g.state !== 'play') return;
    this.surroundCd -= dt;

    // 0: nothing moves until you do
    if (g.waitingForMove) {
      if (this.cur?.id !== 'move') this.show({ id: 'move', icon: '👆', text: 'Drag anywhere to move. Try it!', until: 1e9, hand: true }, g);
      this.target = null;
      return;
    }

    const tips: Tip[] = [];
    const urgent: Tip[] = [];
    // crowding: the #1 way new players die is standing still
    const near = g.enemies.filter((e) => e.alive && e.kind !== 'boss' && (e.x - g.px) ** 2 + (e.y - g.py) ** 2 < 75 * 75).length;
    if (near >= 6 && this.surroundCount < 3 && this.surroundCd <= 0 && g.time > 8) {
      this.surroundCount++;
      this.surroundCd = 14;
      urgent.push({ id: 'surround' + this.surroundCount, icon: '⚠️', text: "You're getting surrounded! Keep moving: run around them, not into them.", until: 3.5 });
    }
    if (g.hp / g.maxHp < 0.45 && !this.shown.has('lowhp')) {
      urgent.push({
        id: 'lowhp', icon: '❤️', text: 'Low health! You heal slowly over time. Supply drops can hold a ration.', until: 6,
        target: (gg) => this.nearest(gg, (p) => p.kind === 'ration'),
      });
    }
    if (g.boss && !this.shown.has('boss')) {
      urgent.push({ id: 'boss', icon: '🎯', text: 'Boss fight! Red areas show where attacks will land. Step out before they fill.', until: 8, target: (gg) => (gg.boss ? { x: gg.boss.x, y: gg.boss.y } : null) });
    }

    if (!this.shown.has('auto')) tips.push({ id: 'auto', icon: '🔫', text: 'Your blaster aims and fires by itself. Just keep your distance!', until: 5 });
    else if (!this.shown.has('gems') && g.level === 1 && g.pickups.some((p) => p.alive && p.kind === 'xp')) {
      tips.push({
        id: 'gems', icon: '💎', text: 'Walk over the green shards to level up!', until: 14,
        done: (gg) => gg.level >= 2,
        target: (gg) => this.nearest(gg, (p) => p.kind === 'xp'),
      });
    } else if (!this.shown.has('circle') && g.time > 28) {
      tips.push({ id: 'circle', icon: '🔄', text: 'Move in big circles around the horde. Standing still gets you surrounded.', until: 7 });
    }
    const drop = g.pickups.find((p) => p.alive && (p.kind === 'ration' || p.kind === 'magnet' || p.kind === 'emp') && p.drop <= 0);
    if (drop && !this.shown.has('drop')) {
      tips.push({ id: 'drop', icon: '📦', text: 'Supply drop! Walk over it: health, a magnet, or a bomb.', until: 7, done: () => !drop.alive, target: () => (drop.alive ? { x: drop.x, y: drop.y } : null) });
    }
    const spitter = g.enemies.find((e) => e.alive && e.kind === 'spitter');
    if (spitter && !this.shown.has('spitter')) {
      tips.push({ id: 'spitter', icon: '🟢', text: 'Spitters lob acid where you stand. Keep moving and it misses!', until: 6, target: () => (spitter.alive ? { x: spitter.x, y: spitter.y } : null) });
    }
    const elite = g.enemies.find((e) => e.alive && e.elite);
    if (elite && !this.shown.has('elite')) {
      tips.push({ id: 'elite', icon: '⭐', text: 'Gold elite! Defeat it for a treasure chest.', until: 7, done: () => !elite.alive, target: () => (elite.alive ? { x: elite.x, y: elite.y } : null) });
    }
    if (g.time >= starTimes(g.runLength)[0] - 2 && !this.shown.has('half')) tips.push({ id: 'half', icon: '★', text: "Halfway there! That's your first star.", until: 4 });

    const cur = this.cur;
    const curDone = !cur || cur.id === 'move' || g.time >= cur.until || (cur.done?.(g) ?? false);
    const next = urgent[0] ?? (curDone ? tips[0] : undefined);
    if (next && (curDone || urgent.length)) this.show(next, g);
    else if (curDone && cur) {
      this.cur = null;
      this.el.classList.remove('on');
    }
    this.target = this.cur?.target?.(g) ?? null;
  }
}

/** Shown on the first level-up cards during the tutorial. */
export const LEVELUP_TIP = 'Pick one! A = attack (new weapons fire on their own). S = support (boosts your weapons). 🔗 Each weapon pairs with one support: max the weapon while holding its partner to evolve it.';
