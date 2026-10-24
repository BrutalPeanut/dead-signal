/**
 * Headless balance runner: plays N bot runs per sector at a given gear power and reports
 * survival time, level, kills and win rate. Usage: npm run sim -- [runs] [atk] [hp]
 */
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { botChoose, botMove } from '../src/sim/bot';
import type { BaseStats } from '../src/sim/types';

const runs = Number(process.argv[2] ?? 6);
const atk = Number(process.argv[3] ?? 20);
const hp = Number(process.argv[4] ?? 200);
const chapters = (process.argv[5] ?? '0').split(',').map(Number);

function base(): BaseStats {
  return {
    atk, hp, def: 0, crit: 0.05, critMul: 1.5, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1,
    rerolls: 2, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0,
  };
}

for (const ci of chapters) {
  const ch = getChapter(ci);
  const res: string[] = [];
  let wins = 0;
  let tsum = 0;
  const t0 = performance.now();
  for (let r = 0; r < runs; r++) {
    const g = new Game(ch, base(), 1000 + r * 7919);
    let steps = 0;
    let maxEnemies = 0;
    while (g.state !== 'dead' && g.state !== 'won' && steps < 60 * 60 * 13) {
      if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
      else if (g.state === 'chest') g.closeChest();
      else if (g.state === 'revive') g.revive(true);
      const [mx, my] = botMove(g);
      g.step(mx, my);
      g.fx.length = 0;
      steps++;
      if (g.enemies.length > maxEnemies) maxEnemies = g.enemies.length;
    }
    if (g.state === 'won') wins++;
    tsum += g.time;
    const evo = g.weapons.filter((w) => w.evolved).map((w) => w.id).join('+') || '-';
    res.push(`  run ${r}: ${g.state.padEnd(4)} t=${g.time.toFixed(0).padStart(3)}s L${g.level} kills=${g.kills} gold=${g.gold} maxE=${maxEnemies} weapons=${g.weapons.map((w) => w.id + w.level).join(',')} evo=${evo}`);
  }
  console.log(`Sector ${ci + 1} "${ch.name}" atk=${atk} hp=${hp}: win ${wins}/${runs}, avg survive ${(tsum / runs).toFixed(0)}s  (${((performance.now() - t0) / 1000).toFixed(1)}s wall)`);
  console.log(res.join('\n'));
}
