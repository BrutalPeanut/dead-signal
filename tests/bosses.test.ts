import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import type { BaseStats } from '../src/sim/types';

// a weak, unkillable courier that can't kill the mid-boss before the final whistle
const base: BaseStats = {
  atk: 0.0001, hp: 1e9, def: 0, crit: 0, critMul: 1, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1,
  rerolls: 0, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0,
};

function advanceTo(g: Game, seconds: number) {
  while (g.time < seconds && g.state !== 'dead' && g.state !== 'won') {
    if (g.state === 'levelup') g.choose(0);
    else if (g.state === 'chest') g.closeChest();
    g.step(0, 0);
    g.fx.length = 0;
  }
}

const bosses = (g: Game) => g.enemies.filter((e) => e.alive && e.kind === 'boss');

describe('boss fights', () => {
  it('never runs two bosses at once when the mid-boss outlives the run clock', () => {
    const g = new Game(getChapter(13), base, 7);
    advanceTo(g, g.runLength + 20);
    expect(g.midBossSpawned).toBe(true);
    // the mid-boss is still up: the final boss waits, and the arena + health bar stay with it
    expect(bosses(g).length).toBe(1);
    expect(g.finalBossSpawned).toBe(false);
    expect(g.boss).toBe(bosses(g)[0]);
    expect(g.cage).not.toBeNull();
    // kill the mid-boss: the final boss arrives next step, with its own cage and bar
    g.killEnemy(g.boss!, true);
    if (g.state === 'chest') g.closeChest();
    g.step(0, 0);
    expect(g.finalBossSpawned).toBe(true);
    expect(bosses(g).length).toBe(1);
    expect(g.boss).not.toBeNull();
    expect(g.cage).not.toBeNull();
  });

  it('keeps the cage and health bar while any boss is still alive', () => {
    const g = new Game(getChapter(13), base, 7);
    advanceTo(g, g.runLength + 1);
    const first = g.boss!;
    // force the old overlap (two bosses) and kill one of them
    (g as any).spawnBoss('warden', false);
    expect(bosses(g).length).toBe(2);
    g.killEnemy(first, true);
    expect(bosses(g).length).toBe(1);
    expect(g.boss).toBe(bosses(g)[0]);
    expect(g.cage).not.toBeNull();
  });
});
