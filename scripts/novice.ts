/**
 * "First-time player" bot for Sector 1: reacts late, often stands still, ignores pickups, takes the
 * first card. Compares the tutorial run against the old Sector 1. npx tsx scripts/novice.ts
 */
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { Profile } from '../src/meta/profile';
import { defaultMods } from '../src/sim/modes';
import { Rng } from '../src/sim/math';
class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }

function novice(g: Game, rng: Rng, st: { dir: [number, number]; t: number; idle: boolean }): [number, number] {
  st.t -= 1 / 60;
  if (st.t <= 0) {
    st.t = rng.range(0.6, 1.4); // slow to react
    st.idle = rng.chance(Number(process.env.IDLE ?? 0.4)); // often just stands there watching
    // flee the local crowd's centre (roughly), with a lot of error
    let cx = 0, cy = 0, n = 0;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const d2 = (e.x - g.px) ** 2 + (e.y - g.py) ** 2;
      if (d2 < 160 * 160) { cx += e.x; cy += e.y; n++; }
    }
    if (n) {
      const a = Math.atan2(g.py - cy / n, g.px - cx / n) + rng.range(-1, 1);
      st.dir = [Math.cos(a), Math.sin(a)];
    } else st.dir = [0, 0];
  }
  return st.idle ? [0, 0] : st.dir;
}

const SECTOR = Number(process.env.SECTOR ?? 0);
for (const tutorial of SECTOR === 0 ? [false, true] : [false]) {
  const out: string[] = [];
  let wins = 0, star = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const p = new Profile(new Mem() as unknown as Storage);
    const base = p.baseStats();
    if (SECTOR === 0) base.revives += 1;
    const g = new Game(getChapter(SECTOR), base, seed, { ...defaultMods(), tutorial });
    const rng = new Rng(seed * 99);
    const st = { dir: [0, 0] as [number, number], t: 0, idle: false };
    let steps = 0;
    while (g.state !== 'dead' && g.state !== 'won' && steps < 60 * 60 * 9) {
      if (g.state === 'levelup') g.choose(0);
      else if (g.state === 'chest') g.closeChest();
      else if (g.state === 'revive') g.revive(true);
      const [mx, my] = g.waitingForMove ? [1, 0] : novice(g, rng, st);
      g.step(mx, my);
      g.fx.length = 0;
      steps++;
    }
    if (g.state === 'won') wins++;
    if (g.time >= 150) star++;
    out.push(`${g.state === 'won' ? 'W' : Math.round(g.time) + 's:' + g.lastHurt + ':L' + g.level}`);
  }
  console.log(`S${SECTOR + 1} ${tutorial ? 'tutorial' : 'normal  '}: wins ${wins}/12, reached 2:30 ${star}/12 | ${out.join(' ')}`);
}
