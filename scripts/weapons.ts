/**
 * Weapon balance lab: each weapon alone at Lv5 (and evolved), same sector/time/seed, autopilot movement.
 * Reports effective DPS (overkill excluded), kills and damage taken. Usage: npm run weapons -- [seconds] [seeds]
 */
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { botMove } from '../src/sim/bot';
import { WEAPON_IDS, type WeaponId } from '../src/sim/data';
import type { BaseStats } from '../src/sim/types';

const secs = Number(process.argv[2] ?? 60);
const seeds = Number(process.argv[3] ?? 4);
const base: BaseStats = {
  atk: 40, hp: 1e9, def: 0, crit: 0.05, critMul: 1.5, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1,
  rerolls: 0, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0,
};

function lab(id: WeaponId, evolved: boolean, seed: number) {
  const g = new Game(getChapter(1), base, seed);
  g.weapons.length = 0;
  g.addWeapon(id);
  g.weapons[0].level = 5;
  g.weapons[0].evolved = evolved;
  g.time = 300; // mid-run enemy mix/HP
  g.midBossSpawned = true;
  (g as any).hordeIdx = 99;
  (g as any).eliteIdx = 99;
  const hp0 = g.hp;
  for (let i = 0; i < secs * 60; i++) {
    if (g.state === 'levelup' || g.state === 'chest') { g.offers = []; g.state = 'play'; g.pendingLevels = 0; g.pendingChests.length = 0; }
    const [mx, my] = botMove(g);
    g.step(mx, my);
    g.fx.length = 0;
  }
  return { dps: (g.dmgBy[id] ?? 0) / secs, kills: g.kills, taken: hp0 - g.hp };
}

const rows: [string, number, number, number, number][] = [];
for (const id of WEAPON_IDS) {
  for (const evo of [false, true]) {
    let dps = 0, kills = 0, taken = 0;
    for (let s = 0; s < seeds; s++) {
      const r = lab(id, evo, 100 + s);
      dps += r.dps; kills += r.kills; taken += r.taken;
    }
    rows.push([id + (evo ? '*' : ''), dps / seeds, kills / seeds, taken / seeds, 0]);
  }
}
const med = (arr: number[]) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
for (const evo of [false, true]) {
  const set = rows.filter((r) => r[0].endsWith('*') === evo);
  const m = med(set.map((r) => r[1]));
  console.log(evo ? '\nEVOLVED' : 'BASE Lv5');
  for (const r of set.sort((a, b) => b[1] - a[1]))
    console.log(`  ${r[0].padEnd(8)} dps=${r[1].toFixed(0).padStart(6)}  (${((r[1] / m) * 100).toFixed(0).padStart(3)}% of median)  kills=${r[2].toFixed(0).padStart(5)}  dmgTaken=${r[3].toFixed(0)}`);
}
