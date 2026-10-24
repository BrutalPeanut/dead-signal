import type { WeaponId } from '../sim/data';

export type Slot = 'weapon' | 'visor' | 'vest' | 'gloves' | 'belt' | 'boots';
export const SLOTS: Slot[] = ['weapon', 'visor', 'vest', 'gloves', 'belt', 'boots'];
export const SLOT_NAMES: Record<Slot, string> = {
  weapon: 'Weapon',
  visor: 'Visor',
  vest: 'Vest',
  gloves: 'Gloves',
  belt: 'Belt',
  boots: 'Boots',
};

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const;
export const RARITY_COLORS = ['#9aa3b5', '#43d17a', '#4da3ff', '#b46bff', '#ffb02e', '#ff3b5c'];
export const RARITY_MUL = [1, 1.6, 2.5, 4, 6.5, 10];
export const MAX_LEVEL = [10, 20, 30, 40, 50, 60];
export const MERGE_COUNT = 3;

export type PerkStat = 'atkPct' | 'hpPct' | 'crit' | 'critMul' | 'def' | 'move' | 'pickup' | 'heal' | 'regen' | 'revive' | 'startLevel';

export interface Perk {
  stat: PerkStat;
  value: number;
  text: string;
}

export interface GearDef {
  id: string;
  slot: Slot;
  name: string;
  /** ATK or HP at Common Lv1. */
  base: number;
  stat: 'atk' | 'hp';
  startWeapon?: WeaponId;
  /** Perks unlocked at Rare, Epic, Legendary, Mythic. */
  perks: [Perk, Perk, Perk, Perk];
  flavor: string;
}

const p = (stat: PerkStat, value: number, text: string): Perk => ({ stat, value, text });

export const GEAR: Record<string, GearDef> = {
  sidearm: {
    id: 'sidearm', slot: 'weapon', name: 'Pulse Sidearm', base: 10, stat: 'atk', startWeapon: 'pistol',
    perks: [p('atkPct', 0.1, '+10% ATK'), p('crit', 0.05, '+5% crit chance'), p('startLevel', 1, 'Start runs with +1 level-up'), p('atkPct', 0.2, '+20% ATK')],
    flavor: 'Standard courier issue. Never jams. Never asks questions.',
  },
  gauntlet: {
    id: 'gauntlet', slot: 'weapon', name: 'Arc Gauntlet', base: 9, stat: 'atk', startWeapon: 'arc',
    perks: [p('atkPct', 0.1, '+10% ATK'), p('critMul', 0.25, '+25% crit damage'), p('startLevel', 1, 'Start runs with +1 level-up'), p('atkPct', 0.2, '+20% ATK')],
    flavor: 'A transformer coil strapped to a welding glove.',
  },
  thrower: {
    id: 'thrower', slot: 'weapon', name: 'Disc Thrower', base: 9.5, stat: 'atk', startWeapon: 'disc',
    perks: [p('atkPct', 0.1, '+10% ATK'), p('move', 0.05, '+5% move speed'), p('startLevel', 1, 'Start runs with +1 level-up'), p('atkPct', 0.2, '+20% ATK')],
    flavor: 'Built from a lawnmower and spite.',
  },
  tube: {
    id: 'tube', slot: 'weapon', name: 'Frag Tube', base: 10.5, stat: 'atk', startWeapon: 'frag',
    perks: [p('atkPct', 0.1, '+10% ATK'), p('hpPct', 0.1, '+10% max HP'), p('startLevel', 1, 'Start runs with +1 level-up'), p('atkPct', 0.2, '+20% ATK')],
    flavor: 'Point it away from yourself.',
  },
  drillrig: {
    id: 'drillrig', slot: 'weapon', name: 'Drill Rig', base: 9.5, stat: 'atk', startWeapon: 'drill',
    perks: [p('atkPct', 0.1, '+10% ATK'), p('crit', 0.05, '+5% crit chance'), p('startLevel', 1, 'Start runs with +1 level-up'), p('atkPct', 0.2, '+20% ATK')],
    flavor: 'Mining tech. The infected are softer than rock.',
  },
  scout: {
    id: 'scout', slot: 'visor', name: 'Scout Visor', base: 4, stat: 'atk',
    perks: [p('crit', 0.05, '+5% crit chance'), p('pickup', 0.15, '+15% pickup range'), p('crit', 0.08, '+8% crit chance'), p('critMul', 0.3, '+30% crit damage')],
    flavor: 'Highlights threats. Everything is a threat.',
  },
  optic: {
    id: 'optic', slot: 'visor', name: 'Hunter Optic', base: 4.5, stat: 'atk',
    perks: [p('critMul', 0.15, '+15% crit damage'), p('crit', 0.05, '+5% crit chance'), p('atkPct', 0.08, '+8% ATK'), p('critMul', 0.35, '+35% crit damage')],
    flavor: 'Zoom, enhance, delete.',
  },
  kevlar: {
    id: 'kevlar', slot: 'vest', name: 'Kevlar Vest', base: 60, stat: 'hp',
    perks: [p('hpPct', 0.08, '+8% max HP'), p('heal', 0.15, '+15% ration healing'), p('def', 0.05, '+5% damage reduction'), p('revive', 1, '+1 revive per run')],
    flavor: 'Rated for bullets. Teeth are a grey area.',
  },
  hazmat: {
    id: 'hazmat', slot: 'vest', name: 'Hazmat Shell', base: 55, stat: 'hp',
    perks: [p('def', 0.03, '+3% damage reduction'), p('regen', 0.002, '+0.2% HP/s regen'), p('def', 0.05, '+5% damage reduction'), p('hpPct', 0.2, '+20% max HP')],
    flavor: 'Sealed against spores. Mostly.',
  },
  grips: {
    id: 'grips', slot: 'gloves', name: 'Grip Gloves', base: 5, stat: 'atk',
    perks: [p('atkPct', 0.06, '+6% ATK'), p('crit', 0.05, '+5% crit chance'), p('atkPct', 0.1, '+10% ATK'), p('atkPct', 0.15, '+15% ATK')],
    flavor: 'Tactical. Washable.',
  },
  knuckles: {
    id: 'knuckles', slot: 'gloves', name: 'Shock Knuckles', base: 5.5, stat: 'atk',
    perks: [p('critMul', 0.15, '+15% crit damage'), p('atkPct', 0.06, '+6% ATK'), p('crit', 0.06, '+6% crit chance'), p('atkPct', 0.18, '+18% ATK')],
    flavor: 'Hums when the infected are near.',
  },
  utility: {
    id: 'utility', slot: 'belt', name: 'Utility Belt', base: 35, stat: 'hp',
    perks: [p('hpPct', 0.1, '+10% max HP'), p('regen', 0.002, '+0.2% HP/s regen'), p('def', 0.05, '+5% damage reduction'), p('hpPct', 0.15, '+15% max HP')],
    flavor: 'Pockets for pockets.',
  },
  ammorig: {
    id: 'ammorig', slot: 'belt', name: 'Ammo Rig', base: 32, stat: 'hp',
    perks: [p('atkPct', 0.05, '+5% ATK'), p('hpPct', 0.1, '+10% max HP'), p('atkPct', 0.08, '+8% ATK'), p('startLevel', 1, 'Start runs with +1 level-up')],
    flavor: 'Bandoliers never go out of style.',
  },
  runners: {
    id: 'runners', slot: 'boots', name: 'Runner Boots', base: 30, stat: 'hp',
    perks: [p('move', 0.05, '+5% move speed'), p('pickup', 0.2, '+20% pickup range'), p('move', 0.08, '+8% move speed'), p('def', 0.1, '+10% damage reduction')],
    flavor: 'Courier-grade. You will need to run.',
  },
  treads: {
    id: 'treads', slot: 'boots', name: 'Mag Treads', base: 34, stat: 'hp',
    perks: [p('def', 0.03, '+3% damage reduction'), p('hpPct', 0.1, '+10% max HP'), p('move', 0.06, '+6% move speed'), p('pickup', 0.35, '+35% pickup range')],
    flavor: 'Magnetised soles. Gems come to you.',
  },
};

export const GEAR_IDS = Object.keys(GEAR);

export interface GearItem {
  uid: string;
  def: string;
  rarity: number;
  level: number;
}

export function gearStat(it: GearItem): number {
  const d = GEAR[it.def];
  return d.base * RARITY_MUL[it.rarity] * (1 + 0.1 * (it.level - 1));
}

export function activePerks(it: GearItem): Perk[] {
  const d = GEAR[it.def];
  return d.perks.slice(0, Math.max(0, it.rarity - 1));
}

/** Gold + scrap cost to level an item from `level` to `level+1`. */
export function levelCost(level: number, rarity: number): { gold: number; scrap: number } {
  return {
    gold: Math.round((40 + 22 * Math.pow(level, 1.5)) * (1 + rarity * 0.15)),
    scrap: 1 + Math.floor(level / 4),
  };
}

export function salvageValue(it: GearItem): { scrap: number; gold: number } {
  let gold = 0;
  let scrap = 2 * (it.rarity + 1) * Math.pow(MERGE_COUNT, it.rarity) * 0.5;
  for (let l = 1; l < it.level; l++) {
    const c = levelCost(l, it.rarity);
    gold += c.gold;
    scrap += c.scrap;
  }
  return { scrap: Math.round(scrap), gold: Math.round(gold * 0.8) };
}

/** Rarity roll weights for drops, improving with sector. */
export function dropWeights(sector: number, crate: boolean): number[] {
  const s = Math.min(9, sector);
  if (crate) return [40 - s * 3, 38, 16 + s * 1.5, 5 + s * 1.2, 1 + s * 0.3, 0];
  return [72 - s * 5, 22 + s * 1.5, 5 + s * 2.4, 0.6 + s * 0.9, s * 0.15, 0];
}
