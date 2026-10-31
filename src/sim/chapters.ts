import type { BossKind } from './data';

export type Biome = 'downtown' | 'biolab' | 'spaceport' | 'reactor';

export interface ChapterDef {
  index: number; // 0-based
  name: string;
  biome: Biome;
  hpMul: number;
  dmgMul: number;
  midBoss: BossKind;
  finalBoss: BossKind;
  goldMul: number;
  /** Recommended power, shown in the sector select. */
  power: number;
}

const NAMES: [string, Biome][] = [
  ['Dead Air', 'downtown'],
  ['Static Row', 'downtown'],
  ['Biolab Ingress', 'biolab'],
  ['Containment', 'biolab'],
  ['Launch Gantry', 'spaceport'],
  ['Night Shift', 'downtown'],
  ['The Clean Room', 'biolab'],
  ['Uplink', 'spaceport'],
  ['Feedback Loop', 'downtown'],
  ['Source Code', 'spaceport'],
  // Act II: the reactor that powers the signal
  ['Cold Start', 'reactor'],
  ['Coolant Loop', 'reactor'],
  ['Dead Channel', 'downtown'],
  ['Meltdown Row', 'reactor'],
  ['Quarantine Zero', 'biolab'],
  ['Turbine Hall', 'reactor'],
  ['Carrier Wave', 'spaceport'],
  ['Control Rod', 'reactor'],
  ['Core Breach', 'reactor'],
  ['Last Transmission', 'reactor'],
];

const BOSS_ORDER: [BossKind, BossKind][] = [
  ['warden', 'hive'],
  ['hive', 'warden'],
  ['warden', 'colossus'],
  ['hive', 'colossus'],
  ['colossus', 'warden'],
];

const ACT2_BOSSES: [BossKind, BossKind][] = [
  ['warden', 'broadcaster'],
  ['hive', 'broadcaster'],
  ['broadcaster', 'colossus'],
  ['colossus', 'broadcaster'],
  ['broadcaster', 'hive'],
];

export const CHAPTER_COUNT = NAMES.length;

/** `rank` = ascension rank: the campaign's infected get tougher each time the player ascends. */
export function getChapter(index: number, rank = 0): ChapterDef {
  const [name, biome] = NAMES[index % NAMES.length];
  // Act II introduces The Broadcaster and leans on him as the closer
  const [midBoss, finalBoss] = index >= 10 ? ACT2_BOSSES[(index - 10) % ACT2_BOSSES.length] : BOSS_ORDER[index % BOSS_ORDER.length];
  // Each sector is ~50% tougher up to Sector 7, then ~36%: merging needs 3× the items per rarity,
  // so late-game player power grows more slowly and a flat exponent turns into a wall.
  // Steepest right after the tutorial sector (players' power also jumps fastest there), then easing.
  const early = Math.min(index, 3);
  const mid = Math.max(0, Math.min(index, 6) - 3);
  const late = Math.max(0, Math.min(index, 9) - 6);
  // Act II (Sectors 11+): gear growth is mostly merges into Epic+ by now, so the curve flattens
  const act2 = Math.max(0, index - 9);
  const hpMul = Math.pow(1.8, early) * Math.pow(1.55, mid) * Math.pow(1.24, late) * Math.pow(1.12, act2);
  const dmgMul = Math.pow(1.38, early) * Math.pow(1.28, mid) * Math.pow(1.12, late) * Math.pow(1.07, act2);
  // On-ramp: Sector 2 is the first full 5-minute run, so it's cut roughly in half (playtesters
  // needed 3 tries); Sector 3 is eased too so the step up to it isn't a cliff.
  const onramp = [1, 0.55, 0.8][index] ?? 1;
  // Act II walls: the primary guns made the back half ~30% quicker to clear. Sectors 1-10 keep
  // the faster pace (new players need constant progress); from Sector 11, where players are
  // invested, the infected hit a little harder so losses are close calls worth a revive.
  const wall = index >= 11 ? 1.1 : index === 10 ? 1.05 : 1;
  const rh = Math.pow(1.15, rank);
  const rd = Math.pow(1.08, rank);
  return {
    index,
    name,
    biome,
    hpMul: hpMul * onramp * wall * rh,
    // Sector 1 is the training ground: softer hits so a first run can end in a win.
    dmgMul: (index === 0 ? dmgMul * 0.8 : dmgMul * onramp * Math.sqrt(wall)) * rd,
    midBoss,
    finalBoss,
    goldMul: 1 + index * 0.45,
    // Calibrated to the power a player following Power Up actually clears each sector at (+~10%).
    power: Math.round((450 * Math.pow(1.28, Math.min(index, 9)) * Math.pow(1.07, act2) * ([1, 0.75, 0.9][index] ?? 1) * Math.sqrt(wall) * Math.sqrt(rh * rd)) / 10) * 10,
  };
}
