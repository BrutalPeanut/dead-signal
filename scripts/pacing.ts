/**
 * Pacing analytics: plays runs with a human-ish bot and reports, per minute: level-ups, enemies on
 * screen, damage taken, HP low point; plus boss fight durations and dead-air stretches.
 * Usage: npm run pacing -- [runs] [sector] [atk] [hp]
 */
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { botChoose, humanMove } from '../src/sim/bot';
import type { BaseStats } from '../src/sim/types';

const runs = Number(process.argv[2] ?? 8);
const sector = Number(process.argv[3] ?? 0);
const atk = Number(process.argv[4] ?? 20);
const hp = Number(process.argv[5] ?? 180);

const mins = 11;
const lv = new Array(mins).fill(0);
const onScreen = new Array(mins).fill(0);
const taken = new Array(mins).fill(0);
const lowHp = new Array(mins).fill(1);
const samples = new Array(mins).fill(0);
const bossDur: string[] = [];
let wins = 0;
let deadAir = 0;
let gaps: number[] = [];
const deaths: number[] = [];

for (let r = 0; r < runs; r++) {
  const base: BaseStats = { atk, hp, def: 0, crit: 0.05, critMul: 1.5, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1, rerolls: 1, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0 };
  const g = new Game(getChapter(sector), base, 777 + r * 31);
  let lastLevel = 1;
  let lastLvT = 0;
  let bossStart = -1;
  let lastHp = g.hp;
  let quiet = 0;
  while (g.state !== 'dead' && g.state !== 'won' && g.time < 700) {
    if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
    else if (g.state === 'chest') g.closeChest();
    const [mx, my] = humanMove(g);
    g.step(mx, my);
    g.fx.length = 0;
    const m = Math.min(mins - 1, Math.floor(g.time / 60));
    if (g.level > lastLevel) {
      lv[m] += g.level - lastLevel;
      gaps.push(g.time - lastLvT);
      lastLvT = g.time;
      lastLevel = g.level;
    }
    if (g.hp < lastHp) taken[m] += lastHp - g.hp;
    lastHp = g.hp;
    lowHp[m] = Math.min(lowHp[m], g.hp / g.maxHp);
    let vis = 0;
    for (const e of g.enemies) if (Math.abs(e.x - g.px) < g.viewW && Math.abs(e.y - g.py) < g.viewH) vis++;
    onScreen[m] += vis;
    samples[m]++;
    if (vis < 4 && !g.boss) quiet += 1 / 60;
    else {
      if (quiet > 4) deadAir += quiet;
      quiet = 0;
    }
    if (g.boss && bossStart < 0) bossStart = g.time;
    if (!g.boss && bossStart >= 0) {
      bossDur.push(`${(g.time - bossStart).toFixed(1)}s@${Math.round(bossStart)}`);
      bossStart = -1;
    }
  }
  if (g.state === 'won') wins++;
  else deaths.push(Math.round(g.time));
}

gaps.sort((a, b) => a - b);
console.log(`Sector ${sector + 1}, atk ${atk} hp ${hp}, human-ish bot: win ${wins}/${runs}; deaths at ${deaths.join(', ') || '-'}s`);
console.log('min | level-ups | avg on screen | dmg taken/run | lowest HP');
for (let m = 0; m < mins; m++) {
  if (!samples[m]) continue;
  console.log(`${String(m).padStart(3)} | ${(lv[m] / runs).toFixed(1).padStart(9)} | ${(onScreen[m] / samples[m]).toFixed(0).padStart(13)} | ${(taken[m] / runs).toFixed(0).padStart(13)} | ${(lowHp[m] * 100).toFixed(0)}%`);
}
console.log(`level-up gap: median ${gaps[Math.floor(gaps.length / 2)]?.toFixed(1)}s, p90 ${gaps[Math.floor(gaps.length * 0.9)]?.toFixed(1)}s, max ${gaps.at(-1)?.toFixed(1)}s`);
console.log(`boss fights: ${bossDur.join(', ')}`);
console.log(`dead air (>4s with <4 enemies on screen): ${(deadAir / runs).toFixed(1)}s per run`);
