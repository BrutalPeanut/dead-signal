import { Rng } from '../sim/math';

export type MissionKind = 'kills' | 'runs' | 'survive' | 'boss' | 'elite' | 'crate' | 'levelgear' | 'relay' | 'evolve';

export interface MissionDef {
  kind: MissionKind;
  text: (n: number) => string;
  /** Target by sector index (missions scale gently as you progress). */
  target: (sector: number) => number;
  reward: (sector: number) => Reward;
  /** 'max' missions track the best single value (e.g. longest survival), 'sum' accumulate. */
  mode: 'sum' | 'max';
}

export interface Reward {
  gold?: number;
  scrap?: number;
  keys?: number;
}

export interface MissionState {
  kind: MissionKind;
  target: number;
  progress: number;
  claimed: boolean;
  reward: Reward;
}

export interface DailyMissions {
  date: string;
  list: MissionState[];
  bonusClaimed: boolean;
}

const g = (s: number) => Math.round(80 * (1 + s * 0.5));

export const MISSION_DEFS: Record<MissionKind, MissionDef> = {
  kills: { kind: 'kills', mode: 'sum', text: (n) => `Defeat ${n.toLocaleString()} infected`, target: (s) => 1500 + s * 500, reward: (s) => ({ gold: g(s) }) },
  runs: { kind: 'runs', mode: 'sum', text: (n) => `Deploy ${n} times`, target: () => 3, reward: (s) => ({ gold: g(s), scrap: 4 }) },
  survive: { kind: 'survive', mode: 'max', text: (n) => `Survive ${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} in one run`, target: () => 240, reward: (s) => ({ scrap: 6 + s }) },
  boss: { kind: 'boss', mode: 'sum', text: (n) => `Defeat ${n} boss${n > 1 ? 'es' : ''}`, target: () => 2, reward: (s) => ({ gold: g(s) * 1.5 }) },
  elite: { kind: 'elite', mode: 'sum', text: (n) => `Defeat ${n} elites`, target: () => 3, reward: (s) => ({ scrap: 5 + s }) },
  crate: { kind: 'crate', mode: 'sum', text: () => 'Open a supply crate', target: () => 1, reward: (s) => ({ gold: g(s) }) },
  levelgear: { kind: 'levelgear', mode: 'sum', text: (n) => `Level up gear ${n} times`, target: () => 3, reward: () => ({ scrap: 5 }) },
  relay: { kind: 'relay', mode: 'sum', text: () => 'Claim the Signal Relay', target: () => 1, reward: (s) => ({ gold: g(s) * 0.75 }) },
  evolve: { kind: 'evolve', mode: 'sum', text: () => 'Evolve a weapon in a run', target: () => 1, reward: () => ({ keys: 1 }) },
};

/** Always included so a single run makes visible progress on day one. */
const CORE: MissionKind[] = ['kills', 'runs'];
const ROTATING: MissionKind[] = ['survive', 'boss', 'elite', 'crate', 'levelgear', 'relay', 'evolve'];

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function rollDaily(date: string, sector: number): DailyMissions {
  let seed = 0;
  for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rng = new Rng(seed);
  const pool = ROTATING.slice();
  const picked: MissionKind[] = [...CORE];
  while (picked.length < 5) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return {
    date,
    bonusClaimed: false,
    list: picked.map((k) => {
      const d = MISSION_DEFS[k];
      const r = d.reward(sector);
      return {
        kind: k,
        target: d.target(sector),
        progress: 0,
        claimed: false,
        reward: { gold: r.gold ? Math.round(r.gold) : undefined, scrap: r.scrap, keys: r.keys },
      };
    }),
  };
}

/** Bonus for finishing all five: a crate key plus gold. */
export const dailyBonus = (sector: number): Reward => ({ keys: 1, gold: g(sector) * 2 });

/** Sector chest track: one chest per star. */
export function starReward(sector: number, bit: 1 | 2 | 4): Reward {
  const m = 1 + sector * 0.5;
  if (bit === 1) return { gold: Math.round(120 * m) };
  if (bit === 2) return { scrap: 8 + sector * 3, gold: Math.round(80 * m) };
  return { keys: 1, gold: Math.round(200 * m) };
}
