import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import type { BaseStats } from '../src/sim/types';

// a weak, unkillable courier that can't kill the mid-boss before the final whistle
const base: BaseStats = {
  atk: 0.0001, hp: 1e9, def: 0, crit: 0, critMul: 1, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1,
  rerolls: 0, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0,
};

/**
 * Jump straight to the situation instead of simulating five minutes (which took ~2 s per test and
 * flaked on slower CI runners): mid-boss up, clock at the final whistle.
 */
function midBossAtFinalWhistle() {
  const g = new Game(getChapter(13), base, 7);
  g.step(0, 0);
  g.midBossSpawned = true;
  (g as any).spawnBoss(g.chapter.midBoss, true);
  g.time = g.runLength + 1;
  for (let i = 0; i < 120; i++) {
    if (g.state === 'levelup') g.choose(0);
    else if (g.state === 'chest') g.closeChest();
    g.step(0, 0);
    g.fx.length = 0;
  }
  return g;
}

const bosses = (g: Game) => g.enemies.filter((e) => e.alive && e.kind === 'boss');

describe('boss fights', () => {
  it('never runs two bosses at once when the mid-boss outlives the run clock', () => {
    const g = midBossAtFinalWhistle();
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
    const g = midBossAtFinalWhistle();
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
