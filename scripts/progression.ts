/**
 * Simulates a player's whole journey: play the highest unlocked sector with the bot, collect rewards,
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

const clears: string[] = [];
const deaths: Record<string, { n: number; last: Record<string, number>; dmg: Record<string, number>; t: number[] }> = {};
const t0 = performance.now();
for (let run = 1; run <= maxRuns && p.data.unlocked < CHAPTER_COUNT; run++) {
  const sector = p.data.unlocked;
  if (process.env.SAVE_AT && sector >= Number(process.env.SAVE_AT)) {
    // snapshot a realistic save at this point of the journey (for real-time human playtests)
    (await import('node:fs')).writeFileSync(process.env.SAVE_FILE ?? 'save.json', JSON.stringify(p.data));
    console.log(`saved profile at S${sector + 1}`);
    break;
  }
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
  if (!won) {
    const k = `S${sector + 1}`;
    const a = (deaths[k] ??= { n: 0, last: {}, dmg: {}, t: [] });
    a.n++;
    a.t.push(Math.round(g.time));
    a.last[g.lastHurt] = (a.last[g.lastHurt] ?? 0) + 1;
    for (const [src, v] of Object.entries(g.hurtBy)) a.dmg[src] = (a.dmg[src] ?? 0) + v;
  }
  console.log(`run ${String(run).padStart(3)} S${sector + 1} ${won ? 'WIN ' : 'lose'} t=${String(Math.round(g.time)).padStart(3)} pow=${p.power()} atk=${base.atk} hp=${base.hp} acct=${p.data.accountLevel} gold=${p.data.gold} gear=${p.equippedItems().map((i) => i.rarity).join('')}`);
  if (p.data.unlocked > was || (won && sector === CHAPTER_COUNT - 1)) {
    clears.push(`S${sector + 1} cleared on run ${run} (power ${p.power()}, acct ${p.data.accountLevel})`);
    if (sector === CHAPTER_COUNT - 1) break;
  }
  manage();
}
console.log('\n' + clears.join('\n'));
console.log('\nlosses: sector n | killing blow | damage share | death times');
for (const [k, a] of Object.entries(deaths)) {
  const tot = Object.values(a.dmg).reduce((x, y) => x + y, 0);
  const share = Object.entries(a.dmg).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([s2, v]) => `${s2} ${Math.round((v / tot) * 100)}%`).join(', ');
  const last = Object.entries(a.last).sort((x, y) => y[1] - x[1]).map(([s2, v]) => `${s2}×${v}`).join(' ');
  console.log(`${k} ${a.n} | ${last} | ${share} | ${a.t.sort((x, y) => x - y).join(',')}`);
}
console.log(`(${((performance.now() - t0) / 1000).toFixed(0)}s)`);
