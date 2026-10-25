import { describe, expect, it } from 'vitest';
import { dailyChallenge, defaultMods, modsFor } from '../src/sim/modes';
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';

const kit = { atk: 400, hp: 99999, def: 0.5, crit: 0.1, critMul: 1.5, moveSpeed: 92, pickup: 52, healMul: 1, goldMul: 1, rerolls: 1, revives: 0, startWeapon: 'pistol' as const, startLevels: 0, regen: 0 };

describe('modes', () => {
  it('daily challenge is identical for everyone on a date and changes day to day', () => {
    const a = dailyChallenge(new Date(2026, 9, 24, 9));
    const b = dailyChallenge(new Date(2026, 9, 24, 22));
    const c = dailyChallenge(new Date(2026, 9, 25, 9));
    expect(a.seed).toBe(b.seed);
    expect(a.mods.map((m) => m.id)).toEqual(b.mods.map((m) => m.id));
    expect(a.seed).not.toBe(c.seed);
    expect(a.midBoss).not.toBe(a.finalBoss);
  });

  it('modifiers fold into the run (extra weapons, player stats)', () => {
    const m = defaultMods('daily');
    m.extraWeapons.push('frag');
    m.playerHp = 0.5;
    const g = new Game(getChapter(2), kit, 1, m);
    expect(g.weapons.map((w) => w.id)).toContain('frag');
    expect(g.maxHp).toBe(Math.round(kit.hp * 0.5));
    expect(modsFor(dailyChallenge(new Date(2026, 9, 24))).mode).toBe('daily');
  });

  it('endless keeps going past 5:00 with repeating bosses and no win', () => {
    const g = new Game(getChapter(0), kit, 3, defaultMods('endless'));
    let bossesSeen = 0;
    let wasBoss = false;
    for (let i = 0; i < 60 * 470 && g.state !== 'dead'; i++) {
      if (g.state === "levelup") g.choose(0);
      else if (g.state === 'chest') g.closeChest();
      g.step(0, 0);
      if (g.boss && !wasBoss) bossesSeen++;
      wasBoss = !!g.boss;
      // keep the immortal test pilot from being overwhelmed: clear the boss quickly
      if (g.boss && g.boss.hp > 1) g.boss.hp = 1;
      g.fx.length = 0;
    }
    expect(g.state).not.toBe('won');
    expect(g.time).toBeGreaterThan(400);
    expect(bossesSeen).toBeGreaterThanOrEqual(2);
    expect(g.result().time).toBeGreaterThan(300);
  });
});

describe('act II', () => {
  it('has 20 sectors with the Broadcaster closing Act II and a gentler curve', async () => {
    const { CHAPTER_COUNT } = await import('../src/sim/chapters');
    expect(CHAPTER_COUNT).toBe(20);
    expect(getChapter(10).finalBoss).toBe('broadcaster');
    expect(getChapter(10).biome).toBe('reactor');
    const step = getChapter(15).hpMul / getChapter(14).hpMul;
    expect(step).toBeLessThan(1.15);
  });

  it('Broadcaster cycles beams, seekers and a blink without breaking the run', () => {
    const g = new Game(getChapter(10), kit, 9, defaultMods());
    (g as any).spawnBoss('broadcaster', false);
    let lines = 0, homing = 0, moved = 0;
    let last = [g.boss!.x, g.boss!.y];
    for (let i = 0; i < 60 * 25 && g.boss; i++) {
      if (g.state === 'levelup') g.choose(0);
      g.step(0.3, 0.2);
      lines = Math.max(lines, g.telegraphs.filter((t) => t.kind === 'line').length);
      homing = Math.max(homing, g.shots.filter((s) => s.home).length);
      const d = Math.hypot(g.boss!.x - last[0], g.boss!.y - last[1]);
      if (d > 20) moved++;
      last = [g.boss!.x, g.boss!.y];
      g.boss!.hp = g.boss!.maxHp; // keep it alive to see the whole loop
      g.fx.length = 0;
    }
    expect(lines).toBeGreaterThanOrEqual(4);
    expect(homing).toBeGreaterThanOrEqual(3);
    expect(moved).toBeGreaterThanOrEqual(1); // the blink teleport
  });
});

describe('sector 1 training run', () => {
  it('is 2 minutes, waits for the first move in tutorial mode, and awards stars on its own clock', async () => {
    const { Profile } = await import('../src/meta/profile');
    class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }
    const g = new Game(getChapter(0), kit, 1, { ...defaultMods(), tutorial: true });
    expect(g.runLength).toBe(120);
    for (let i = 0; i < 120; i++) g.step(0, 0);
    expect(g.time).toBe(0); // frozen until the player moves
    for (let i = 0; i < 120; i++) g.step(1, 0);
    expect(g.time).toBeGreaterThan(0);
    expect(new Game(getChapter(1), kit, 1).runLength).toBe(300);
    const p = new Profile(new Mem() as unknown as Storage);
    p.applyRun(0, { won: false, time: 100, kills: 10, gold: 0, level: 5, bossKills: 0, eliteKills: 0, score: 1 });
    expect(p.data.stars[0]).toBe(3); // 1:00 and 1:36 stars
  });
});

describe('starter kit', () => {
  it('Sectors 1-2 offer 3+3 slots from a small weapon pool; Sector 4+ is the full 6+6', async () => {
    const { STARTER_WEAPONS } = await import('../src/sim/data');
    const g = new Game(getChapter(1), kit, 5);
    expect(g.loadout.maxW).toBe(3);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      (g as any).openLevelUp?.();
      for (const o of g.offers) if (o.type === 'weapon' && o.isNew) seen.add(o.id);
      g.state = 'play';
    }
    for (const id of seen) expect(STARTER_WEAPONS).toContain(id);
    expect(new Game(getChapter(3), kit, 5).loadout.maxW).toBe(6);
    expect(new Game(getChapter(1), kit, 5, defaultMods('daily')).loadout.maxW).toBe(6);
  });
});

describe('pickups', () => {
  it('magnet pulls shards straight in: distance to the courier only ever shrinks', () => {
    const g = new Game(getChapter(1), kit, 2);
    g.enemies.length = 0;
    const gem = g.addPickup('xp', g.px + 300, g.py + 40, 1);
    g.addPickup('magnet', g.px, g.py, 0);
    let last = Infinity;
    for (let i = 0; i < 120 && gem.alive; i++) {
      g.step(i % 40 < 20 ? 1 : -1, 0.5); // courier keeps moving around
      const d = Math.hypot(gem.x - g.px, gem.y - g.py);
      if (gem.alive) expect(d).toBeLessThanOrEqual(last + 92 / 60 + 0.01); // can only lag by the courier's own step
      last = d;
    }
    expect(gem.alive).toBe(false);
  });
});
