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
  // Each sector is ~55% tougher; gear + talents + run skill have to keep up.
  const hpMul = Math.pow(1.55, index);
  const dmgMul = Math.pow(1.32, index);
  return {
    index,
    name,
    biome,
    hpMul,
    dmgMul,
    midBoss,
    finalBoss,
    goldMul: 1 + index * 0.45,
    power: Math.round(300 * Math.pow(1.5, index)),
  };
}
