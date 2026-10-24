import type { BossKind, EnemyKind, WeaponId } from './data';
import { Rng } from './math';

export type RunMode = 'campaign' | 'daily' | 'endless';

/** Run-wide rule changes. Campaign uses the defaults; Daily Challenge rolls one or two of these. */
export interface GameMods {
  mode: RunMode;
  spawn: number;
  enemyHp: number;
  enemySpeed: number;
  enemyDmg: number;
  xp: number;
  pickup: number;
  playerHp: number;
  playerDmg: number;
  extraWeapons: WeaponId[];
  startWeapon?: WeaponId;
}

export const defaultMods = (mode: RunMode = 'campaign'): GameMods => ({
  mode,
  spawn: 1,
  enemyHp: 1,
  enemySpeed: 1,
  enemyDmg: 1,
  xp: 1,
  pickup: 1,
  playerHp: 1,
  playerDmg: 1,
  extraWeapons: [],
});

export interface Modifier {
  id: string;
  name: string;
  desc: string;
  apply: (m: GameMods) => void;
}

export const MODIFIERS: Modifier[] = [
  { id: 'swarm', name: 'Swarm', desc: '+60% infected, but they have 35% less health', apply: (m) => ((m.spawn *= 1.6), (m.enemyHp *= 0.65)) },
  { id: 'glass', name: 'Glass Cannon', desc: 'Half health, +60% damage', apply: (m) => ((m.playerHp *= 0.5), (m.playerDmg *= 1.6)) },
  { id: 'rush', name: 'Adrenaline', desc: 'Infected move 25% faster, +35% XP', apply: (m) => ((m.enemySpeed *= 1.25), (m.xp *= 1.35)) },
  { id: 'magnet', name: 'Magnetic Storm', desc: 'Huge pickup range, -15% XP', apply: (m) => ((m.pickup *= 3), (m.xp *= 0.85)) },
  { id: 'arsenal', name: 'Arsenal', desc: 'Start with two extra weapons', apply: (m) => m.extraWeapons.push('frag', 'arc') },
  { id: 'blade', name: 'Close Quarters', desc: 'Start with the Rift Cleaver instead of a pistol', apply: (m) => (m.startWeapon = 'cleaver') },
  { id: 'heavy', name: 'Heavy Hitters', desc: 'Infected hit 40% harder, +25% XP', apply: (m) => ((m.enemyDmg *= 1.4), (m.xp *= 1.25)) },
  { id: 'tank', name: 'Thick Skin', desc: 'Infected have +50% health, you have +30% damage', apply: (m) => ((m.enemyHp *= 1.5), (m.playerDmg *= 1.3)) },
];

/** Same seed for everyone on a given calendar day (local date), so family scores are comparable. */
export function dailySeed(d = new Date()) {
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let s = 2166136261;
  for (const ch of key) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return { key, seed: s };
}

export interface DailyChallenge {
  key: string;
  seed: number;
  mods: Modifier[];
  /** Difficulty template (fixed for everyone). */
  sector: number;
  midBoss: BossKind;
  finalBoss: BossKind;
}

export function dailyChallenge(d = new Date()): DailyChallenge {
  const { key, seed } = dailySeed(d);
  const rng = new Rng(seed);
  const pool = MODIFIERS.slice();
  const n = rng.chance(0.5) ? 2 : 1;
  const mods: Modifier[] = [];
  while (mods.length < n) {
    const m = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    // two weapon-start modifiers would conflict
    if (mods.some((x) => (x.id === 'blade' || x.id === 'arsenal') && (m.id === 'blade' || m.id === 'arsenal'))) continue;
    mods.push(m);
  }
  const bosses: BossKind[] = ['warden', 'hive', 'colossus'];
  const mid = bosses[rng.int(0, 2)];
  const fin = bosses.filter((b) => b !== mid)[rng.int(0, 1)];
  return { key, seed, mods, sector: 2, midBoss: mid, finalBoss: fin };
}

export function modsFor(ch: DailyChallenge): GameMods {
  const m = defaultMods('daily');
  for (const x of ch.mods) x.apply(m);
  return m;
}

/** Endless: bosses every 2:30 cycling through the roster; extra hordes every 1:00 after 5:00. */
export const ENDLESS_BOSS_EVERY = 150;
export const ENDLESS_HORDE_EVERY = 120; // mission time
export const ENDLESS_HORDE_KINDS: EnemyKind[] = ['shambler', 'runner', 'crawler', 'brute'];

/** Daily Challenge reward tiers by score. */
export const DAILY_TIERS: { score: number; name: string; color: string }[] = [
  { score: 20000, name: 'Bronze', color: '#d8925a' },
  { score: 50000, name: 'Silver', color: '#c9d4e4' },
  { score: 80000, name: 'Gold', color: '#ffd34d' },
];
