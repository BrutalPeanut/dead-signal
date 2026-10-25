/** How much dropped XP a bot actually collects, by sector. npx tsx scripts/xpflow.ts <save.json> <sector> [human] */
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { botChoose, botMove, humanMove } from '../src/sim/bot';
import { Profile } from '../src/meta/profile';
import fs from 'node:fs';
class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }
const [file, sec, mode] = process.argv.slice(2);
const p = new Profile(new Mem() as unknown as Storage);
if (file !== 'fresh') Object.assign(p.data, JSON.parse(fs.readFileSync(file, 'utf8')));
const res: string[] = [];
for (let seed = 1; seed <= 4; seed++) {
  const g = new Game(getChapter(+sec), p.baseStats(), seed);
  let dropped = 0, got = 0;
  const add = g.addPickup.bind(g);
  (g as any).addPickup = (k: any, x: number, y: number, v: number) => { if (k === 'xp') dropped += v; return add(k, x, y, v); };
  const gx = g.gainXp.bind(g);
  (g as any).gainXp = (v: number) => { got += v; gx(v); };
  const marks: string[] = [];
  let next = 30;
  while (g.state !== 'dead' && g.state !== 'won' && g.time < 400) {
    if (g.state === 'levelup') g.choose(botChoose(g, g.offers));
    else if (g.state === 'chest') g.closeChest();
    else if (g.state === 'revive') g.revive(false);
    const [mx, my] = mode === 'human' ? (humanMove as any)(g) : botMove(g);
    g.step(mx, my);
    g.fx.length = 0;
    if (g.time >= next) { marks.push(`${next}s L${g.level} ${Math.round((got / Math.max(1, dropped)) * 100)}%`); next += 30; }
  }
  res.push(`seed ${seed}: ${g.state} t=${Math.round(g.time)} L${g.level} collected ${Math.round((got / dropped) * 100)}% | ${marks.slice(0, 6).join(' · ')}`);
}
console.log(res.join('\n'));
