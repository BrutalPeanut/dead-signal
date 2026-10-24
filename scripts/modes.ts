/** Bot check for Daily Challenge and Endless. npx tsx scripts/modes.ts */
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { botChoose, botMove } from '../src/sim/bot';
import { Profile } from '../src/meta/profile';
import { dailyChallenge, modsFor, defaultMods } from '../src/sim/modes';
import fs from 'node:fs';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }
function play(g: Game, cap = 60 * 60 * 40) {
  let steps = 0;
  while (g.state !== 'dead' && g.state !== 'won' && steps < cap) {
    if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
    else if (g.state === 'chest') g.closeChest();
    else if (g.state === 'revive') g.revive(false);
    const [mx, my] = botMove(g);
    g.step(mx, my);
    g.fx.length = 0;
    steps++;
  }
  return g;
}
const which = process.argv[2] ?? 'daily';
if (which === 'daily') {
  const p = new Profile(new Mem() as unknown as Storage);
  for (let i = 0; i < 10; i++) {
    const day = new Date(2026, 9, 20 + i);
    const ch = dailyChallenge(day);
    const chapter = { ...getChapter(ch.sector), name: 'Daily', midBoss: ch.midBoss, finalBoss: ch.finalBoss };
    const g = play(new Game(chapter, p.standardKit(), ch.seed, modsFor(ch)));
    console.log(ch.key, ch.mods.map((m) => m.id).join('+').padEnd(16), g.state.padEnd(5), `t=${Math.round(g.time)}`, `score=${g.score()}`, `L${g.level}`);
  }
} else {
  for (const f of process.argv.slice(3)) {
    const p = new Profile(new Mem() as unknown as Storage);
    if (f !== 'fresh') Object.assign(p.data, JSON.parse(fs.readFileSync(f, 'utf8')));
    for (const sec of [2]) {
      const g = play(new Game(getChapter(sec), p.baseStats(), 7, defaultMods('endless')));
      console.log(f.split('/').pop(), 'pow', p.power(), 'endless S' + (sec + 1), g.state, `t=${Math.round(g.time)}`, `score=${g.score()}`, `bosses=${g.bossKills}`, `L${g.level}`, g.lastHurt);
    }
  }
}
