import type { BossKind } from './data';

export type Biome = 'downtown' | 'biolab' | 'spaceport';

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
];

const BOSS_ORDER: [BossKind, BossKind][] = [
  ['warden', 'hive'],
  ['hive', 'warden'],
  ['warden', 'colossus'],
  ['hive', 'colossus'],
  ['colossus', 'warden'],
];

export const CHAPTER_COUNT = NAMES.length;

export function getChapter(index: number): ChapterDef {
  const [name, biome] = NAMES[index % NAMES.length];
  const [midBoss, finalBoss] = BOSS_ORDER[index % BOSS_ORDER.length];
  // Each sector is ~50% tougher up to Sector 7, then ~36%: merging needs 3× the items per rarity,
  // so late-game player power grows more slowly and a flat exponent turns into a wall.
  // Steepest right after the tutorial sector (players' power also jumps fastest there), then easing.
  const early = Math.min(index, 3);
  const mid = Math.max(0, Math.min(index, 6) - 3);
  const late = Math.max(0, index - 6);
  const hpMul = Math.pow(1.8, early) * Math.pow(1.55, mid) * Math.pow(1.45, late);
  const dmgMul = Math.pow(1.38, early) * Math.pow(1.28, mid) * Math.pow(1.24, late);
  return {
    index,
    name,
    biome,
    hpMul,
    dmgMul,
    midBoss,
    finalBoss,
    goldMul: 1 + index * 0.45,
    power: Math.round(300 * Math.pow(1.6, early) * Math.pow(1.42, mid) * Math.pow(1.3, late)),
  };
}
