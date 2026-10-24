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
