/**
 * Build viability test: full runs with melee-first vs ranged-first builds (and melee vs kiting playstyle).
 * Usage: npm run builds -- [runs] [sector] [atk] [hp]
 */
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { botChoose, botMove, botPrefs, botStyle } from '../src/sim/bot';
import type { BaseStats } from '../src/sim/types';
import type { WeaponId } from '../src/sim/data';

const runs = Number(process.argv[2] ?? 10);
const sector = Number(process.argv[3] ?? 2);
const atk = Number(process.argv[4] ?? 45);
const hp = Number(process.argv[5] ?? 420);

const BUILDS: Record<string, { start: WeaponId; prefs: string[]; kite: number }> = {
  'ranged (pistol)': { start: 'pistol', prefs: ['pistol', 'chip', 'arc', 'capacitor', 'disc', 'magnet', 'drill', 'boots', 'frag', 'fuel', 'napalm', 'gel'], kite: 110 },
  'melee core, kites': { start: 'blades', prefs: ['blades', 'plating', 'field', 'medkit', 'arc', 'capacitor', 'fuel', 'boots', 'disc', 'magnet'], kite: 110 },
  'melee core, holds close': { start: 'blades', prefs: ['blades', 'plating', 'field', 'medkit', 'arc', 'capacitor', 'fuel', 'boots', 'disc', 'magnet'], kite: 55 },
  'pure melee (blades/field/cleaver)': { start: 'cleaver', prefs: ['cleaver', 'adrenal', 'blades', 'plating', 'field', 'medkit', 'fuel', 'boots', 'capacitor', 'chip'], kite: 55 },
  'control: 3 ranged only': { start: 'pistol', prefs: ['pistol', 'chip', 'arc', 'capacitor', 'disc', 'magnet', 'fuel', 'boots', 'medkit', 'plating'], kite: 110 },
};

for (const [name, b] of Object.entries(BUILDS)) {
  botPrefs.ids = b.prefs;
  botStyle.kite = b.kite;
  let wins = 0;
  let t = 0;
  let evo = 0;
  const share: Record<string, number> = {};
  for (let r = 0; r < runs; r++) {
    const base: BaseStats = { atk, hp, def: 0.03, crit: 0.05, critMul: 1.5, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1, rerolls: 2, revives: 0, startWeapon: b.start, startLevels: 0, regen: 0 };
    const g = new Game(getChapter(sector), base, 5000 + r * 131);
    let steps = 0;
    while (g.state !== 'dead' && g.state !== 'won' && steps < 60 * 60 * 12) {
      if (g.state === 'levelup') {
        // pure melee: only accept melee weapons
        const only = name.startsWith('pure') ? ['blades', 'field', 'cleaver'] : name.startsWith('control') ? ['pistol', 'arc', 'disc'] : null;
        if (only) {
          const ok = (o: (typeof g.offers)[number]) => o.type !== 'weapon' || only.includes(o.id);
          const pref = g.offers.findIndex((o) => ok(o) && botPrefs.ids.includes((o as { id?: string }).id ?? ''));
          const i = pref >= 0 ? pref : g.offers.findIndex(ok);
          g.choose(i >= 0 ? i : botChoose(g, g.offers));
        } else g.choose(botChoose(g, g.offers));
      } else if (g.state === 'chest') g.closeChest();
      const [mx, my] = botMove(g);
      g.step(mx, my);
      g.fx.length = 0;
      steps++;
    }
    if (g.state === 'won') wins++;
    t += g.time;
    evo += g.weapons.filter((w) => w.evolved).length;
    const tot = Object.values(g.dmgBy).reduce((a, v) => a + v, 0) || 1;
    for (const [k, v] of Object.entries(g.dmgBy)) share[k] = (share[k] ?? 0) + v / tot / runs;
  }
  const top = Object.entries(share).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ');
  console.log(`${name.padEnd(32)} win ${wins}/${runs}  avg ${Math.round(t / runs)}s  evolutions/run ${(evo / runs).toFixed(1)}  damage: ${top}`);
}
