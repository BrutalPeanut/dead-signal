/**
 * Ascension sim: the progression bot climbs to Sector 10, ascends, spends its cores in the Signal Lab
 * (cheapest first), and climbs again. Usage: npm run ascension -- [cycles] [seed]
 *
 * (Original progression notes:) Simulates a player's whole journey: play the highest unlocked sector with the bot, collect rewards,
 * then spend them like a sensible player would (merge, equip best, level gear, buy talents, open crates).
 * Reports how many runs each sector takes so we can tune pacing. Usage: npm run progression -- [maxRuns] [seed]
 */
import { Profile } from '../src/meta/profile';
import { GEAR, SLOTS } from '../src/meta/gear';
import { CHAPTER_COUNT, getChapter } from '../src/sim/chapters';
import { Game } from '../src/sim/game';
import { botChoose, botMove } from '../src/sim/bot';
import { Rng } from '../src/sim/math';
import { trackCost } from '../src/meta/talents';
import { ASCEND_AT, LAB } from '../src/meta/ascension';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }

const cycles = Number(process.argv[2] ?? 3);
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
    const best = d.gear.filter((g) => GEAR[g.def].slot === s).sort((a, b) => b.rarity - a.rarity || p.statOf(b) - p.statOf(a))[0];
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
      if (p.canLevel(it)) opts.push({ cost: p.levelCostOf(it).gold, act: () => p.levelUp(it.uid) });
    }
    for (const t of ['atk', 'hp', 'def', 'heal'] as const) {
      if (p.canBuyTrack(t)) opts.push({ cost: trackCost(d.tracks[t]) * (t === 'heal' || t === 'def' ? 1.6 : 1), act: () => p.buyTrack(t) });
    }
    if (!opts.length) break;
    opts.sort((a, b) => a.cost - b.cost);
    if (!opts[0].act()) break;
  }
}


function play(sector: number) {
  const g = new Game(getChapter(sector, p.rank()), p.baseStats(), rng.int(1, 1e9));
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
  const r = p.applyRun(sector, g.result(), rng.int(1, 1e9));
  while (p.starChestsReady()) for (const k of Object.keys(p.data.stars)) for (const b of [1, 2, 4] as const) p.claimStar(Number(k), b);
  return { won: g.state === 'won', t: g.time, r };
}

const t0 = performance.now();
for (let c = 0; c <= cycles; c++) {
  let runs = 0, gold = 0;
  const powStart = p.power();
  const marks: string[] = [];
  // the climb: each cycle aims for Sector 10; cap the grind so a wall shows up as a wall
  while (p.data.unlocked < ASCEND_AT && runs < 140) {
    const s = p.data.unlocked;
    const { won, r } = play(s);
    runs++;
    gold += r.gold;
    if (won && r.unlockedSector) marks.push(`S${s + 1}@${runs}`);
    manage();
  }
  // a few runs at the frontier (Sectors 11+) to see how much further this rank gets
  let frontier = p.data.unlocked;
  for (let i = 0; i < 12 && p.data.unlocked < CHAPTER_COUNT - 1; i++) {
    const s = p.data.unlocked;
    play(s);
    runs++;
    manage();
    frontier = p.data.unlocked;
  }
  console.log(`rank ${p.rank()}: ${runs} runs (${marks.length} sectors: ${marks.join(' ')}), power ${powStart} → ${p.power()}, frontier after 12 extra runs: Sector ${frontier + 1}, acct ${p.data.accountLevel}, campaign gold ${gold}`);
  if (c === cycles) break;
  const a = p.ascend();
  if (!a) { console.log('could not ascend'); break; }
  // spend cores: cheapest useful perk first
  for (;;) {
    const opts = LAB.filter((x) => p.canBuyLab(x.id)).sort((x, y) => p.labCost(x.id) - p.labCost(y.id));
    if (!opts.length || !p.buyLab(opts[0].id)) break;
  }
  console.log(`  ascended → ${a.rank}: +${a.cores} cores, +${a.keys} keys, lab ${JSON.stringify(p.data.asc!.lab)}, power ${p.power()}`);
}
console.log(`(${((performance.now() - t0) / 1000).toFixed(0)}s)`);
