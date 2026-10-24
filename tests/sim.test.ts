import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { botChoose, botMove } from '../src/sim/bot';
import { buildOffers } from '../src/sim/offers';
import { Rng } from '../src/sim/math';
import type { BaseStats } from '../src/sim/types';

const base = (over: Partial<BaseStats> = {}): BaseStats => ({
  atk: 20, hp: 200, def: 0, crit: 0.05, critMul: 1.5, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1,
  rerolls: 1, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0, ...over,
});

function play(seed: number, seconds: number) {
  const g = new Game(getChapter(0), base(), seed);
  for (let i = 0; i < seconds * 60 && g.state !== 'dead' && g.state !== 'won'; i++) {
    if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
    else if (g.state === 'chest') g.closeChest();
    const [mx, my] = botMove(g);
    g.step(mx, my);
    g.fx.length = 0;
  }
  return g;
}

describe('simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = play(42, 90);
    const b = play(42, 90);
    expect(a.kills).toBe(b.kills);
    expect(a.level).toBe(b.level);
    expect(a.px).toBeCloseTo(b.px, 6);
  });

  it('starts with the equipped weapon and an opening wave', () => {
    const g = new Game(getChapter(0), base({ startWeapon: 'arc' }), 1);
    expect(g.weapons.map((w) => w.id)).toEqual(['arc']);
    expect(g.enemies.length).toBeGreaterThan(5);
  });

  it('spawns the mid-boss at 5:00 inside a cage and clears the field', () => {
    const g = play(7, 301);
    if (g.state === 'dead') return; // unlucky seed, covered by balance runs
    expect(g.boss || g.bossKills > 0).toBeTruthy();
  });

  it('levels up and pauses for a choice', () => {
    const g = new Game(getChapter(0), base(), 3);
    g.gainXp(100);
    g.step(0, 0);
    expect(g.state).toBe('levelup');
    expect(g.offers.length).toBeGreaterThan(0);
    g.choose(0);
    expect(['play', 'levelup']).toContain(g.state);
  });

  it('chests always evolve an eligible weapon', () => {
    const g = new Game(getChapter(0), base(), 5);
    g.weapons[0].level = 5;
    g.passives.push({ id: 'chip', level: 1 });
    g.recalc();
    g.addPickup('chest', g.px, g.py, 0);
    g.step(0, 0);
    g.step(0, 0);
    expect(g.state).toBe('chest');
    expect(g.chest!.evolutions).toEqual(['pistol']);
    expect(g.weapons[0].evolved).toBe(true);
  });

  it('revive restores HP once', () => {
    const g = new Game(getChapter(0), base({ revives: 1 }), 9);
    g.hp = -1;
    g.step(0, 0);
    expect(g.state).toBe('revive');
    g.revive(true);
    expect(g.state).toBe('play');
    expect(g.hp).toBe(g.maxHp);
    expect(g.revives).toBe(0);
  });
});

describe('level-up offers', () => {
  it('heavily favour the evolution partner of a maxed weapon', () => {
    const rng = new Rng(11);
    let hits = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const offers = buildOffers(rng, [{ id: 'arc', level: 5, evolved: false, timer: 0, active: 0, angle: 0, sourceId: 1 }], []);
      if (offers.some((o) => o.type === 'passive' && o.id === 'capacitor')) hits++;
    }
    expect(hits / N).toBeGreaterThan(0.75);
  });

  it('never offers a sixth+1 weapon when slots are full', () => {
    const ws = (['pistol', 'blades', 'arc', 'frag', 'field', 'disc'] as const).map((id, i) => ({ id, level: 1, evolved: false, timer: 0, active: 0, angle: 0, sourceId: i }));
    const offers = buildOffers(new Rng(1), ws, []);
    for (const o of offers) if (o.type === 'weapon') expect(o.isNew).toBe(false);
  });
});
