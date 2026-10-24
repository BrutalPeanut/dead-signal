/**
 * Simulates a player's whole journey: play the highest unlocked sector with the bot, collect rewards,
 * then spend them like a sensible player would (merge, equip best, level gear, buy talents, open crates).
 * Reports how many runs each sector takes so we can tune pacing. Usage: npm run progression -- [maxRuns] [seed]
 */
import { Profile } from '../src/meta/profile';
import { GEAR, SLOTS, gearStat, levelCost } from '../src/meta/gear';
import { CHAPTER_COUNT, getChapter } from '../src/sim/chapters';
import { Game } from '../src/sim/game';
import { botChoose, botMove } from '../src/sim/bot';
import { Rng } from '../src/sim/math';
import { trackCost } from '../src/meta/talents';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }

const maxRuns = Number(process.argv[2] ?? 80);
const seed0 = Number(process.argv[3] ?? 1);
const p = new Profile(new Mem() as unknown as Storage);
const rng = new Rng(seed0);

const NAIVE = process.env.NAIVE === '1';

function manage() {
  const d = p.data;
  if (NAIVE) {
    // a player who only presses Battle: no merging, equipping, levelling, talents or crates
    return;
  }
  if (process.env.COACH === '1') {
    // a player who only taps the lobby's Power Up button a few times between runs
    for (let i = 0; i < 6; i++) {
      const c = p.coach();
      if (!c || !c.apply()) break;
    }
    return;
  }
  // passive income: assume ~40 min between runs on average → relay + a daily every 6 runs
  d.relayAt -= 40 * 60 * 1000;
  p.claimRelay();
  if (d.stats.runs % 6 === 0) { d.lastDaily = ''; p.claimDaily(new Date(2026, 0, d.stats.runs)); }
  while (d.keys > 0) p.openCrate(new Rng(rng.int(1, 1e9)));
  p.mergeAll();
  for (const s of SLOTS) {
    const best = d.gear.filter((g) => GEAR[g.def].slot === s).sort((a, b) => b.rarity - a.rarity || gearStat(b) - gearStat(a))[0];
    if (best) p.equip(best.uid);
  }
  // salvage junk: commons/uncommons that can't merge soon and aren't equipped, keep a few
  for (const g of [...d.gear]) {
    if (p.isEquipped(g.uid) || g.rarity > 1) continue;
    const same = d.gear.filter((x) => x.def === g.def && x.rarity === g.rarity).length;
    if (same === 1 && d.gear.length > 30) p.salvage(g.uid);
  }
  // spend gold: cheapest upgrade first among equipped levels and talent tracks
  for (let guard = 0; guard < 500; guard++) {
    const opts: { cost: number; act: () => boolean }[] = [];
    for (const it of p.equippedItems()) {
      if (p.canLevel(it)) opts.push({ cost: levelCost(it.level, it.rarity).gold, act: () => p.levelUp(it.uid) });
    }
    for (const t of ['atk', 'hp', 'def', 'heal'] as const) {
      if (p.canBuyTrack(t)) opts.push({ cost: trackCost(d.tracks[t]) * (t === 'heal' || t === 'def' ? 1.6 : 1), act: () => p.buyTrack(t) });
    }
    if (!opts.length) break;
    opts.sort((a, b) => a.cost - b.cost);
    if (!opts[0].act()) break;
  }
}

const clears: string[] = [];
const t0 = performance.now();
for (let run = 1; run <= maxRuns && p.data.unlocked < CHAPTER_COUNT; run++) {
  const sector = p.data.unlocked;
  const base = p.baseStats();
  const g = new Game(getChapter(sector), base, rng.int(1, 1e9));
  let steps = 0;
  while (g.state !== 'dead' && g.state !== 'won' && steps < 60 * 60 * 12) {
    if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
    else if (g.state === 'chest') g.closeChest();
    else if (g.state === 'revive') g.revive(true);
    const [mx, my] = botMove(g);
    g.step(mx, my);
    g.fx.length = 0;
    steps++;
  }
  const won = g.state === 'won';
  const was = p.data.unlocked;
  p.applyRun(sector, g.result(), rng.int(1, 1e9));
  console.log(`run ${String(run).padStart(3)} S${sector + 1} ${won ? 'WIN ' : 'lose'} t=${String(Math.round(g.time)).padStart(3)} pow=${p.power()} atk=${base.atk} hp=${base.hp} acct=${p.data.accountLevel} gold=${p.data.gold} gear=${p.equippedItems().map((i) => i.rarity).join('')}`);
  if (p.data.unlocked > was || (won && sector === CHAPTER_COUNT - 1)) {
    clears.push(`S${sector + 1} cleared on run ${run} (power ${p.power()}, acct ${p.data.accountLevel})`);
    if (sector === CHAPTER_COUNT - 1) break;
  }
  manage();
}
console.log('\n' + clears.join('\n'));
console.log(`(${((performance.now() - t0) / 1000).toFixed(0)}s)`);
