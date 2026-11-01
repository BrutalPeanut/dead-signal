/**
 * Ascension: once Sector 10 (the end of Act I) is cleared, the player can restart the campaign
 * from Sector 1 at a higher rank. Only the campaign resets (sectors, stars, sector chests, best
 * times); gear, gold, scrap, keys, talents, account level, guns and characters are all kept.
 *
 * What it's worth:
 *  - Signal Cores for the progress given up (more for Act II sectors), spent in the Signal Lab on
 *    permanent upgrades that never reset;
 *  - each rank: +25% gold, scrap and account XP from campaign runs, and rarer drops and crates;
 *  - every sector chest can be claimed again on the way back up, plus a cache of crate keys.
 * The cost: the infected get tougher each rank (+15% HP, +8% damage), so the climb back is fast
 * early on and turns into a real fight near the old frontier, where the Lab upgrades pay off.
 */

/** Sector index that must be unlocked (i.e. Sector 10 cleared) before ascending. */
export const ASCEND_AT = 10;

export interface AscState {
  rank: number;
  /** Unspent Signal Cores. */
  cores: number;
  /** All cores ever earned (for display). */
  earned: number;
  /** Furthest sector index ever unlocked: guns, couriers and income scale keep this after a reset. */
  peak: number;
  /** Signal Lab upgrade levels. */
  lab: Partial<Record<LabId, number>>;
  /** Cores from the latest ascension, and the rank whose ad bonus was claimed. */
  lastCores?: number;
  adRank?: number;
}

export const freshAsc = (): AscState => ({ rank: 0, cores: 0, earned: 0, peak: 0, lab: {} });

export type LabId = 'atk' | 'hp' | 'loot' | 'xp' | 'start' | 'luck' | 'revive' | 'relay';

export interface LabPerk {
  id: LabId;
  name: string;
  max: number;
  /** Core cost to buy the next level, from level `lv`. */
  cost: (lv: number) => number;
  desc: (lv: number) => string;
  icon: string;
  color: string;
}

export const LAB: LabPerk[] = [
  { id: 'atk', name: 'Overcharge', max: 10, cost: (l) => 8 + l * 4, desc: (l) => `+${l * 5}% ATK`, icon: '✸', color: '#ff7a1a' },
  { id: 'hp', name: 'Reinforced Plating', max: 10, cost: (l) => 8 + l * 4, desc: (l) => `+${l * 5}% max HP`, icon: '♥', color: '#ff3b5c' },
  { id: 'loot', name: 'Salvage Rights', max: 10, cost: (l) => 6 + l * 3, desc: (l) => `+${l * 10}% gold and scrap`, icon: '◆', color: '#ffd34d' },
  { id: 'xp', name: 'Fast Learner', max: 5, cost: (l) => 6 + l * 3, desc: (l) => `+${l * 15}% account XP`, icon: '▲', color: '#5ef2ff' },
  { id: 'relay', name: 'Deep Relay', max: 5, cost: (l) => 5 + l * 3, desc: (l) => `+${l * 20}% Signal Relay income`, icon: '≋', color: '#43ffa4' },
  { id: 'start', name: 'Hot Start', max: 3, cost: (l) => 20 + l * 15, desc: (l) => `${l} free level-up${l === 1 ? '' : 's'} at the start of every run`, icon: '⚡', color: '#b18cff' },
  { id: 'luck', name: 'Lucky Signal', max: 4, cost: (l) => 15 + l * 10, desc: (l) => `Rarer gear from drops and crates (+${l})`, icon: '✦', color: '#ff5bd8' },
  { id: 'revive', name: 'Phoenix Link', max: 1, cost: () => 60, desc: (l) => `${l ? '+1' : 'An extra'} revive every run`, icon: '✚', color: '#ffb36b' },
];

export const labPerk = (id: LabId) => LAB.find((p) => p.id === id)!;

/** Enemy toughness in the campaign at this rank. */
export const rankHpMul = (rank: number) => Math.pow(1.15, rank);
export const rankDmgMul = (rank: number) => Math.pow(1.08, rank);
/** Gold, scrap and account XP from campaign runs at this rank. */
export const rankRewardMul = (rank: number) => 1 + 0.25 * rank;

/** Cores for a sector's stars: 1 per star, +2 for the clear; Act II sectors are worth double. */
export function sectorCores(index: number, stars: number): number {
  const n = (stars & 1 ? 1 : 0) + (stars & 2 ? 1 : 0) + (stars & 4 ? 3 : 0);
  return n * (index >= 10 ? 2 : 1);
}

export function coresFor(stars: Record<number, number>): number {
  let n = 0;
  for (const [k, v] of Object.entries(stars)) n += sectorCores(Number(k), v);
  return n;
}

/** Crate keys handed out on ascending to rank `rank`. */
export const ascendKeys = (rank: number) => Math.min(15, 3 + rank * 2);

export const romanRank = (n: number): string => {
  if (n <= 0) return '';
  const r: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, t] of r) while (n >= v) (s += t), (n -= v);
  return s;
};
